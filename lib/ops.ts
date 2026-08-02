import "server-only";
import { q, q1, pool } from "./db";
import {
  requireUser,
  requireCampaignAdmin,
  issueLoginLink,
  sendLoginEmail,
  destroySession,
} from "./auth";
import { parseContactCsv } from "./csvMap";
import { publicBaseUrl } from "./baseUrl";
import { env } from "./env";
import {
  DISPOSITIONS,
  CANDIDATE_AWARENESS,
  SUPPORT_LEVEL,
  VOTE_PLAN,
  PHONE_CORRECT,
  CONTACTED,
} from "./fields";

/**
 * Form handlers.
 *
 * These run from a plain route handler behind native HTML form posts rather than
 * as Server Actions. Server Actions submit over fetch, and in production that
 * request reached the server with no Cookie header at all, so every mutation
 * failed authentication while page renders worked. A native form post is an
 * ordinary navigation, carries cookies everywhere, and keeps the app usable
 * before client JavaScript has loaded.
 *
 * Each handler returns the path to redirect to.
 */

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const inSet = (v: unknown, set: readonly string[]) =>
  typeof v === "string" && set.includes(v) ? v : null;

export type OpName =
  | "logout"
  | "requestLink"
  | "createCampaign"
  | "updateCampaign"
  | "addMember"
  | "sendMemberLink"
  | "removeMember"
  | "createList"
  | "updateList"
  | "deleteList"
  | "assignContacts"
  | "unassignVolunteer"
  | "submitCall"
  | "skipContact";

export async function runOp(op: string, fd: FormData): Promise<string> {
  switch (op as OpName) {
    case "logout":
      await destroySession();
      return "/login";
    case "requestLink":
      return requestLink(fd);
    case "createCampaign":
      return createCampaign(fd);
    case "updateCampaign":
      return updateCampaign(fd);
    case "addMember":
      return addMember(fd);
    case "sendMemberLink":
      return sendMemberLink(fd);
    case "removeMember":
      return removeMember(fd);
    case "createList":
      return createList(fd);
    case "updateList":
      return updateList(fd);
    case "deleteList":
      return deleteList(fd);
    case "assignContacts":
      return assignContacts(fd);
    case "unassignVolunteer":
      return unassignVolunteer(fd);
    case "submitCall":
      return submitCall(fd);
    case "skipContact":
      return skipContact(fd);
    default:
      return "/";
  }
}

async function requestLink(fd: FormData) {
  const email = str(fd, "email");
  const link = await issueLoginLink(email, await publicBaseUrl());
  if (!link) return "/login?err=1";

  const res = await sendLoginEmail(email, link);
  if (res.sent) return "/login?sent=1";

  // Anyone can type anyone's address here, so a failed send must not reveal the
  // link: that would be a way to sign in as any user whose email you can guess.
  if (env("LOGIN_SHOW_LINK") === "on") {
    return `/login?link=${encodeURIComponent(link)}`;
  }
  return "/login?undelivered=1";
}

async function createCampaign(fd: FormData) {
  const user = await requireUser();
  if (!user.is_super) throw new Error("FORBIDDEN");
  const name = str(fd, "name");
  if (!name) return "/admin";
  const row = await q1<{ id: string }>(
    `insert into campaigns (name, candidate_name, lookup_column) values ($1,$2,$3) returning id`,
    [name, str(fd, "candidate_name"), str(fd, "lookup_column") || "Contact"],
  );
  return `/admin/${row!.id}`;
}

async function updateCampaign(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "campaign_id");
  await requireCampaignAdmin(user, id);
  await q(
    `update campaigns set name=$2, candidate_name=$3, lookup_column=$4, canvassing_for=$5 where id=$1`,
    [
      id,
      str(fd, "name"),
      str(fd, "candidate_name"),
      str(fd, "lookup_column") || "Contact",
      str(fd, "canvassing_for") || "Primary",
    ],
  );
  return `/admin/${id}`;
}

