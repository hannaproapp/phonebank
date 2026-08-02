"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { issueLoginLink, sendLoginEmail } from "@/lib/auth";
import { env } from "@/lib/env";

export async function baseUrl() {
  const configured = env("APP_URL");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function requestLink(formData: FormData) {
  const email = String(formData.get("email") || "");
  const link = await issueLoginLink(email, await baseUrl());
  if (!link) redirect("/login?err=1");
  const res = await sendLoginEmail(email, link);
  if (res.sent) redirect("/login?sent=1");
  redirect(`/login?link=${encodeURIComponent(link)}`);
}
