import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { telHref, prettyPhone } from "@/lib/csvMap";
import { Shell } from "../../components/Shell";
import { CallForm } from "./CallForm";

export const dynamic = "force-dynamic";

export default async function CallList({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");

  const list = await q1<{
    id: string;
    name: string;
    script: string;
    campaign: string;
    candidate: string;
    calling_start: number;
    calling_end: number;
  }>(
    `select l.id, l.name, l.script, c.name as campaign, c.candidate_name as candidate,
            c.calling_start, c.calling_end
     from lists l join campaigns c on c.id = l.campaign_id
     where l.id = $1 and l.active = true`,
    [listId],
  );
  if (!list) redirect("/call");

  const counts = await q1<{ assigned: number; remaining: number }>(
    `select count(*) as assigned, count(*) filter (where status='open') as remaining
     from contacts where list_id = $1 and assigned_user_id = $2`,
    [listId, user.id],
  );
  if (!counts || Number(counts.assigned) === 0) redirect("/call");

  const contact = await q1<{
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    city: string;
    voter_id: string;
  }>(
    `select id, first_name, last_name, phone, city, voter_id
     from contacts
     where list_id = $1 and assigned_user_id = $2 and status = 'open'
     order by row_no limit 1`,
    [listId, user.id],
  );

  const done = Number(counts.assigned) - Number(counts.remaining);

  if (!contact) {
    return (
      <Shell title="All done" back={{ href: "/call", label: "My lists" }}>
        <div className="card p-6 text-center">
          <p className="text-lg font-semibold">You finished this list.</p>
          <p className="mt-1 text-sm text-slate-500">
            {done} call{done === 1 ? "" : "s"} logged. Thank you.
          </p>
          <Link href="/call" className="btn btn-primary btn-lg mt-5">
            Back to my lists
          </Link>
        </div>
      </Shell>
    );
  }

  const name = `${contact.first_name} ${contact.last_name}`.trim() || "Voter";

  return (
    <Shell title={list.name} back={{ href: "/call", label: "My lists" }}>
      <p className="-mt-3 mb-4 text-sm text-slate-500">
        {done} of {counts.assigned} done · {counts.remaining} left
      </p>

      <section className="card p-5">
        <div className="text-xl font-bold">{name}</div>
        {contact.city && <div className="text-sm text-slate-500">{contact.city}</div>}
        <a href={telHref(contact.phone)} className="btn btn-primary btn-lg mt-4">
          Call {prettyPhone(contact.phone)}
        </a>
        <p className="mt-2 text-center text-xs text-slate-400">
          Opens your phone. Your own number will show as caller ID.
        </p>
      </section>

      {list.script && (
        <details open className="card mt-4 p-5">
          <summary className="label cursor-pointer">Script</summary>
          <div className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">
            {list.script.replace(/\[name\]/gi, name)}
          </div>
        </details>
      )}

      <div className="mt-6">
        {/* key forces a fresh form per contact so no answer carries over to the next call */}
        <CallForm key={contact.id} contactId={contact.id} candidateName={list.candidate} />
      </div>
    </Shell>
  );
}
