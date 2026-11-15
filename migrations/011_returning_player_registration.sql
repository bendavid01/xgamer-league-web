-- Public submissions are claims, with no relationship to a player until
-- an organizer approves and creates a new tournament entry. 010 remains reserved.
create table if not exists returning_registration_request (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references tournament(id),
  claimed_public_no integer not null check (claimed_public_no > 0),
  team_name text check (char_length(team_name) between 2 and 40),
  -- A keyed fingerprint of the claim. The submitted number is never stored.
  contact_proof text check (contact_proof ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_at timestamptz,
  application_id uuid unique references application(id),
  check ((status = 'pending') = (decided_at is null)),
  check ((status = 'pending') = (contact_proof is not null)),
  check ((status = 'pending') = (team_name is not null)),
  check ((status = 'approved') = (application_id is not null))
);
revoke all on returning_registration_request from public;

create unique index if not exists returning_registration_pending_claim
  on returning_registration_request(tournament_id, contact_proof)
  where status = 'pending';
create index if not exists returning_registration_pending_queue
  on returning_registration_request(tournament_id, created_at, id)
  where status = 'pending';
