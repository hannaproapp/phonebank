import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await destroySession();
  return NextResponse.redirect(new URL("/login", req.url));
}
