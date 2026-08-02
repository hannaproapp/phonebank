import { NextRequest, NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { publicBaseUrl } from "@/lib/baseUrl";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  // Single-use: the update is the claim. Two requests race, one wins, the loser
  // gets no row. A leaked or forwarded link is dead once it has been opened.
  const row = await q1<{ user_id: string }>(
    `update login_tokens set used_at = now()
     where token = $1 and used_at is null and expires_at > now()
     returning user_id`,
    [token],
  );

  // Redirect targets come from the public origin, never from request.url, which
  // behind a proxy is the container's own bind address.
  const base = await publicBaseUrl();
  if (!row) return NextResponse.redirect(`${base}/login?used=1`);

  await createSession(row.user_id);
  return NextResponse.redirect(`${base}/`);
}
