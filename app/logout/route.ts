import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { publicBaseUrl } from "@/lib/baseUrl";

export const dynamic = "force-dynamic";

export async function GET() {
  await destroySession();
  return NextResponse.redirect(`${await publicBaseUrl()}/login`);
}
