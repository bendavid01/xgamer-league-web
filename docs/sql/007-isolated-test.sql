-- XG — migration 007 approval package: backup check, isolated test, reconciliation.
-- Run in the Neon SQL Editor. Parts A and B are read-only.
-- Part C writes, so run it ONLY on the test branch `test-007`, never on production.
--
-- Steps (Neon console → project of `xgamer-league` → Branches):
--   1. Create branch `backup-before-007` from production (the restore point). Keep it.
--   2. Create branch `test-007` from production.
--   3. Run Part A on production, on `backup-before-007` and on `test-007`: all three must match.
--   4. On `test-007` only: run Part B, then Part C (paste migrations/007_application_team_name.sql),
--      then Part A again and Part D. Part A must still match; Part D shows the recovered names.
--   5. Send Claude the outputs. Delete `test-007` afterwards; keep the backup until 007 is live and verified.

-- ── Part A: snapshot (read-only). Same numbers before and after 007. ──
select 'players' as check, count(*)::text as value from player
union all select 'players_active', count(*)::text from player where deleted_at is null
union all select 'highest_xg_id', coalesce(max(public_no), 0)::text from player
union all select 'tournaments', count(*)::text from tournament
union all select 'entries', count(*)::text from application
union all select 'approved_entries', count(*)::text from application where status = 'approved' and deleted_at is null
union all select 'scored_fixtures', count(*)::text from fixture where home_score is not null
union all select 'goals', coalesce(sum(home_score + away_score), 0)::text from fixture where home_score is not null
union all select 'final_positions', count(*)::text from podium
union all select 'audit_records', count(*)::text from audit_event
union all select 'migrations', string_agg(name, ', ' order by name) from xgamer_migration
union all select 'players_fingerprint', md5(string_agg(id::text || ':' || public_no || ':' || gaming_name || ':' || coalesce(team_name, ''), ',' order by public_no)) from player
union all select 'results_fingerprint', md5(string_agg(id::text || ':' || coalesce(home_score::text, '-') || ':' || coalesce(away_score::text, '-'), ',' order by id)) from fixture
union all select 'final_positions_fingerprint', md5(string_agg(tournament_id || ':' || place || ':' || player_id::text, ',' order by tournament_id, place)) from podium;

-- ── Part B: dry run (read-only). What 007 will recover from registration records. ──
select count(*) as entries,
       count(r.team) as recoverable_from_registration_records,
       count(*) - count(r.team) as not_recorded_stays_empty
from application a
left join (
  select distinct on (entity) entity, nullif(after_value ->> 'team', '') as team
  from audit_event
  where action = 'application.create'
  order by entity, created_at desc, id desc
) r on r.entity = a.id::text;

-- ── Part C: apply 007 — test-007 ONLY. Paste migrations/007_application_team_name.sql here. ──

-- ── Part D: after 007 (read-only) ──
select coalesce(team_name_source, 'not recorded') as source, count(*) from application group by 1 order by 1;
select t.name as tournament, p.public_no as xg_id, p.gaming_name as player,
       a.team_name as team_in_this_tournament, p.team_name as current_team
from application a join player p on p.id = a.player_id join tournament t on t.id = a.tournament_id
where a.deleted_at is null
order by t.created_at, p.public_no;
