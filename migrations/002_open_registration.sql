-- Registration asks only for player name, team name and phone (WhatsApp).
-- The eFootball ID is added later by an organizer after approval.
alter table player alter column efootball_hash drop not null;
alter table player alter column efootball_cipher drop not null;
alter table player add column if not exists team_name text;
alter table player alter column preference set default 'whatsapp';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'player_efootball_pair') then
    alter table player add constraint player_efootball_pair
      check ((efootball_hash is null) = (efootball_cipher is null));
  end if;
end $$;

-- Organizers choose any number of players; no fixed 64-slot cap or automatic waitlist.
drop trigger if exists application_capacity on application;
drop function if exists enforce_capacity();
alter table tournament drop constraint if exists tournament_capacity_check;

-- Format chosen in OM.
alter table tournament add column if not exists format text not null default 'league_knockout';
alter table tournament add column if not exists qualifiers integer not null default 8;
alter table tournament alter column opponents drop not null;
alter table tournament alter column opponents drop default;
alter table tournament drop constraint if exists tournament_opponents_check;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tournament_format_check') then
    alter table tournament add constraint tournament_format_check
      check (format in ('league', 'knockout', 'league_knockout'));
    alter table tournament add constraint tournament_qualifiers_check
      check (qualifiers in (2, 4, 8, 16, 32));
    alter table tournament add constraint tournament_opponents_check
      check (opponents is null or opponents between 1 and 63);
  end if;
end $$;
update tournament set opponents = null where opponents = 4 and status = 'draft';

-- Knockout byes: a first-round slot with no opponent (the present player advances).
alter table fixture alter column away drop not null;
alter table qualification drop constraint if exists qualification_rank_check;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qualification_rank_range') then
    alter table qualification add constraint qualification_rank_range check (rank between 1 and 32);
  end if;
end $$;

-- Neutral default name; organizers rename the tournament in OM.
update tournament set name = 'XGamer Pro League' where name = 'XGamer 2.0 • October Cup';
