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
  created_at              timestamptz not null default now()
);

create table if not exists teams (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null,
  name               text not null,
  budget_per_month   numeric(12,2),
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
  created_at         timestamptz not null default now()
);

create table if not exists virtual_keys (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id),
  user_id     uuid not null references users(id),
  hash        text not null unique,
  prefix      text not null,
  expires_at  timestamptz not null default now() + interval '30 days',
  created_at  timestamptz not null default now()
);

create table if not exists requests (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id),
  model_id       uuid not null references models(id),
  user_id        uuid not null references users(id),
  input_tokens   integer not null,
  output_tokens  integer not null,
  cost           numeric(14,6) not null,
  status         text not null,
  latency        integer,
  created_at     timestamptz not null default now()
);

create table if not exists audits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id),
  action      text not null,
  created_at  timestamptz not null default now()
);

create or replace function add_spend(p_id uuid, amount numeric)
returns void
language sql
as $$
   update projects
   set spend_this_month=coalesce(spend_this_month,0)+amount
   where id=p_id;
$$
