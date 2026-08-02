"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, q1, pool } from "@/lib/db";
import { requireUser, requireCampaignAdmin, issueLoginLink, sendLoginEmail } from "@/lib/auth";
import { parseContactCsv } from "@/lib/csvMap";
import { baseUrl } from "../login/actions";

export async function createCampaign(formData: FormData) {
  const user = await requireUser();
  if (!user.is_super) throw new Error("FORBIDDEN");
  const name = String(formData.get("name") || "").trim();
  const candidate = String(formData.get("candidate_name") || "").trim();
  const lookup = String(formData.get("lookup_column") || "Contact").trim() || "Contact";
  if (!name) return;
  const row = await q1<{ id: string }>(
    `insert into campaigns (name, candidate_name, lookup_column) values ($1,$2,$3) returning id`,
    [name, candidate, lookup],
  );
  revalidatePath("/admin");
  redirect(`/admin/${row!.id}`);
}

export async function updateCampaign(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("campaign_id"));
  await requireCampaignAdmin(user, id);
  await q(
    `update campaigns set name=$2, candidate_name=$3, lookup_column=$4, canvassing_for=$5 where id=$1`,
    [
      id,
      String(formData.get("name") || "").trim(),
      String(formData.get("candidate_name") || "").trim(),
      String(formData.get("lookup_column") || "Contact").trim() || "Contact",
      String(formData.get("canvassing_for") || "Primary"),
    ],
  );
  revalidatePath(`/admin/${id}`);
}

export async function addMember(formData: FormData) {
  const user = await requireUser();
  const campaignId = String(formData.get("campaign_id"));
  await requireCampaignAdmin(user, campaignId);

  const email = String(formData.get("email") || "")
    .toLowerCase()
    .trim();
  const name = String(formData.get("name") || "").trim();
  const role = String(formData.get("role") || "volunteer");
  if (!email) return;

  const u = await q1<{ id: string }>(
    `insert into users (email, name) values ($1,$2)
     on conflict (email) do update set name = case when users.name = '' then excluded.name else users.name end
     returning id`,
    [email, name],
  );
  await q(
    `insert into campaign_members (campaign_id, user_id, role) values ($1,$2,$3)
     on conflict (campaign_id, user_id) do update set role = excluded.role`,
    [campaignId, u!.id, role],
  );
  revalidatePath(`/admin/${campaignId}`);
}

export async function sendMemberLink(formData: FormData) {
  const user = await requireUser();
  const campaignId = String(formData.get("campaign_id"));
  await requireCampaignAdmin(user, campaignId);
  const email = String(formData.get("email"));
  const campaign = await q1<{ name: string }>(`select name from campaigns where id=$1`, [
    campaignId,
  ]);
  const link = await issueLoginLink(email, await baseUrl());
  if (!link) return;
  // Always give the admin the link. They are authorised to invite this person,
  // and email is the least reliable part of the chain: without this, a silent
  // delivery failure leaves a volunteer with no way in.
  const res = await sendLoginEmail(email, link, campaign?.name);
  const params = new URLSearchParams({ link, invited: email });
  if (res.sent) params.set("sent", "1");
  if (res.error) params.set("mailerr", res.error);
  redirect(`/admin/${campaignId}?${params.toString()}`);
}

export async function removeMember(formData: FormData) {
  const user = await requireUser();
  const campaignId = String(formData.get("campaign_id"));
  await requireCampaignAdmin(user, campaignId);
  await q(`delete from campaign_members where campaign_id=$1 and user_id=$2`, [
    campaignId,
    String(formData.get("user_id")),
  ]);
  revalidatePath(`/admin/${campaignId}`);
}

