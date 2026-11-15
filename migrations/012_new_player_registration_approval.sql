-- Intake precedes player ID allocation. Existing applications remain intact.
create table if not exists new_player_registration_request (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references tournament(id),
  gaming_name text check (char_length(gaming_name) between 2 and 40),
  team_name text check (char_length(team_name) between 2 and 40),
  contact_proof text check (contact_proof ~ '^[a-f0-9]{64}$'),
  consent_version text not null,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_at timestamptz,
  application_id uuid unique references application(id),
  check ((status = 'pending') = (decided_at is null)),
  check ((status = 'pending') = (contact_proof is not null)),
  check ((status = 'pending') = (gaming_name is not null)),
  check ((status = 'pending') = (team_name is not null)),
  check ((status = 'approved') = (application_id is not null))
);
revoke all on new_player_registration_request from public;

-- Deduplicate a retry without letting a submission in someone else's name
-- reserve their number or block their own application.
create unique index if not exists new_player_registration_pending_claim
  on new_player_registration_request(tournament_id, contact_proof, gaming_name, team_name)
  where status = 'pending';
create index if not exists new_player_registration_pending_queue
  on new_player_registration_request(tournament_id, created_at, id)
  where status = 'pending';
