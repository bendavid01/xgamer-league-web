-- 009: WhatsApp number changes made by organizers in OM (approved plan, revision 2).
--
-- Schema only: no rows are written. Safe to run twice (repository convention). Existing players get the column defaults
-- (contact_version 1, never attested). XG IDs, entries, results and audit rows are untouched.
-- Feature XG-008's accounts migration is 010 and must not add contact_version again.
--
-- contact_verified_at / contact_verification_method record a MANUAL organizer
-- attestation. They are not automated proof that someone owns a WhatsApp number,
-- not identity proof, and never authorization for player login or link issuing.

alter table player add column if not exists contact_version integer not null default 1;
alter table player add column if not exists contact_verified_at timestamptz;
alter table player add column if not exists contact_verification_method text;
alter table player drop constraint if exists player_contact_attestation_method;
alter table player add constraint player_contact_attestation_method check (
  contact_verification_method is null or contact_verification_method in (
    'organizer_attested_established_channel', 'organizer_attested_independent_evidence'));
alter table player drop constraint if exists player_contact_attestation_pair;
alter table player add constraint player_contact_attestation_pair check (
  (contact_verified_at is null) = (contact_verification_method is null));
alter table player drop constraint if exists player_contact_version_positive;
alter table player add constraint player_contact_version_positive check (contact_version >= 1);
comment on column player.contact_version is
  'Starts at 1; +1 on every completed WhatsApp number change.';
comment on column player.contact_verified_at is
  'When organizers last attested this number by hand in OM. Not automated proof of WhatsApp ownership. Not identity proof and not authorization for player login.';
comment on column player.contact_verification_method is
  'How the organizer attestation was made. Informational only; never authorization for player login.';

-- One row per requested change. New-number fields are erased when the change ends.
create table if not exists contact_change (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references player(id),
  tournament_id text not null references tournament(id),
  route text not null check (route in ('established_channel', 'independent_evidence')),
  evidence_type text check (evidence_type in
    ('efootball_possession', 'known_person_live_video', 'known_person_in_person')),
  evidence_note text check (evidence_note is null or char_length(evidence_note) between 20 and 500),
  evidence_observed_at timestamptz,
  challenge_hash text,
  challenge_confirmed_at timestamptz,
  new_contact_hash text not null,
  new_contact_cipher text not null,
  from_contact_version integer not null,
  code_hash text,
  code_expires_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 5),
  resends integer not null default 0 check (resends between 0 and 2),
  status text not null default 'pending_code' check (status in
    ('pending_code', 'awaiting_second_admin', 'completed', 'cancelled', 'failed', 'expired')),
  requested_by text not null,
  approved_by text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  code_checked_at timestamptz,
  approve_by timestamptz,
  finished_at timestamptz,
  -- Route 2 always carries evidence; Route 1 never does.
  check ((route = 'independent_evidence') = (evidence_type is not null and evidence_note is not null)),
  -- People-based evidence says when it was observed.
  check (evidence_type not in ('known_person_live_video', 'known_person_in_person') or evidence_observed_at is not null),
  -- eFootball possession is checked with a server-issued challenge.
  check (evidence_type is distinct from 'efootball_possession' or challenge_hash is not null
         or status not in ('pending_code', 'awaiting_second_admin')),
  check (evidence_type = 'efootball_possession' or challenge_hash is null),
  -- Two different people for every Route 2 change.
  check (approved_by is null or approved_by <> requested_by),
  check (status not in ('awaiting_second_admin', 'completed') or code_checked_at is not null),
  check (status <> 'awaiting_second_admin' or (route = 'independent_evidence' and approve_by is not null)),
  check (status <> 'completed' or route = 'established_channel' or approved_by is not null),
  check (status <> 'completed' or evidence_type is distinct from 'efootball_possession' or challenge_confirmed_at is not null),
  check ((status in ('pending_code', 'awaiting_second_admin')) = (finished_at is null))
);
create unique index if not exists contact_change_open_player on contact_change(player_id)
  where status in ('pending_code', 'awaiting_second_admin');
create unique index if not exists contact_change_open_number on contact_change(new_contact_hash)
  where status in ('pending_code', 'awaiting_second_admin');
create index if not exists contact_change_queue on contact_change(status, created_at);
