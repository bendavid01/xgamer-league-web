-- 013: XG player accounts (feature XG-008).
--
-- 010 was reserved for this feature but stays unused: 011 and 012 shipped first,
-- and migrations run (and the release preflight checks the ledger) in name order.
--
-- Schema only: no player, entry, result or audit row is changed. Every existing
-- player gets the column defaults: player_type 'registered', no nickname, not
-- locked, and no credential (they claim an account with an organizer's code).
-- Does not add contact_version (009 does). Needs 001, 003 and 009. The
-- registration-queue columns are in 014.

-- Registered players hold a permanent XG ID. Guests play one tournament and never
-- receive one: their internal number is negative and comes from its own sequence,
-- so guests never consume or reveal an XG ID and public_no's identity sequence is
-- untouched.
alter table player add column if not exists player_type text not null default 'registered';
alter table player drop constraint if exists player_type_check;
alter table player add constraint player_type_check check (player_type in ('registered', 'guest'));
create sequence if not exists player_guest_no_seq as integer;
alter table player drop constraint if exists player_guest_number;
alter table player add constraint player_guest_number check ((player_type = 'guest') = (public_no < 0));

-- Public nickname. Stored NFKC-normalized and trimmed by the server; unique ignoring case.
alter table player add column if not exists display_nickname text;
alter table player add column if not exists nickname_locked boolean not null default false;
alter table player drop constraint if exists player_display_nickname_length;
alter table player add constraint player_display_nickname_length check (
  display_nickname is null or char_length(display_nickname) between 2 and 24);
alter table player drop constraint if exists player_nickname_lock;
alter table player add constraint player_nickname_lock check (not nickname_locked or display_nickname is not null);
alter table player drop constraint if exists player_guest_no_nickname;
alter table player add constraint player_guest_no_nickname check (player_type = 'registered' or display_nickname is null);
create unique index if not exists player_display_nickname_ci on player (lower(display_nickname))
  where display_nickname is not null;

-- Sign-in state, one row per player. password_hash is a scrypt hash, never the
-- password; it is null until the player claims the account. The row also carries
-- the brute-force counter shared by sign-in and code redemption.
create table if not exists player_credential (
  player_id uuid primary key references player(id) on delete cascade,
  password_hash text check (password_hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$'),
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  locked_until timestamptz,
  last_login_at timestamptz,
  -- Sessions issued before this moment are no longer accepted.
  password_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((password_hash is null) = (password_changed_at is null))
);
revoke all on player_credential from public;

-- Claim and reset codes an organizer shares on WhatsApp. Only a keyed hash is
-- stored; the code itself is shown to the organizer once.
create table if not exists player_one_time_code (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references player(id) on delete cascade,
  purpose text not null check (purpose in ('claim', 'reset')),
  code_hash text not null check (code_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  -- Set when a newer code for the same player and purpose replaces this one.
  revoked_at timestamptz,
  created_by_admin text not null check (created_by_admin ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (used_at is null or revoked_at is null)
);
revoke all on player_one_time_code from public;
create unique index if not exists player_one_time_code_active
  on player_one_time_code(player_id, purpose) where used_at is null and revoked_at is null;
