import { NextRequest, NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { currentUser, campaignRole } from "@/lib/auth";
import { buildCanvassingCsv, type ExportRow } from "@/lib/exportCsv";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ campaignId: string; listId: string }> },
) {
  const { campaignId, listId } = await ctx.params;
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const role = await campaignRole(user, campaignId);
  if (role !== "super" && role !== "admin") return new NextResponse("Forbidden", { status: 403 });

  const mode = req.nextUrl.searchParams.get("mode") === "all" ? "all" : "new";

  const campaign = await q1<{ lookup_column: string; name: string }>(
    `select lookup_column, name from campaigns where id = $1`,
    [campaignId],
  );
  const list = await q1<{ name: string; canvassing_for: string }>(
    `select name, canvassing_for from lists where id = $1 and campaign_id = $2`,
    [listId, campaignId],
  );
  if (!campaign || !list) return new NextResponse("Not found", { status: 404 });

  const rows = await q<any>(
    `select r.id, r.disposition, r.candidate_awareness, r.support_level, r.vote_plan,
            r.phone_correct, r.new_phone, r.notes, r.created_at,
            c.ghl_contact_id, c.first_name, c.last_name,
            u.name as volunteer_name, u.email as volunteer_email
     from call_results r
     join contacts c on c.id = r.contact_id
     join users u on u.id = r.user_id
     where r.list_id = $1 ${mode === "new" ? "and r.exported_at is null" : ""}
     order by r.created_at`,
    [listId],
  );

  const exportRows: ExportRow[] = rows.map((r) => ({
    ghl_contact_id: r.ghl_contact_id,
    first_name: r.first_name,
    last_name: r.last_name,
    disposition: r.disposition,
    candidate_awareness: r.candidate_awareness,
    support_level: r.support_level,
    vote_plan: r.vote_plan,
    phone_correct: r.phone_correct,
    new_phone: r.new_phone,
    notes: r.notes,
    created_at: new Date(r.created_at),
    volunteer_name: r.volunteer_name || r.volunteer_email,
    volunteer_email: r.volunteer_email,
    canvassing_for: list.canvassing_for,
  }));

  const csv = buildCanvassingCsv(exportRows, campaign.lookup_column);

  if (mode === "new" && rows.length > 0) {
    await q(`update call_results set exported_at = now() where id = any($1::uuid[])`, [
      rows.map((r) => r.id),
    ]);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const slug = `${campaign.name}-${list.name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="canvassing-${slug}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
