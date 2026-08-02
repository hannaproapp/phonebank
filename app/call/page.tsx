import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { Shell } from "../components/Shell";
import { q1 } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CallHome() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const lists = await q<{
    id: string;
    name: string;
    campaign: string;
    candidate: string;
    assigned: number;
    remaining: number;
  }>(
    `select l.id, l.name, c.name as campaign, c.candidate_name as candidate,
       count(ct.id) as assigned,
       count(ct.id) filter (where ct.status = 'open') as remaining
     from contacts ct
     join lists l on l.id = ct.list_id and l.active = true
     join campaigns c on c.id = l.campaign_id
     where ct.assigned_user_id = $1
     group by l.id, l.name, c.name, c.candidate_name
     order by remaining desc, l.name`,
    [user.id],
  );

  // An admin who assigned themselves a block lands here with no way back.
  const isAdmin =
    user.is_super ||
    Boolean(
      await q1(
        `select 1 from campaign_members where user_id = $1 and role = 'admin' limit 1`,
        [user.id],
      ),
    );

  return (
    <Shell
      title={`Hi ${user.name?.split(" ")[0] || "there"}`}
      right={
        isAdmin ? (
          <Link href="/admin" className="btn" style={{ padding: "6px 12px", fontSize: 14 }}>
            Admin
          </Link>
        ) : undefined
      }
    >
      <p className="-mt-3 mb-5 text-sm text-slate-500">
        {lists.some((l) => Number(l.remaining) > 0)
          ? "Tap a list to start calling."
          : "Nothing to call right now."}
      </p>

      <div className="space-y-3">
        {lists.map((l) => {
          const done = Number(l.assigned) - Number(l.remaining);
          const pct = Number(l.assigned) ? (done / Number(l.assigned)) * 100 : 0;
          return (
            <Link key={l.id} href={`/call/${l.id}`} className="card block p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {l.campaign}
              </div>
              <div className="mt-0.5 font-semibold">{l.name}</div>
              <div className="mt-1 text-sm text-slate-500">
                {Number(l.remaining) > 0 ? (
                  <span className="font-medium text-blue-700">{l.remaining} left to call</span>
                ) : (
                  <span className="text-green-700">All done, nice work</span>
                )}
                <span> · {done} of {l.assigned} complete</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded bg-slate-100">
                <div className="h-1.5 rounded bg-blue-600" style={{ width: `${pct}%` }} />
              </div>
            </Link>
          );
        })}
        {lists.length === 0 && (
          <div className="card p-5 text-sm text-slate-500">
            You have no call lists assigned yet. Your campaign admin will assign one.
          </div>
        )}
      </div>
    </Shell>
  );
}
