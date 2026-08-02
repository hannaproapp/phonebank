import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, campaignRole } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { CANVASSING_FOR } from "@/lib/fields";
import { EXPORT_FILLED_COLUMNS } from "@/lib/exportCsv";
import { Shell, Field } from "../../../../components/Shell";
import { MyCallsLink } from "../../../../components/MyCallsLink";

export const dynamic = "force-dynamic";

export default async function ListPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string; listId: string }>;
  searchParams: Promise<{ loaded?: string; nophone?: string; noid?: string }>;
}) {
  const { campaignId, listId } = await params;
  const sp = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/login");
  const role = await campaignRole(user, campaignId);
  if (role !== "super" && role !== "admin") redirect("/call");

  const list = await q1<{
    id: string;
    name: string;
    script: string;
    canvassing_for: string;
    active: boolean;
  }>(`select * from lists where id = $1 and campaign_id = $2`, [listId, campaignId]);
  if (!list) redirect(`/admin/${campaignId}`);

  const campaign = await q1<{ lookup_column: string }>(
    `select lookup_column from campaigns where id = $1`,
    [campaignId],
  );

  const stats = await q1<{
    total: number;
    done: number;
    unassigned: number;
    pending_export: number;
    exported: number;
  }>(
    `select
       (select count(*) from contacts where list_id=$1) as total,
       (select count(*) from contacts where list_id=$1 and status='done') as done,
       (select count(*) from contacts where list_id=$1 and assigned_user_id is null and status='open') as unassigned,
       (select count(*) from call_results where list_id=$1 and exported_at is null) as pending_export,
       (select count(*) from call_results where list_id=$1 and exported_at is not null) as exported`,
    [listId],
  );

  const volunteers = await q<{ user_id: string; name: string; email: string }>(
    `select u.id as user_id, u.name, u.email
     from campaign_members m join users u on u.id = m.user_id
     where m.campaign_id = $1 order by u.name, u.email`,
    [campaignId],
  );

  const perVolunteer = await q<{
    user_id: string;
    name: string;
    email: string;
    assigned: number;
    called: number;
    contacted: number;
  }>(
    `select u.id as user_id, u.name, u.email,
       count(c.id) as assigned,
       count(c.id) filter (where c.status = 'done') as called,
       (select count(*) from call_results r where r.list_id = $1 and r.user_id = u.id and r.disposition = 'Voter Contacted') as contacted
     from contacts c join users u on u.id = c.assigned_user_id
     where c.list_id = $1
     group by u.id, u.name, u.email
     order by called desc, u.name`,
    [listId],
  );

  const pct = Number(stats!.total) ? (Number(stats!.done) / Number(stats!.total)) * 100 : 0;

  return (
    <Shell
      title={list.name}
      back={{ href: `/admin/${campaignId}`, label: "Campaign" }}
      right={<MyCallsLink />}
    >
      {sp.loaded && (
        <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          Loaded {sp.loaded} contacts.
          {Number(sp.nophone) > 0 && <> Skipped {sp.nophone} with no phone number.</>}
          {Number(sp.noid) > 0 && <> Skipped {sp.noid} with no Contact ID.</>}
        </p>
      )}

      <section className="card p-5">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold">{stats!.total}</div>
            <div className="text-xs text-slate-500">contacts</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{stats!.done}</div>
            <div className="text-xs text-slate-500">called</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{stats!.unassigned}</div>
            <div className="text-xs text-slate-500">unassigned</div>
          </div>
        </div>
        <div className="mt-4 h-2 w-full rounded bg-slate-100">
          <div className="h-2 rounded bg-blue-600" style={{ width: `${pct}%` }} />
        </div>
      </section>

      <section className="card mt-6 p-5">
        <h2 className="font-semibold">Export to HannaPro</h2>
        <p className="mt-1 text-sm text-slate-500">
          {stats!.pending_export} result{Number(stats!.pending_export) === 1 ? "" : "s"} not yet
          exported. {stats!.exported} already exported.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            className="btn btn-primary"
            href={`/admin/${campaignId}/list/${listId}/export?mode=new`}
          >
            Download new results
          </a>
          <a className="btn" href={`/admin/${campaignId}/list/${listId}/export?mode=all`}>
            Download everything
          </a>
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold text-slate-500">
            What the file contains
          </summary>
          <p className="mt-2 text-xs text-slate-500">
            Full Canvassing template header row. First column is{" "}
            <code className="rounded bg-slate-100 px-1">{campaign!.lookup_column}</code>, holding
            the HannaPro Contact ID for the lookup. Populated columns:{" "}
            {EXPORT_FILLED_COLUMNS.join(", ")}. All other template columns are blank.
          </p>
        </details>
      </section>

      <section className="mt-6">
        <h2 className="label mb-2">Volunteers on this list</h2>
        <div className="card divide-y">
          {perVolunteer.map((v) => (
            <div key={v.user_id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{v.name || v.email}</div>
                <div className="text-xs text-slate-500">
                  {v.called}/{v.assigned} called · {v.contacted} reached
                </div>
              </div>
              <form method="post" action="/api/do" className="shrink-0">
                <input type="hidden" name="op" value="unassignVolunteer" />
                <input type="hidden" name="list_id" value={listId} />
                <input type="hidden" name="user_id" value={v.user_id} />
                <button className="btn text-sm">Return unworked</button>
              </form>
            </div>
          ))}
          {perVolunteer.length === 0 && (
            <p className="p-3 text-sm text-slate-500">Nobody assigned yet.</p>
          )}
        </div>

        <form method="post" action="/api/do" className="card mt-4 space-y-4 p-5">
          <input type="hidden" name="op" value="assignContacts" />
          <h3 className="font-semibold">Assign contacts</h3>
          <input type="hidden" name="list_id" value={listId} />
          <Field label="Volunteer">
            <select className="input" name="user_id" required>
              {volunteers.map((v) => (
                <option key={v.user_id} value={v.user_id}>
                  {v.name || v.email}
                </option>
              ))}
            </select>
          </Field>
          <Field label="How many" hint="Takes the next unassigned contacts in list order.">
            <input className="input" type="number" name="count" defaultValue={50} min={1} />
          </Field>
          <button className="btn btn-primary" type="submit">
            Assign
          </button>
          {volunteers.length === 0 && (
            <p className="text-sm text-slate-500">
              <Link className="text-blue-700" href={`/admin/${campaignId}`}>
                Add volunteers to the campaign first.
              </Link>
            </p>
          )}
        </form>
      </section>

      <details className="mt-8">
        <summary className="label cursor-pointer">List settings</summary>
        <form method="post" action="/api/do" className="card mt-3 space-y-4 p-5">
          <input type="hidden" name="op" value="updateList" />
          <input type="hidden" name="list_id" value={listId} />
          <Field label="List name">
            <input className="input" name="name" defaultValue={list.name} />
          </Field>
          <Field label="Canvassing for">
            <select className="input" name="canvassing_for" defaultValue={list.canvassing_for}>
              {CANVASSING_FOR.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Call script">
            <textarea className="input min-h-40" name="script" defaultValue={list.script} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={list.active} /> Active (volunteers
            can call it)
          </label>
          <button className="btn btn-primary" type="submit">
            Save
          </button>
        </form>
        <form method="post" action="/api/do" className="mt-3">
          <input type="hidden" name="op" value="deleteList" />
          <input type="hidden" name="list_id" value={listId} />
          <button className="btn text-sm text-red-600">Delete list and all results</button>
        </form>
      </details>
    </Shell>
  );
}
