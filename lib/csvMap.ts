import Papa from "papaparse";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIASES: Record<string, string[]> = {
  ghl_contact_id: ["contactid", "ghlcontactid", "id", "contactuuid", "hlcontactid"],
  voter_id: ["statevoterid", "voterid", "sosvoterid", "voteridnumber", "stateid"],
  first_name: ["firstname", "first", "fname", "givenname"],
  last_name: ["lastname", "last", "lname", "surname", "familyname"],
  phone: ["phone", "phonenumber", "primaryphone", "cell", "cellphone", "mobile", "homephone"],
  city: ["city", "town", "municipality"],
};

export type ParsedList = {
  headers: string[];
  mapping: Record<string, string | null>;
  rows: {
    ghl_contact_id: string;
    voter_id: string;
    first_name: string;
    last_name: string;
    phone: string;
    city: string;
    extra: Record<string, string>;
  }[];
  skippedNoContactId: number;
  skippedNoPhone: number;
  skippedNoVoterId: number;
};

export function parseContactCsv(text: string): ParsedList {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
  });
  const headers = (parsed.meta.fields || []).filter(Boolean);

  const mapping: Record<string, string | null> = {};
  for (const [field, aliases] of Object.entries(ALIASES)) {
    mapping[field] = headers.find((h) => aliases.includes(norm(h))) ?? null;
  }

  const used = new Set(Object.values(mapping).filter(Boolean) as string[]);
  const rows: ParsedList["rows"] = [];
  let skippedNoContactId = 0;
  let skippedNoPhone = 0;
  let skippedNoVoterId = 0;

  for (const r of parsed.data) {
    const get = (f: string) => (mapping[f] ? String(r[mapping[f]!] ?? "").trim() : "");
    const ghl = get("ghl_contact_id");
    const voterId = get("voter_id");
    const phone = get("phone").replace(/[^\d+]/g, "");
    if (!ghl) {
      skippedNoContactId++;
      continue;
    }
    // The state voter ID is what a canvassing record is reconciled against, so a
    // row without one produces a result that cannot be matched back to a voter.
    if (!voterId) {
      skippedNoVoterId++;
      continue;
    }
    if (!phone) {
      skippedNoPhone++;
      continue;
    }
    const extra: Record<string, string> = {};
    for (const h of headers) {
      if (!used.has(h)) {
        const v = String(r[h] ?? "").trim();
        if (v) extra[h] = v;
      }
    }
    rows.push({
      ghl_contact_id: ghl,
      voter_id: voterId,
      first_name: get("first_name"),
      last_name: get("last_name"),
      phone,
      city: get("city"),
      extra,
    });
  }

  return { headers, mapping, rows, skippedNoContactId, skippedNoPhone, skippedNoVoterId };
}

export function telHref(phone: string) {
  const d = phone.replace(/[^\d]/g, "");
  if (d.length === 10) return `tel:+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `tel:+${d}`;
  return `tel:${phone}`;
}

export function prettyPhone(phone: string) {
  const d = phone.replace(/[^\d]/g, "");
  const t = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (t.length === 10) return `(${t.slice(0, 3)}) ${t.slice(3, 6)}-${t.slice(6)}`;
  return phone;
}