async function addMember(fd: FormData) {
  const user = await requireUser();
  const campaignId = str(fd, "campaign_id");
  await requireCampaignAdmin(user, campaignId);

  const email = str(fd, "email").toLowerCase();
  if (!email) return `/admin/${campaignId}`;
  const role = str(fd, "role") === "admin" ? "admin" : "volunteer";

  const u = await q1<{ id: string }>(
    `insert into users (email, name) values ($1,$2)
     on conflict (email) do update set name = case when users.name = '' then excluded.name else users.name end
     returning id`,
    [email, str(fd, "name")],
  );
  await q(
    `insert into campaign_members (campaign_id, user_id, role) values ($1,$2,$3)
     on conflict (campaign_id, user_id) do update set role = excluded.role`,
    [campaignId, u!.id, role],
  );
  return `/admin/${campaignId}`;
}

async function sendMemberLink(fd: FormData) {
  const user = await requireUser();
  const campaignId = str(fd, "campaign_id");
  await requireCampaignAdmin(user, campaignId);

  const email = str(fd, "email");
  const campaign = await q1<{ name: string }>(`select name from campaigns where id=$1`, [
    campaignId,
  ]);
  const link = await issueLoginLink(email, await publicBaseUrl());
  if (!link) return `/admin/${campaignId}`;

  // Always give the admin the link. They are authorised to invite this person,
  // and email is the least reliable part of the chain: without this, a silent
  // delivery failure leaves a volunteer with no way in.
  const res = await sendLoginEmail(email, link, campaign?.name);
  const params = new URLSearchParams({ link, invited: email });
  if (res.sent) params.set("sent", "1");
  if (res.error) params.set("mailerr", res.error);
  return `/admin/${campaignId}?${params.toString()}`;
}

async function removeMember(fd: FormData) {
  const user = await requireUser();
  const campaignId = str(fd, "campaign_id");
  await requireCampaignAdmin(user, campaignId);
  await q(`delete from campaign_members where campaign_id=$1 and user_id=$2`, [
    campaignId,
    str(fd, "user_id"),
  ]);
  return `/admin/${campaignId}`;
}

