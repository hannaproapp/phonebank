import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, campaignRole } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { CANVASSING_FOR } from "@/lib/fields";
import { Shell, Field } from "../../components/Shell";
import { MyCallsLink } from "../../components/MyCallsLink";

export const dynamic = "force-dynamic";

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{
    sent?: string;
    invited?: string;
    link?: string;
    uploaderr?: string;
    mailerr?: string;
  }>;
}) {
  const { campaignId } = await params;
  const sp = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/login");
  const role = await campaignRole(user, campaignId);
  if (role !== "super" && role !== "admin") redirect("/call");

  const campaign = await q1<{
    id: string;
    name: string;
    candidate_name: string;
    canvassing_for: string;
    lookup_column: string;
  }>(`select * from campaigns where id = $1`, [campaignId]);
  if (!campaign) redirect("/admin");

  const lists = await q<{
    id: string;
    name: string;
    active: boolean;
    total: number;
    done: number;
    pending_export: number;
  }>(
    `select l.id, l.name, l.active,
       (select count(*) from contacts c where c.list_id = l.id) as total,
       (select count(*) from contacts c where c.list_id = l.id and c.status = 'done') as done,
       (select count(*) from call_results r where r.list_id = l.id and r.exported_at is null) as pending_export
     from lists l where l.campaign_id = $1 order by l.created_at desc`,
    [campaignId],
  );

  const members = await q<{ user_id: string; email: string; name: string; role: string }>(
    `select u.id as user_id, u.email, u.name, m.role
     from campaign_members m join users u on u.id = m.user_id
     where m.campaign_id = $1 order by m.role, u.name, u.email`,
    [campaignId],
  );

  return (
    <Shell
      title={campaign.name}
      back={{ href: "/admin", label: "Campaigns" }}
      right={<MyCallsLink />}
    >
      {sp.uploaderr === "nocontactid" && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          That file has no Contact ID column. Add Contact ID to the Smart List view in HannaPro, export
          again, and re-upload.
        </p>
      )}
      {sp.uploaderr === "norows" && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          No usable rows. Every row needs a Contact ID and a phone number.
        </p>
      )}
      {sp.link && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <p className="font-semibold">
            Link for {sp.invited}
            {sp.sent === "1" ? " (emailed)" : " (not emailed)"}
          </p>
          {sp.mailerr && (
            <p className="mt-1 text-xs text-red-700">Email failed: {sp.mailerr}</p>
          )}
          <p className="mt-2 break-all rounded bg-slate-50 p-2 font-mono text-xs">{sp.link}</p>
          <p className="mt-2 text-xs text-slate-500">
            Works once. Text it to them if the email doesn&apos;t arrive.
          </p>
        </div>
      )}

      <section>
        <h2 className="label mb-2">Call lists</h2>
        <div className="space-y-3">
          {lists.map((l) => (
            <Link key={l.id} href={`/admin/${campaignId}/list/${l.id}`} className="card block p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{l.name}</span>
                {!l.active && <span className="text-xs text-slate-400">inactive</span>}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {l.done} of {l.total} called
                {Number(l.pending_export) > 0 && (
                  <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                    {l.pending_export} ready to export
                  </span>
                )}
              </div>
              <div className="mt-2 h-1.5 w-full rounded bg-slate-100">
                <div
                  className="h-1.5 rounded bg-blue-600"
                  style={{
                    width: `${Number(l.total) ? (Number(l.done) / Number(l.total)) * 100 : 0}%`,
                  }}
                />
              </div>
            </Link>
          ))}
          {lists.length === 0 && <p className="text-sm text-slate-500">No lists yet.</p>}
        </div>
      </section>

      <form method="post" action="/api/do" encType="multipart/form-data" className="card mt-6 space-y-4 p-5">
        <input type="hidden" name="op" value="createList" />
        <h2 className="font-semibold">Upload a call list</h2>
        <input type="hidden" name="campaign_id" value={campaignId} />
        <Field label="List name">
          <input className="input" name="name" required placeholder="Ward 3 supporters, week 1" />
        </Field>
        <Field label="Canvassing for">
          <select className="input" name="canvassing_for" defaultValue={campaign.canvassing_for}>
            {CANVASSING_FOR.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field
          label="CSV export from the Smart List"
          hint="Must include a Contact ID column and a phone column. Rows without both are skipped."
        >
          <input className="input" type="file" name="file" accept=".csv,text/csv" required />
        </Field>
        <Field label="Call script" hint="Shown to the volunteer on every contact.">
          <textarea
            className="input min-h-32"
            name="script"
            placeholder={`Hi, is this [name]? My name is ___ and I'm a volunteer with ${campaign.candidate_name || "the campaign"}...`}
          />
        </Field>
        <button className="btn btn-primary" type="submit">
          Upload list
        </button>
      </form>

      <section className="mt-8">
        <h2 className="label mb-2">People</h2>
        <div className="card divide-y">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{m.name || m.email}</div>
                <div className="truncate text-xs text-slate-500">
                  {m.email} Â· {m.role}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <form method="post" action="/api/do">
                  <input type="hidden" name="op" value="sendMemberLink" />
                  <input type="hidden" name="campaign_id" value={campaignId} />
                  <input type="hidden" name="email" value={m.email} />
                  <button className="btn text-sm">Send link</button>
                </form>
                <form method="post" action="/api/do">
                  <input type="hidden" name="op" value="removeMember" />
                  <input type="hidden" name="campaign_id" value={campaignId} />
                  <input type="hidden" name="user_id" value={m.user_id} />
                  <button className="btn text-sm text-red-600">Remove</button>
                </form>
              </div>
            </div>
          ))}
          {members.length === 0 && (
            <p className="p-3 text-sm text-slate-500">Nobody added yet.</p>
          )}
        </div>

        <form method="post" action="/api/do" className="card mt-4 space-y-4 p-5">
          <input type="hidden" name="op" value="addMember" />
          <h3 className="font-semibold">Add a person</h3>
          <input type="hidden" name="campaign_id" value={campaignId} />
          <Field label="Name">
            <input className="input" name="name" placeholder="Jane Doe" />
          </Field>
          <Field label="Email">
            <input className="input" type="email" name="email" required />
          </Field>
          <Field label="Role">
            <select className="input" name="role" defaultValue="volunteer">
              <option value="volunteer">Volunteer</option>
              <option value="admin">Campaign admin</option>
            </select>
          </Field>
          <button className="btn btn-primary" type="submit">
            Add
          </button>
        </form>
      </section>

      <details className="mt-8">
        <summary className="label cursor-pointer">Campaign settings</summary>
        <form method="post" action="/api/do" className="card mt-3 space-y-4 p-5">
          <input type="hidden" name="op" value="updateCampaign" />
          <input type="hidden" name="campaign_id" value={campaignId} />
          <Field label="Campaign name">
            <input className="input" name="name" defaultValue={campaign.name} />
          </Field>
          <Field label="Candidate name">
            <input className="input" name="candidate_name" defaultValue={campaign.candidate_name} />
          </Field>
          <Field label="Default canvassing for">
            <select className="input" name="canvassing_for" defaultValue={campaign.canvassing_for}>
              {CANVASSING_FOR.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Contacts lookup column"
            hint="First column of the export. Must match the Canvassing object's lookup-to-Contacts field name exactly."
          >
            <input className="input" name="lookup_column" defaultValue={campaign.lookup_column} />
          </Field>
          <button className="btn btn-primary" type="submit">
            Save
          </button>
        </form>
      </details>
    </Shell>
  );
}
