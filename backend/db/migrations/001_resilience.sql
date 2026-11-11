-- Run against a database that already has the H18IALMOND-37 deployment schema.
-- Existing aliases receive defaults; historical request attempts stay unknown.
begin;

alter table models
  add column if not exists retry_count integer not null default 3 check (retry_count >= 0),
  add column if not exists retry_backoff_seconds double precision[] not null default '{1,2,4}',
  add column if not exists timeout_seconds double precision not null default 30 check (timeout_seconds > 0);

alter table requests
  add column if not exists attempt_count integer check (attempt_count >= 0);

commit;
