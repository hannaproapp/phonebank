import "server-only";
import { env } from "./env";
import { TEMPLATE_HEADERS } from "./templateHeaders";
import { CONTACTED } from "./fields";

const TZ = env("EXPORT_TIMEZONE") || "America/New_York";

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(d);
}

function fmtDateTime(d: Date) {
  const date = fmtDate(d);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${date} ${time}`;
}

export type ExportRow = {
  ghl_contact_id: string;
  first_name: string;
  last_name: string;
  disposition: string;
  candidate_awareness: string | null;
  support_level: string | null;
  vote_plan: string | null;
  phone_correct: string | null;
  new_phone: string | null;
  notes: string | null;
  created_at: Date;
  volunteer_name: string;
  volunteer_email: string;
  canvassing_for: string;
};

function csvEscape(v: string) {
  if (v === "") return "";
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/**
 * Builds the GHL Canvassing custom-object import file.
 * Column order is the template verbatim, with the Contacts lookup column prepended.
 * Fields the phone bank does not collect are emitted blank so the GHL field
 * mapping stays 1:1 by header name.
 */
export function buildCanvassingCsv(rows: ExportRow[], lookupColumn: string) {
  const headers = [lookupColumn, ...TEMPLATE_HEADERS];
  const lines = [headers.map(csvEscape).join(",")];

  for (const r of rows) {
    const contacted = r.disposition === CONTACTED;
    const name = `${r.last_name}, ${r.first_name}`.replace(/^, |, $/g, "").trim();
    const values: Record<string, string> = {
      [lookupColumn]: r.ghl_contact_id,
      "Canvass Attempt Name": `Phone - ${name || r.ghl_contact_id} - ${fmtDate(r.created_at)}`,
      "Contact Method": "Phone",
      "Purpose of Contact": "Voter ID & Commitment",
      "Canvassing For": r.canvassing_for,
      Canvasser: r.volunteer_name,
      "Canvasser Contact Name": r.volunteer_email,
      "Contact Time": fmtDate(r.created_at),
      "Form Submission Time": fmtDateTime(r.created_at),
      "Disposition (Phone)": r.disposition,
      Disposition: `Phone - ${r.disposition}`,
      "Candidate Awareness": contacted ? (r.candidate_awareness ?? "") : "",
      "Current Support Level": contacted ? (r.support_level ?? "") : "",
      "Vote Plan": contacted ? (r.vote_plan ?? "") : "",
      "Phone — Correct?": r.phone_correct ?? "",
      "→ New Phone Number": r.new_phone ?? "",
      "Internal Notes": r.notes ?? "",
    };

    lines.push(headers.map((h) => csvEscape(values[h] ?? "")).join(","));
  }

  return lines.join("\r\n") + "\r\n";
}

export const EXPORT_FILLED_COLUMNS = [
  "Canvass Attempt Name",
  "Contact Method",
  "Purpose of Contact",
  "Canvassing For",
  "Canvasser",
  "Canvasser Contact Name",
  "Contact Time",
  "Form Submission Time",
  "Disposition (Phone)",
  "Disposition",
  "Candidate Awareness",
  "Current Support Level",
  "Vote Plan",
  "Phone — Correct?",
  "→ New Phone Number",
  "Internal Notes",
];
