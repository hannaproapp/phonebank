"use server";

import { revalidatePath } from "next/cache";
import { q, q1 } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  DISPOSITIONS,
  CANDIDATE_AWARENESS,
  SUPPORT_LEVEL,
  VOTE_PLAN,
  PHONE_CORRECT,
  CONTACTED,
} from "@/lib/fields";

const inSet = (v: unknown, set: readonly string[]) =>
  typeof v === "string" && set.includes(v) ? v : null;

export async function submitCall(formData: FormData) {
  const user = await requireUser();
  const contactId = String(formData.get("contact_id"));

  const contact = await q1<{ id: string; list_id: string; assigned_user_id: string }>(
    `select id, list_id, assigned_user_id from contacts where id = $1`,
    [contactId],
  );
  if (!contact || contact.assigned_user_id !== user.id) throw new Error("FORBIDDEN");

  const disposition = inSet(formData.get("disposition"), DISPOSITIONS as readonly string[]);
  if (!disposition) throw new Error("BAD_DISPOSITION");

  const contacted = disposition === CONTACTED;
  const phoneCorrect =
    disposition === "Wrong Number"
      ? "Incorrect"
      : inSet(formData.get("phone_correct"), PHONE_CORRECT as readonly string[]);

  await q(
    `insert into call_results
       (contact_id, list_id, user_id, disposition, candidate_awareness, support_level, vote_plan, phone_correct, new_phone, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      contactId,
      contact.list_id,
      user.id,
      disposition,
      contacted ? inSet(formData.get("candidate_awareness"), CANDIDATE_AWARENESS as readonly string[]) : null,
      contacted ? inSet(formData.get("support_level"), SUPPORT_LEVEL as readonly string[]) : null,
      contacted ? inSet(formData.get("vote_plan"), VOTE_PLAN as readonly string[]) : null,
      phoneCorrect,
      String(formData.get("new_phone") || "").trim() || null,
      String(formData.get("notes") || "").trim() || null,
    ],
  );

  await q(`update contacts set status = 'done' where id = $1`, [contactId]);
  revalidatePath(`/call/${contact.list_id}`);
}

export async function skipContact(formData: FormData) {
  const user = await requireUser();
  const contactId = String(formData.get("contact_id"));
  const contact = await q1<{ list_id: string; assigned_user_id: string; row_no: number }>(
    `select list_id, assigned_user_id, row_no from contacts where id = $1`,
    [contactId],
  );
  if (!contact || contact.assigned_user_id !== user.id) throw new Error("FORBIDDEN");
  // Push to the back of this volunteer's queue.
  await q(
    `update contacts set row_no = (select coalesce(max(row_no),0) + 1 from contacts where list_id = $2)
     where id = $1`,
    [contactId, contact.list_id],
  );
  revalidatePath(`/call/${contact.list_id}`);
}
