import "server-only";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { env } from "./env";

export type SendResult = { sent: boolean; link: string; error?: string };

function loginEmailHtml(link: string, campaign?: string) {
  const who = campaign ? `the ${campaign} campaign` : "the campaign";
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px">
    <h1 style="margin:0 0 8px;font-size:20px">Your call list is ready</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#475569">
      You're signed up to make calls for ${who}. Tap below on your phone to open your list.
    </p>
    <a href="${link}" style="display:inline-block;padding:14px 22px;background:#1d4ed8;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:16px">Open my call list</a>
    <p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#64748b">
      This link works once and is just for you, so please don't forward it. If it stops working,
      ask your campaign admin to send a new one.
    </p>
    <p style="margin:14px 0 0;font-size:11px;color:#94a3b8;word-break:break-all">${link}</p>
  </div>
</body></html>`;
}

function loginEmailText(link: string, campaign?: string) {
  const who = campaign ? `the ${campaign} campaign` : "the campaign";
  return [
    `Your call list is ready.`,
    ``,
    `You're signed up to make calls for ${who}. Open your list here:`,
    link,
    ``,
    `This link works once and is just for you, so please don't forward it.`,
  ].join("\n");
}

/**
 * Sends the magic link.
 *
 * Three backends, tried in order. The HTTPS ones come first because most PaaS
 * hosts (Railway included) block outbound SMTP ports entirely.
 *
 *   1. SendGrid — set SENDGRID_API_KEY and MAIL_FROM. MAIL_FROM must be an
 *      address you verified under Single Sender Verification, which needs no
 *      DNS changes.
 *   2. Resend — set RESEND_API_KEY and MAIL_FROM. Requires a verified domain.
 *   3. SMTP — set SMTP_HOST/PORT/USER/PASS. Only works where outbound SMTP is
 *      permitted, which rules out most managed hosts.
 *
 * With none configured, the caller shows the link on screen for the admin to
 * pass along by hand.
 */

function parseFrom(value: string): { email: string; name?: string } {
  const m = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || undefined, email: m[2].trim() };
  return { email: value.trim() };
}
export async function sendLoginEmail(
  to: string,
  link: string,
  campaign?: string,
): Promise<SendResult> {
  const subject = campaign ? `Your ${campaign} call list` : "Your phone bank call list";
  const text = loginEmailText(link, campaign);
  const html = loginEmailHtml(link, campaign);

  const sendgridKey = env("SENDGRID_API_KEY");
  if (sendgridKey) {
    const configured = env("MAIL_FROM");
    if (!configured) {
      return { sent: false, link, error: "MAIL_FROM is not set" };
    }
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: parseFrom(configured),
          subject,
          content: [
            { type: "text/plain", value: text },
            { type: "text/html", value: html },
          ],
        }),
      });
      if (res.ok) return { sent: true, link };
      // SendGrid puts the useful part in the body, not the status line. The
      // common failure is a from-address that was never verified.
      const body = await res.text();
      const detail = body.slice(0, 300) || `HTTP ${res.status}`;
      console.error("[mail] sendgrid rejected:", res.status, detail);
      return { sent: false, link, error: `SendGrid ${res.status}: ${detail}` };
    } catch (e) {
      return { sent: false, link, error: (e as Error).message };
    }
  }

  const host = env("SMTP_HOST");
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");

  if (host && user && pass) {
    const port = Number(env("SMTP_PORT") || 465);
    try {
      // `family` is a net.connect option nodemailer forwards but does not type.
      const options: SMTPTransport.Options & { family?: number } = {
        host,
        port,
        secure: port === 465,
        // On 587 the connection starts plaintext and upgrades; insist on it
        // rather than silently sending credentials in the clear.
        requireTLS: port !== 465,
        auth: { user, pass },
        // Force IPv4. Railway containers have no outbound IPv6 route, and
        // smtp.gmail.com resolves to an AAAA record first, which fails with
        // ENETUNREACH before any SMTP conversation happens.
        family: 4,
        // Fail fast. Without these, a wrong host or blocked port leaves the
        // admin staring at a spinner while the request hangs for minutes.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      };
      const transport = nodemailer.createTransport(options);
      await transport.sendMail({
        from: env("MAIL_FROM") || user,
        to,
        subject,
        text,
        html,
      });
      return { sent: true, link };
    } catch (e) {
      console.error("[mail] smtp send failed:", (e as Error).message);
      return { sent: false, link, error: (e as Error).message };
    }
  }

  const key = env("RESEND_API_KEY");
  if (key) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env("MAIL_FROM") || "Phone Bank <onboarding@resend.dev>",
          to: [to],
          subject,
          text,
          html,
        }),
      });
      if (res.ok) return { sent: true, link };
      return { sent: false, link, error: `resend ${res.status}` };
    } catch (e) {
      return { sent: false, link, error: (e as Error).message };
    }
  }

  return { sent: false, link };
}
