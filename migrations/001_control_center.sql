create table if not exists tournament (
 id text primary key, name text not null, starts_on date not null,
 capacity integer not null default 64 check(capacity=64), opponents integer not null default 4 check(opponents between 1 and 63),
 status text not null default 'draft' check(status in ('draft','open','locked','league','knockout','completed')),
 revision integer not null default 0, deleted_at timestamptz
);
create table if not exists player (
 id uuid primary key default gen_random_uuid(), gaming_name text not null,
 efootball_hash text unique not null, efootball_cipher text not null,
 contact_hash text unique not null, contact_cipher text not null,
 preference text not null check(preference in ('whatsapp','discord')),
 consent_at timestamptz not null default now(), consent_version text not null,
 discord_id text unique, deleted_at timestamptz
);
create table if not exists application (
 id uuid primary key default gen_random_uuid(), tournament_id text not null references tournament(id),
 player_id uuid not null references player(id), created_at timestamptz not null default now(),
 status text not null check(status in ('pending','waitlisted','approved','rejected','withdrawn')),
 verified_at timestamptz, revision integer not null default 0, deleted_at timestamptz,
 unique(tournament_id,player_id)
);
create table if not exists coordinator (
 discord_id text primary key check(discord_id ~ '^[0-9]{17,20}$'), operations text[] not null,
 tournaments text[] not null, active boolean not null default true,
 check(operations <@ array['registrations','results','announcements']::text[])
);
create table if not exists fixture (
 id uuid primary key default gen_random_uuid(), tournament_id text not null references tournament(id),
 stage text not null check(stage in ('league','knockout')), round integer not null, slot integer not null default 0,
 home uuid not null references player(id), away uuid not null references player(id),
 home_score integer check(home_score between 0 and 99), away_score integer check(away_score between 0 and 99),
 winner uuid references player(id), revision integer not null default 0,
 check(home<>away), check((home_score is null)=(away_score is null)),
 check(winner is null or winner=home or winner=away), unique(tournament_id,stage,round,home,away)
);
create unique index if not exists league_pair on fixture(tournament_id,least(home,away),greatest(home,away)) where stage='league';
create table if not exists qualification (
 tournament_id text not null references tournament(id), player_id uuid not null references player(id), rank integer not null check(rank between 1 and 8),
 primary key(tournament_id,player_id), unique(tournament_id,rank)
);
create table if not exists finals_access (
 tournament_id text primary key references tournament(id), credential_cipher text not null, released boolean not null default false
);
create table if not exists announcement (
 id uuid primary key default gen_random_uuid(), tournament_id text not null references tournament(id),
 title text not null, message text not null, published boolean not null default false, revision integer not null default 0, deleted_at timestamptz
);
create table if not exists audit_event (
 id bigint generated always as identity primary key, actor text not null, action text not null,
 entity text not null, before_value jsonb, after_value jsonb, created_at timestamptz not null default now()
);
create or replace function immutable_audit() returns trigger language plpgsql as $$ begin raise exception 'Audit events are immutable'; end $$;
drop trigger if exists audit_immutable on audit_event;
create trigger audit_immutable before update or delete on audit_event for each row execute function immutable_audit();
create table if not exists rate_limit (key text primary key, hits integer not null, expires_at timestamptz not null);
create or replace function enforce_capacity() returns trigger language plpgsql as $$
declare occupied integer;
begin
 perform 1 from tournament where id=new.tournament_id for update;
 if new.deleted_at is null and new.status in ('pending','approved') then
  select count(*) into occupied from application where tournament_id=new.tournament_id and id<>new.id and deleted_at is null and status in ('pending','approved');
  if occupied>=64 then
   if TG_OP='INSERT' then new.status:='waitlisted'; else raise exception 'Tournament capacity reached'; end if;
  end if;
 end if;
 return new;
end $$;
drop trigger if exists application_capacity on application;
create trigger application_capacity before insert or update on application for each row execute function enforce_capacity();
-- Private server-only schema. Never connect it to a browser client or public Sanity.
revoke all on all tables in schema public from public;
insert into tournament(id,name,starts_on) values ('xgamer-2026-10','XGamer 2.0 • October Cup','2026-10-24') on conflict do nothing;
