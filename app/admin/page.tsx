import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { Shell, Field } from "../components/Shell";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const campaigns = await q<{
    id: string;
    name: string;
    candidate_name: string;
    lists: number;
    volunteers: number;
  }>(
    user.is_super
      ? `select c.id, c.name, c.candidate_name,
           (select count(*) from lists l where l.campaign_id = c.id) as lists,
           (select count(*) from campaign_members m where m.campaign_id = c.id and m.role='volunteer') as volunteers
         from campaigns c order by c.created_at desc`
      : `select c.id, c.name, c.candidate_name,
           (select count(*) from lists l where l.campaign_id = c.id) as lists,
           (select count(*) from campaign_members m where m.campaign_id = c.id and m.role='volunteer') as volunteers
         from campaigns c
         join campaign_members cm on cm.campaign_id = c.id and cm.user_id = $1 and cm.role = 'admin'
         order by c.created_at desc`,
    user.is_super ? [] : [user.id],
  );

  if (!user.is_super && campaigns.length === 0) redirect("/call");

  return (
    <Shell
      title="Campaigns"
      right={<span className="text-xs text-slate-500">{user.email}</span>}
    >
      <div className="space-y-3">
        {campaigns.map((c) => (
          <Link key={c.id} href={`/admin/${c.id}`} className="card block p-4">
            <div className="font-semibold">{c.name}</div>
            <div className="text-sm text-slate-500">
              {c.candidate_name && <>{c.candidate_name} · </>}
              {c.lists} list{Number(c.lists) === 1 ? "" : "s"} · {c.volunteers} volunteer
              {Number(c.volunteers) === 1 ? "" : "s"}
            </div>
          </Link>
        ))}
        {campaigns.length === 0 && (
          <p className="text-sm text-slate-500">No campaigns yet.</p>
        )}
      </div>

      {user.is_super && (
        <form method="post" action="/api/do" className="card mt-8 space-y-4 p-5">
          <input type="hidden" name="op" value="createCampaign" />
          <h2 className="font-semibold">New campaign</h2>
          <Field label="Campaign name">
            <input className="input" name="name" required placeholder="Vaziri for Cranston" />
          </Field>
          <Field label="Candidate name">
            <input className="input" name="candidate_name" placeholder="Emilia Vaziri" />
          </Field>
          <Field
            label="Contacts lookup column"
            hint="The header name of the Canvassing object's lookup field that points at Contacts. Ask the dev team if unsure."
          >
            <input className="input" name="lookup_column" defaultValue="Contact" />
          </Field>
          <button className="btn btn-primary" type="submit">
            Create campaign
          </button>
        </form>
      )}
    </Shell>
  );
}
