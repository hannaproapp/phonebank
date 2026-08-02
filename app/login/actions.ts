"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { issueLoginLink, sendLoginEmail } from "@/lib/auth";
import { env } from "@/lib/env";

/** Hosts that mean "this container", never something a volunteer can open. */
function isInternalHost(host: string) {
  const name = host.split(":")[0].toLowerCase();
  return (
    name === "0.0.0.0" ||
    name === "::" ||
    name === "[::]" ||
    name === "127.0.0.1" ||
    name.endsWith(".railway.internal")
  );
}

/**
 * Public origin used to build magic links.
 *
 * A link is useless if it points at the container's bind address, and the
 * volunteer only finds out after the email has been sent, so every source here
 * is checked for internal hosts before it is trusted. Order: explicit APP_URL,
 * then the platform's own public domain, then request headers.
 */
export async function baseUrl() {
  const configured = (env("APP_URL") || "").trim().replace(/\/$/, "");
  if (configured) {
    const withProto = /^https?:\/\//.test(configured) ? configured : `https://${configured}`;
    try {
      if (!isInternalHost(new URL(withProto).host)) return withProto;
    } catch {
      // Malformed APP_URL: fall through rather than emitting a broken link.
    }
  }

  const railway = (env("RAILWAY_PUBLIC_DOMAIN") || "").trim();
  if (railway && !isInternalHost(railway)) return `https://${railway}`;

  const h = await headers();
  const forwarded = h.get("x-forwarded-host") || "";
  const plain = h.get("host") || "";
  const host = [forwarded, plain].find((c) => c && !isInternalHost(c)) || "localhost:3000";
  const local = host.startsWith("localhost");
  const proto = h.get("x-forwarded-proto") || (local ? "http" : "https");
  return `${proto}://${host}`;
}

export async function requestLink(formData: FormData) {
  const email = String(formData.get("email") || "");
  const link = await issueLoginLink(email, await baseUrl());
  if (!link) redirect("/login?err=1");
  const res = await sendLoginEmail(email, link);
  if (res.sent) redirect("/login?sent=1");
  const err = res.error ? `&mailerr=${encodeURIComponent(res.error)}` : "";
  redirect(`/login?link=${encodeURIComponent(link)}${err}`);
}
