import "server-only";
import { cookies } from "next/headers";
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
    // Railway serves HTTPS, so secure cookies are the default in production.
    // COOKIE_SECURE=off exists for running a production build over plain http locally.
    secure: env("COOKIE_SECURE") === "off" ? false : env("NODE_ENV") === "production",
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
    if (env("AUTH_DEBUG")) console.log("[auth] no cookie; names:", c.getAll().map((x) => x.name));
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
    `insert into login_tokens (token, user_id, expires_at) values ($1, $2, now() + interval '30 days')`,
    [token, user.id],
  );
  return `${baseUrl.replace(/\/$/, "")}/auth/${token}`;
}

export async function sendLoginEmail(email: string, link: string, campaign?: string) {
  const key = env("RESEND_API_KEY");
  if (!key) return { sent: false as const, link };
  const from = env("RESEND_FROM") || "Phone Bank <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: campaign ? `Your ${campaign} phone bank link` : "Your phone bank link",
      html: `<p>Tap to open your call list. This link is yours, don't forward it.</p>
             <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none">Open my call list</a></p>
             <p style="color:#666;font-size:12px">${link}</p>`,
    }),
  });
  return { sent: res.ok as boolean, link };
}
