import "server-only";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { q1 } from "@/lib/db";

/**
 * Header link from the admin side back to the volunteer side.
 *
 * An admin who assigns a block to themselves has no way to reach /call from
 * any admin page, so the calling screen is unreachable without typing the URL.
 * Renders nothing for admins with no assignments, so it stays out of the way
 * for anyone who only administers.
 */
export async function MyCallsLink() {
  const user = await currentUser();
  if (!user) return null;

  const row = await q1<{ assigned: string; remaining: string }>(
    `select count(*) as assigned,
            count(*) filter (where c.status = 'open') as remaining
       from contacts c
       join lists l on l.id = c.list_id and l.active = true
      where c.assigned_user_id = $1`,
    [user.id],
  );

  const assigned = Number(row?.assigned ?? 0);
  if (!assigned) return null;
  const remaining = Number(row?.remaining ?? 0);

  return (
    <Link
      href="/call"
      className="btn"
      style={{ padding: "6px 12px", fontSize: 14 }}
    >
      My calls
      {remaining > 0 && (
        <span className="rounded bg-blue-600 px-1.5 py-0.5 text-xs font-bold text-white">
          {remaining}
        </span>
      )}
    </Link>
  );
}
