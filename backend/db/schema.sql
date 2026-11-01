create extension if not exists pgcrypto;

create table if not exists models (
  id                      uuid primary key default gen_random_uuid(),
  alias                   text not null unique,
  provider                text not null,
  model                   text not null,
  price_per_1m_input      numeric(12,6) not null,
  price_per_1m_output     numeric(12,6) not null,
  data_processing_country text,
  data_processing_state   text,
  created_at              timestamptz not null default now(),
  prompt                  text
);

create table if not exists teams (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null,
  name               text not null,
  budget_per_month   numeric(12,2),
  warning_threshold  numeric(5,4) not null default 0.8
                       check (warning_threshold > 0 and warning_threshold <= 1),
  created_at         timestamptz not null default now()
);

create table if not exists users (
  id          uuid primary key references auth.users(id),
  role        text not null check (role in ('team_lead', 'user', 'admin')),
  created_at  timestamptz not null default now()
);

alter table teams
  add constraint teams_owner_id_fkey
  foreign key (owner_id) references users(id);

create table if not exists user_team_mappings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id),
  team_id         uuid not null references teams(id),
  can_create_key  boolean not null,
  created_at      timestamptz not null default now()
);

ALTER TABLE user_team_mappings ADD CONSTRAINT unique_mapping UNIQUE (user_id, team_id);

create table if not exists projects (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references teams(id),
  name               text not null,
  model_ids          uuid[] not null,
  spend_this_month   numeric(14,6) not null default 0,
  budget_per_month   numeric(12,2),
  warning_threshold  numeric(5,4) not null default 0.8
                       check (warning_threshold > 0 and warning_threshold <= 1),
  -- Guardrails (H18IALMOND-39): prompts containing any phrase are refused,
  -- and max_tokens may not go above the cap (null means no cap).
  blocked_patterns   text[] not null default '{}',
  max_tokens_cap     integer check (max_tokens_cap > 0),
  created_at         timestamptz not null default now()
);

create table if not exists virtual_keys (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id),
  user_id     uuid not null references users(id),
  name        text,
  hash        text not null unique,
  prefix      text not null,
  expires_at  timestamptz not null default now() + interval '30 days',
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  -- The project models this key may use. Empty means all of them.
  model_ids   uuid[] not null default '{}'
);

create table if not exists requests (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id),
  model_id            uuid not null references models(id),
  user_id             uuid not null references users(id),
  input_tokens        integer not null,
  output_tokens       integer not null,
  cost                numeric(14,6) not null,
  status              text not null,
  latency             integer,
  created_at          timestamptz not null default now(),
  request_text        text,
  response_text       text,
  key_id              uuid references virtual_keys(id),
  time_to_first_token integer
);

create table if not exists audits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id),
  action      text not null,
  -- The row the action changed, e.g. a virtual key's id.
  target_id   uuid,
  details     jsonb,
  created_at  timestamptz not null default now()
);

create or replace function add_spend(p_id uuid, amount numeric)
returns void
language sql
as $$
   update projects
   set spend_this_month=coalesce(spend_this_month,0)+amount
   where id=p_id;
$$;

-- Revoke an active key and audit it in one transaction. Returns no row if the
-- key is missing or already revoked, so two revokes at once can't both succeed.
create or replace function revoke_virtual_key(p_key_id uuid, p_actor_id uuid)
returns setof virtual_keys
language plpgsql
as $$
declare
  revoked virtual_keys;
begin
  update virtual_keys
  set revoked_at = now()
  where id = p_key_id and revoked_at is null
  returning * into revoked;
  if not found then
    return;
  end if;

  insert into audits (user_id, action, target_id)
  values (p_actor_id, 'revoke_api_key', p_key_id);
  return next revoked;
end;
$$;

-- Swap an active, unexpired key for a new one (same project, user, name and
-- models) and audit it, all in one transaction. Returns the new key, or no row if the
-- old key is missing, revoked or expired.
create or replace function rotate_virtual_key(
  p_key_id uuid, p_actor_id uuid, p_hash text, p_prefix text
)
returns setof virtual_keys
language plpgsql
as $$
declare
  old_key virtual_keys;
  new_key virtual_keys;
begin
  update virtual_keys
  set revoked_at = now()
  where id = p_key_id and revoked_at is null and expires_at > now()
  returning * into old_key;
  if not found then
    return;
  end if;

  insert into virtual_keys (project_id, user_id, name, hash, prefix, model_ids)
  values (old_key.project_id, old_key.user_id, old_key.name, p_hash, p_prefix,
          old_key.model_ids)
  returning * into new_key;

  insert into audits (user_id, action, target_id, details)
  values (p_actor_id, 'rotate_api_key', p_key_id,
          jsonb_build_object('new_key_id', new_key.id));
  return next new_key;
end;
$$;

-- Only the backend (service role) may call these; Supabase exposes functions
-- to the public anon key otherwise.
revoke execute on function revoke_virtual_key(uuid, uuid) from public, anon, authenticated;
revoke execute on function rotate_virtual_key(uuid, uuid, text, text) from public, anon, authenticated;
