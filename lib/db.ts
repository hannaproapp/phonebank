import "server-only";
import { Pool } from "pg";
import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __migrated: Promise<void> | undefined;
}

export const pool =
  global.__pgPool ??
  new Pool({
    connectionString: env("DATABASE_URL"),
    ssl: env("DATABASE_URL")?.includes("railway.internal")
      ? undefined
      : env("PGSSL") === "off"
        ? undefined
        : { rejectUnauthorized: false },
    max: 8,
  });

if (env("NODE_ENV") !== "production") global.__pgPool = pool;

const SCHEMA = `
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null default '',
  is_super boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  candidate_name text not null default '',
  canvassing_for text not null default 'Primary',
  lookup_column text not null default 'Contact',
  calling_start smallint not null default 9,
  calling_end smallint not null default 20,
  created_at timestamptz not null default now()
);

create table if not exists campaign_members (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('admin','volunteer')),
  primary key (campaign_id, user_id)
);

create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  name text not null,
  script text not null default '',
  canvassing_for text not null default 'Primary',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  ghl_contact_id text not null,
  voter_id text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  city text not null default '',
  extra jsonb not null default '{}'::jsonb,
  assigned_user_id uuid references users(id) on delete set null,
  status text not null default 'open' check (status in ('open','done')),
  row_no integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists contacts_list_idx on contacts(list_id);
create index if not exists contacts_assigned_idx on contacts(assigned_user_id, status);

create table if not exists call_results (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  list_id uuid not null references lists(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  disposition text not null,
  candidate_awareness text,
  support_level text,
  vote_plan text,
  phone_correct text,
  new_phone text,
  notes text,
  created_at timestamptz not null default now(),
  exported_at timestamptz
);
create index if not exists call_results_list_idx on call_results(list_id, exported_at);

create table if not exists login_tokens (
  token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Added after the first deploys, so these are alters rather than columns on the
-- create above. Shown to the caller on the contact card before they dial.
alter table contacts add column if not exists full_address text not null default '';
alter table contacts add column if not exists vote_segment text not null default '';
alter table contacts add column if not exists vote_propensity text not null default '';
alter table contacts add column if not exists primary_flag text not null default '';
`;

export async function migrate() {
  if (!global.__migrated) {
    global.__migrated = (async () => {
      await pool.query(SCHEMA);
      const seed = env("SUPER_ADMIN_EMAIL");
      if (seed) {
        await pool.query(
          `insert into users (email, name, is_super) values ($1,$2,true)
           on conflict (email) do update set is_super = true`,
          [seed.toLowerCase().trim(), env("SUPER_ADMIN_NAME") || "Super Admin"],
        );
      }
    })();
  }
  return global.__migrated;
}

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  await migrate();
  const r = await pool.query(text, params);
  return r.rows as T[];
}

export async function q1<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}
