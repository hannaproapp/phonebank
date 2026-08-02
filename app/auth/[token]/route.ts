import { NextRequest, NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { createSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const row = await q1<{ user_id: string }>(
    `select user_id from login_tokens where token = $1 and expires_at > now()`,
    [token],
  );
  if (!row) {
    return NextResponse.redirect(new URL("/login?err=1", req.url));
  }
  await createSession(row.user_id);
  return NextResponse.redirect(new URL("/", req.url));
}