async function createList(fd: FormData) {
  const user = await requireUser();
  const campaignId = str(fd, "campaign_id");
  await requireCampaignAdmin(user, campaignId);

  const name = str(fd, "name");
  const file = fd.get("file") as File | null;
  if (!name || !file || file.size === 0) return `/admin/${campaignId}?uploaderr=norows`;

  const parsed = parseContactCsv(await file.text());
  if (!parsed.mapping.ghl_contact_id) return `/admin/${campaignId}?uploaderr=nocontactid`;
  if (parsed.rows.length === 0) return `/admin/${campaignId}?uploaderr=norows`;

  const list = await q1<{ id: string }>(
    `insert into lists (campaign_id, name, script, canvassing_for) values ($1,$2,$3,$4) returning id`,
    [campaignId, name, String(fd.get("script") ?? ""), str(fd, "canvassing_for") || "Primary"],
  );

  const client = await pool.connect();
  try {
    await client.query("begin");
    const CHUNK = 500;
    for (let i = 0; i < parsed.rows.length; i += CHUNK) {
      const chunk = parsed.rows.slice(i, i + CHUNK);
      const values: unknown[] = [];
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

  return `/admin/${campaignId}/list/${list!.id}?loaded=${parsed.rows.length}&nophone=${parsed.skippedNoPhone}&noid=${parsed.skippedNoContactId}`;
}

async function listCampaign(listId: string) {
  const l = await q1<{ campaign_id: string }>(`select campaign_id from lists where id=$1`, [listId]);
  if (!l) throw new Error("NOT_FOUND");
  return l.campaign_id;
}

async function updateList(fd: FormData) {
  const user = await requireUser();
  const listId = str(fd, "list_id");
  const campaignId = await listCampaign(listId);
  await requireCampaignAdmin(user, campaignId);
  await q(`update lists set name=$2, script=$3, canvassing_for=$4, active=$5 where id=$1`, [
    listId,
    str(fd, "name"),
    String(fd.get("script") ?? ""),
    str(fd, "canvassing_for") || "Primary",
    fd.get("active") === "on",
  ]);
  return `/admin/${campaignId}/list/${listId}`;
}

async function deleteList(fd: FormData) {
  const user = await requireUser();
  const listId = str(fd, "list_id");
  const campaignId = await listCampaign(listId);
  await requireCampaignAdmin(user, campaignId);
  await q(`delete from lists where id=$1`, [listId]);
  return `/admin/${campaignId}`;
}

async function assignContacts(fd: FormData) {
  const user = await requireUser();
  const listId = str(fd, "list_id");
  const campaignId = await listCampaign(listId);
  await requireCampaignAdmin(user, campaignId);

  const count = Math.max(1, Math.min(5000, Number(fd.get("count") || 50)));
  await q(
    `update contacts set assigned_user_id = $2
     where id in (
       select id from contacts
       where list_id = $1 and assigned_user_id is null and status = 'open'
       order by row_no
       limit $3
     )`,
    [listId, str(fd, "user_id"), count],
  );
  return `/admin/${campaignId}/list/${listId}`;
}

async function unassignVolunteer(fd: FormData) {
  const user = await requireUser();
  const listId = str(fd, "list_id");
  const campaignId = await listCampaign(listId);
  await requireCampaignAdmin(user, campaignId);
  await q(
    `update contacts set assigned_user_id = null
     where list_id = $1 and assigned_user_id = $2 and status = 'open'`,
    [listId, str(fd, "user_id")],
  );
  return `/admin/${campaignId}/list/${listId}`;
}

async function submitCall(fd: FormData) {
  const user = await requireUser();
  const contactId = str(fd, "contact_id");

  const contact = await q1<{ list_id: string; assigned_user_id: string }>(
    `select list_id, assigned_user_id from contacts where id = $1`,
    [contactId],
  );
  if (!contact || contact.assigned_user_id !== user.id) throw new Error("FORBIDDEN");

  const disposition = inSet(fd.get("disposition"), DISPOSITIONS as readonly string[]);
  if (!disposition) return `/call/${contact.list_id}`;

  const contacted = disposition === CONTACTED;
  const phoneCorrect =
    disposition === "Wrong Number"
      ? "Incorrect"
      : inSet(fd.get("phone_correct"), PHONE_CORRECT as readonly string[]);

  await q(
    `insert into call_results
       (contact_id, list_id, user_id, disposition, candidate_awareness, support_level, vote_plan, phone_correct, new_phone, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      contactId,
      contact.list_id,
      user.id,
      disposition,
      contacted ? inSet(fd.get("candidate_awareness"), CANDIDATE_AWARENESS as readonly string[]) : null,
      contacted ? inSet(fd.get("support_level"), SUPPORT_LEVEL as readonly string[]) : null,
      contacted ? inSet(fd.get("vote_plan"), VOTE_PLAN as readonly string[]) : null,
      phoneCorrect,
      str(fd, "new_phone") || null,
      str(fd, "notes") || null,
    ],
  );
  await q(`update contacts set status = 'done' where id = $1`, [contactId]);
  return `/call/${contact.list_id}`;
}

async function skipContact(fd: FormData) {
  const user = await requireUser();
  const contactId = str(fd, "contact_id");
  const contact = await q1<{ list_id: string; assigned_user_id: string }>(
    `select list_id, assigned_user_id from contacts where id = $1`,
    [contactId],
  );
  if (!contact || contact.assigned_user_id !== user.id) throw new Error("FORBIDDEN");
  // Push to the back of this volunteer's queue.
  await q(
    `update contacts set row_no = (select coalesce(max(row_no),0) + 1 from contacts where list_id = $2)
     where id = $1`,
    [contactId, contact.list_id],
  );
  return `/call/${contact.list_id}`;
}