export async function createList(formData: FormData) {
  const user = await requireUser();
  const campaignId = String(formData.get("campaign_id"));
  await requireCampaignAdmin(user, campaignId);

  const name = String(formData.get("name") || "").trim();
  const script = String(formData.get("script") || "");
  const canvassingFor = String(formData.get("canvassing_for") || "Primary");
  const file = formData.get("file") as File | null;
  if (!name || !file || file.size === 0) return;

  const text = await file.text();
  const parsed = parseContactCsv(text);

  if (!parsed.mapping.ghl_contact_id) {
    redirect(`/admin/${campaignId}?uploaderr=nocontactid`);
  }
  if (parsed.rows.length === 0) {
    redirect(`/admin/${campaignId}?uploaderr=norows`);
  }

  const list = await q1<{ id: string }>(
    `insert into lists (campaign_id, name, script, canvassing_for) values ($1,$2,$3,$4) returning id`,
    [campaignId, name, script, canvassingFor],
  );

  const client = await pool.connect();
  try {
    await client.query("begin");
    const CHUNK = 500;
    for (let i = 0; i < parsed.rows.length; i += CHUNK) {
      const chunk = parsed.rows.slice(i, i + CHUNK);
      const values: any[] = [];
      const placeholders = chunk.map((r, j) => {
        const b = j * 9;
        values.push(
          list!.id,
          r.ghl_contact_id,
          r.voter_id,
          r.first_name,
          r.last_name,
          r.phone,
          r.city,
          JSON.stringify(r.extra),
          i + j + 1,
        );
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`;
      });
      await client.query(
        `insert into contacts (list_id, ghl_contact_id, voter_id, first_name, last_name, phone, city, extra, row_no)
         values ${placeholders.join(",")}`,
        values,
      );
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }

  redirect(
    `/admin/${campaignId}/list/${list!.id}?loaded=${parsed.rows.length}&nophone=${parsed.skippedNoPhone}&noid=${parsed.skippedNoContactId}`,
  );
}

export async function updateList(formData: FormData) {
  const user = await requireUser();
  const listId = String(formData.get("list_id"));
  const l = await q1<{ campaign_id: string }>(`select campaign_id from lists where id=$1`, [listId]);
  await requireCampaignAdmin(user, l!.campaign_id);
  await q(`update lists set name=$2, script=$3, canvassing_for=$4, active=$5 where id=$1`, [
    listId,
    String(formData.get("name") || "").trim(),
    String(formData.get("script") || ""),
    String(formData.get("canvassing_for") || "Primary"),
    formData.get("active") === "on",
  ]);
  revalidatePath(`/admin/${l!.campaign_id}/list/${listId}`);
}

export async function assignContacts(formData: FormData) {
  const user = await requireUser();
  const listId = String(formData.get("list_id"));
  const l = await q1<{ campaign_id: string }>(`select campaign_id from lists where id=$1`, [listId]);
  await requireCampaignAdmin(user, l!.campaign_id);

  const volunteerId = String(formData.get("user_id"));
  const count = Math.max(1, Math.min(5000, Number(formData.get("count") || 50)));

  await q(
    `update contacts set assigned_user_id = $2
     where id in (
       select id from contacts
       where list_id = $1 and assigned_user_id is null and status = 'open'
       order by row_no
       limit $3
     )`,
    [listId, volunteerId, count],
  );
  revalidatePath(`/admin/${l!.campaign_id}/list/${listId}`);
}

export async function unassignVolunteer(formData: FormData) {
  const user = await requireUser();
  const listId = String(formData.get("list_id"));
  const l = await q1<{ campaign_id: string }>(`select campaign_id from lists where id=$1`, [listId]);
  await requireCampaignAdmin(user, l!.campaign_id);
  await q(
    `update contacts set assigned_user_id = null
     where list_id = $1 and assigned_user_id = $2 and status = 'open'`,
    [listId, String(formData.get("user_id"))],
  );
  revalidatePath(`/admin/${l!.campaign_id}/list/${listId}`);
}

export async function deleteList(formData: FormData) {
  const user = await requireUser();
  const listId = String(formData.get("list_id"));
  const l = await q1<{ campaign_id: string }>(`select campaign_id from lists where id=$1`, [listId]);
  await requireCampaignAdmin(user, l!.campaign_id);
  await q(`delete from lists where id=$1`, [listId]);
  redirect(`/admin/${l!.campaign_id}`);
}
