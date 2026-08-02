import { NextRequest, NextResponse } from "next/server";
import { runOp } from "@/lib/ops";
import { publicBaseUrl } from "@/lib/baseUrl";

export const dynamic = "force-dynamic";

/**
 * Every mutating form in the app posts here natively.
 *
 * Server Actions submit over fetch and, in production, that request arrived with
 * no Cookie header, so authentication failed on every mutation while page
 * renders worked fine. A native form post is an ordinary navigation and carries
 * cookies everywhere.
 *
 * The 303 makes the browser follow up with a GET, so a refresh never resubmits.
 */
export async function POST(req: NextRequest) {
  const base = await publicBaseUrl();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.redirect(`${base}/`, 303);
  }

  const op = String(form.get("op") ?? "");
  try {
    const to = await runOp(op, form);
    return NextResponse.redirect(`${base}${to}`, 303);
  } catch (e) {
    const message = (e as Error).message;
    if (message === "UNAUTHENTICATED") return NextResponse.redirect(`${base}/login`, 303);
    if (message === "FORBIDDEN") return NextResponse.redirect(`${base}/`, 303);
    console.error(`[op:${op}]`, e);
    throw e;
  }
}
