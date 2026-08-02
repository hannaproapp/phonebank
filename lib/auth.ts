import "server-only";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "crypto";
import { q, q1 } from "./db";
import { env } from "./env";

const COOKIE = "pb_session";
const secret = () =>
  new TextEncoder().encode(env("SESSION_SECRET") || "dev-only-insecure-secret-change-me");

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  is_super: boolean;
};

export async function createSession(userId: string) {
  const jwt = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  const c = await cookies();
  c.set(COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    // Secure by default. Deployments are HTTPS; COOKIE_SECURE=off is the escape
    // hatch for running over plain http locally. Deliberately not keyed off
    // NODE_ENV, so a change to how the host sets it can't silently drop the flag.
    secure: env("COOKIE_SECURE") !== "off",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const c = await cookies();
  c.delete(COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) {
    if (env("AUTH_DEBUG")) {
      const h = await headers();
      console.log(
        "[auth] no session cookie.",
        JSON.stringify({
          cookieNames: c.getAll().map((x) => x.name),
          rawCookieHeader: h.get("cookie"),
          host: h.get("host"),
          forwardedHost: h.get("x-forwarded-host"),
          forwardedProto: h.get("x-forwarded-proto"),
          origin: h.get("origin"),
          referer: h.get("referer"),
          nextAction: h.get("next-action") ? "yes" : "no",
          secFetchSite: h.get("sec-fetch-site"),
          secFetchMode: h.get("sec-fetch-mode"),
        }),
      );
    }
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, secret());
    const uid = payload.uid as string;
    const u = await q1<SessionUser>(
      `select id, email, name, is_super from users where id = $1`,
      [uid],
    );
    if (env("AUTH_DEBUG") && !u) console.log("[auth] jwt ok but no user row", uid);
    return u;
  } catch (e) {
    if (env("AUTH_DEBUG")) console.log("[auth] verify failed:", (e as Error).message);
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

/** Returns 'super' | 'admin' | 'volunteer' | null for a campaign. */
export async function campaignRole(user: SessionUser, campaignId: string) {
  if (user.is_super) return "super" as const;
  const m = await q1<{ role: string }>(
    `select role from campaign_members where campaign_id = $1 and user_id = $2`,
    [campaignId, user.id],
  );
  return (m?.role as "admin" | "volunteer" | undefined) ?? null;
}

export async function requireCampaignAdmin(user: SessionUser, campaignId: string) {
  const r = await campaignRole(user, campaignId);
  if (r !== "super" && r !== "admin") throw new Error("FORBIDDEN");
  return r;
}

export function makeToken() {
  return randomBytes(24).toString("base64url");
}

export async function issueLoginLink(email: string, baseUrl: string) {
  const clean = email.toLowerCase().trim();
  const user = await q1<{ id: string }>(`select id from users where email = $1`, [clean]);
  if (!user) return null;
  const token = makeToken();
  await q(
    `insert into login_tokens (token, user_id, expires_at) values ($1, $2, now() + interval '14 days')`,
    [token, user.id],
  );
  return `${baseUrl.replace(/\/$/, "")}/auth/${token}`;
}

export { sendLoginEmail } from "./mail";
