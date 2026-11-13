-- 008: Allow the organizer provenance labels for tournament team names.
--
-- Schema only. No rows are written or changed, and nothing here names a player,
-- an entry or a database. Needs 007: without its column and constraint the
-- statements below fail and the whole migration is rolled back.
--
-- team_name_source:
--   'registration'         typed by the player when registering (007)
--   'registration_record'  recovered from the immutable registration record (007)
--   'organizer_attested'   a main admin attested the team in OM, from computed evidence
--   'organizer_corrected'  a main admin set or corrected the team in OM, with a reason and evidence
alter table application drop constraint application_team_name_source_check;
alter table application add constraint application_team_name_source_check
  check (team_name_source is null or team_name_source in (
    'registration', 'registration_record', 'organizer_attested', 'organizer_corrected'));
