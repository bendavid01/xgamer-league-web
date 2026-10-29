-- Competitions with seasons, publish switch, final positions and champion photos.

-- One-off cups have no competition; seasons belong to a competition (e.g. "XGamer Pro League" · Season 2).
alter table tournament add column if not exists competition text;
alter table tournament add column if not exists season integer;
alter table tournament add column if not exists published boolean;
-- Existing tournaments: anything already beyond set-up is public; drafts stay private.
update tournament set published = (status <> 'draft') where published is null;
alter table tournament alter column published set default false;
alter table tournament alter column published set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tournament_season_check') then
    alter table tournament add constraint tournament_season_check
      check ((competition is null and season is null) or (competition is not null and season is not null and season between 1 and 999));
  end if;
end $$;
create unique index if not exists tournament_competition_season
  on tournament(lower(competition), season) where competition is not null and deleted_at is null;

-- Final positions (1st, 2nd, 3rd). Set by organizers, or from the table for league-only tournaments.
create table if not exists podium (
  tournament_id text not null references tournament(id),
  place integer not null check (place between 1 and 3),
  player_id uuid not null references player(id),
  primary key (tournament_id, place),
  unique (tournament_id, player_id)
);

-- Champion photo (compressed JPEG/WebP, stored privately and served through the website).
create table if not exists tournament_photo (
  tournament_id text primary key references tournament(id),
  content_type text not null check (content_type in ('image/jpeg', 'image/webp', 'image/png')),
  data bytea not null check (octet_length(data) <= 716800),
  updated_at timestamptz not null default now()
);
