"use server";

import { redirect } from "next/navigation";
import { issueLoginLink, sendLoginEmail } from "@/lib/auth";
import { publicBaseUrl } from "@/lib/baseUrl";
import { env } from "@/lib/env";

export async function baseUrl() {
  return publicBaseUrl();
}

export async function requestLink(formData: FormData) {
  const email = String(formData.get("email") || "");
  const link = await issueLoginLink(email, await publicBaseUrl());
  if (!link) redirect("/login?err=1");

  const res = await sendLoginEmail(email, link);
  if (res.sent) redirect("/login?sent=1");

  // Anyone can type anyone's address here, so a failed send must not reveal the
  // link: that would be a way to sign in as any user whose email you can guess.
  // LOGIN_SHOW_LINK=on exists only to bootstrap the first admin before mail works.
  if (env("LOGIN_SHOW_LINK") === "on") {
    redirect(`/login?link=${encodeURIComponent(link)}`);
  }
  redirect("/login?undelivered=1");
}
