import "server-only";
import { headers } from "next/headers";
import { env } from "./env";

/** Hosts that mean "this container", never something a browser can reach. */
function isInternalHost(host: string) {
  const name = host.split(":")[0].toLowerCase();
  return (
    name === "0.0.0.0" ||
    name === "::" ||
    name === "[::]" ||
    name === "127.0.0.1" ||
    name === "localhost" ||
    name.endsWith(".railway.internal")
  );
}

/**
 * The origin a browser can actually reach.
 *
 * Needed for magic links and for redirects out of Route Handlers. Do not reach
 * for `request.url` in a route handler: behind a proxy it is the container's
 * own bind address, so `new URL("/", req.url)` sends the user to 0.0.0.0:3000.
 *
 * Order: explicit APP_URL, the platform's public domain, then request headers.
 * Every candidate is screened for internal hosts before it is trusted.
 */
export async function publicBaseUrl(): Promise<string> {
  const configured = (env("APP_URL") || "").trim().replace(/\/$/, "");
  if (configured) {
    const withProto = /^https?:\/\//.test(configured) ? configured : `https://${configured}`;
    try {
      if (!isInternalHost(new URL(withProto).host)) return withProto;
    } catch {
      // Malformed APP_URL: fall through rather than emit a broken link.
    }
  }

  const platform = (env("RAILWAY_PUBLIC_DOMAIN") || "").trim();
  if (platform && !isInternalHost(platform)) return `https://${platform}`;

  const h = await headers();
  const candidates = [h.get("x-forwarded-host") || "", h.get("host") || ""];
  const host = candidates.find((c) => c && !isInternalHost(c));
  if (!host) {
    // Local development, where localhost is the correct answer rather than a bug.
    const fallback = candidates.find(Boolean) || "localhost:3000";
    return `http://${fallback}`;
  }
  const proto = h.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}
