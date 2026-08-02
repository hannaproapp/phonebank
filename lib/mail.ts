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
 * Two backends, tried in order:
 *   1. SMTP  — set SMTP_HOST/PORT/USER/PASS. Gmail and Google Workspace work with
 *      an app password, and need no DNS changes because Google already publishes
 *      SPF and DKIM for the sending domain.
 *   2. Resend — set RESEND_API_KEY. Requires a verified domain.
 *
 * With neither configured, the caller shows the link on screen for the admin to
 * pass along by hand.
 */
export async function sendLoginEmail(
  to: string,
  link: string,
  campaign?: string,
): Promise<SendResult> {
  const subject = campaign ? `Your ${campaign} call list` : "Your phone bank call list";
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
        text: loginEmailText(link, campaign),
        html: loginEmailHtml(link, campaign),
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
          text: loginEmailText(link, campaign),
          html: loginEmailHtml(link, campaign),
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
