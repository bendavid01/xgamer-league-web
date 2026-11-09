-- 007: Keep the team name each player used in each tournament.
--
-- player.team_name stays the player's CURRENT team (refreshed when they register again).
-- application.team_name is the team for THAT tournament; a later registration never
-- changes it. Additive only: no rows are deleted and no player IDs change.
--
-- Backfill uses recorded facts only. Every registration writes an immutable audit
-- record ('application.create') holding the team typed in that registration; that is
-- copied to its entry. Entries without such a record stay NULL (shown without a team).
-- A player's current team is never copied onto older tournaments.
--
-- team_name_source: 'registration' (stored when registering, from this release on)
--                   'registration_record' (recovered from the registration audit record)
alter table application add column if not exists team_name text;
alter table application add column if not exists team_name_source text;
alter table application drop constraint if exists application_team_name_source_check;
alter table application add constraint application_team_name_source_check
  check (team_name_source is null or team_name_source in ('registration', 'registration_record'));

update application a
set team_name = r.team, team_name_source = 'registration_record'
from (
  select distinct on (entity) entity, nullif(after_value->>'team', '') as team
  from audit_event
  where action = 'application.create'
  order by entity, created_at desc, id desc
) r
where r.entity = a.id::text and r.team is not null and a.team_name is null;
