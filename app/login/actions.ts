"use server";

import { redirect } from "next/navigation";
import { issueLoginLink, sendLoginEmail } from "@/lib/auth";
import { publicBaseUrl } from "@/lib/baseUrl";

export async function baseUrl() {
  return publicBaseUrl();
}

export async function requestLink(formData: FormData) {
  const email = String(formData.get("email") || "");
  const link = await issueLoginLink(email, await publicBaseUrl());
  if (!link) redirect("/login?err=1");
  const res = await sendLoginEmail(email, link);
  if (res.sent) redirect("/login?sent=1");
  const err = res.error ? `&mailerr=${encodeURIComponent(res.error)}` : "";
  redirect(`/login?link=${encodeURIComponent(link)}${err}`);
}
