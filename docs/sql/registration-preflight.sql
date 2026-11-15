-- Registration release preflight (L3). READ ONLY: it changes nothing.
--
-- Run the whole file against the target database BEFORE applying the release packet
-- (007 -> 008 -> 009 -> 011 -> 012). It returns one row per check with status
-- 'pass', 'warn' or 'fail'. Any 'fail' means: stop, do not apply, report it.
--
-- It is safe on a database without the migration ledger: the ledger is read through
-- query_to_xml only when public.xgamer_migration exists.
-- Expected checksums are the LF ones issued with this code; the CRLF value of the
-- same file (a Windows checkout) is reported as 'warn' (same SQL, not an edit).
-- tests/registration-preflight.integration.test.ts keeps this file in sync with
-- migrations/ and runs it against disposable databases.

begin transaction read only;
-- Definitions below are printed relative to the search path (a foreign key reads
-- "REFERENCES player(id)" only while public is on it). Fixed for this transaction.
set local search_path = public;

with expected(name, lf_hash, crlf_hash) as (values
  ('001_control_center', 'ab5720d1adcdce493aad0d728a9bdf8da2c4de5f1ee9a25930a870b45b673066', '7f1441ca6ba5a8210b6972fb7d37e2990a621de909a7672d62906e78ad096d37'),
  ('002_open_registration', 'a834fadbc255c4bde33ea3620beb6a70f2f5ed70326db7963dca5fd8d60df03c', 'e36569c5ea45c2a27cf693704c6b7e41d59fd972a6ced903fab4a28b13c60908'),
  ('003_multi_tournament', 'cc60e24411fd2a8cb3bc62e1145d8e30cd27f92ece89e2728d36dbdf0cf256d7', '77ae9a6527457dd0e8a225ceb48a7c9a6f282af12b0af5c56bf75ba2a937ce7b'),
  ('004_seasons_podium', 'fde24c503a800f3820087bc418d3625432b7c5770bfcbedd907d462fd39d85b3', '9aaf0734de03520a8aa74a4b470e2c5ac9b266a0835ecea0074c69a99af87430'),
  ('005_announcement_dates', '30f43e74e0c7e22f9a06c6e89e2069976c04bc86a23127bbe0fb2e1d07b3ee1d', 'ab3d886347286c0776b08ea6436583e3a355b7406b0d42e7d1495703866c43fd'),
  ('007_application_team_name', 'bbc004390ba1b09cbc7ce09c2fc644192e7d081d92e54a3bfaec397655f5ea41', '3e079a974ca162e330eeb06bff31060b490c658d6c96e5ff7d79d49ebf63d27a'),
  ('008_team_name_provenance', 'ef7e292c35ac579b37964406ff5bf9f149fd78fec841e83054f1d9f4494b20d1', '68a176bd9898123b6555eb301d4a3ff59878d07526e8707ba52830173d68b15b'),
  ('009_contact_change', 'af65cfb2a18f63b07ec3cdc7c1945ac18c44a0ae1a46c503742ddb2567f73097', 'a34ea5a21be419c8ce1b816eae9b8b0400b28d8f2bda549a0ec6a00ee3b91f87'),
  ('011_returning_player_registration', 'd179cc982a00a3d1b585e0a5c5d779d94052db02d1640f60408bb5a05259d450', '179dbc300cd658ce0a80eeadecee997c836fadf53c4856cb251345405fe447dd'),
  ('012_new_player_registration_approval', 'd946cfe3750594eb42bc380a7e874726d3d2006fe0e18129de6b4e1e4d6a4012', '6801254160983b814deb0d947071b2d7f604b38042b25a59e5cf7e3749a6eed0')
),
-- Objects each pending migration creates. They must not exist before it is applied.
created(migration, object) as (values
  ('009_contact_change', 'public.contact_change'),
  ('009_contact_change', 'public.contact_change_open_player'),
  ('009_contact_change', 'public.contact_change_open_number'),
  ('009_contact_change', 'public.contact_change_queue'),
  ('011_returning_player_registration', 'public.returning_registration_request'),
  ('011_returning_player_registration', 'public.returning_registration_pending_claim'),
  ('011_returning_player_registration', 'public.returning_registration_pending_queue'),
  ('012_new_player_registration_approval', 'public.new_player_registration_request'),
  ('012_new_player_registration_approval', 'public.new_player_registration_pending_claim'),
  ('012_new_player_registration_approval', 'public.new_player_registration_pending_queue')
),
-- Columns this code reads, added by pending migrations with "add column if not exists".
added(migration, tbl, col) as (values
  ('007_application_team_name', 'application', 'team_name'),
  ('007_application_team_name', 'application', 'team_name_source'),
  ('009_contact_change', 'player', 'contact_version'),
  ('009_contact_change', 'player', 'contact_verified_at'),
  ('009_contact_change', 'player', 'contact_verification_method')
),
-- Every index and constraint (NOT NULL included) on the tables these migrations
-- create, as PostgreSQL 18 prints it once 001-012 are applied, with the migration
-- that last sets it. An applied migration's definitions must all be present: a
-- name alone is not enough, because "create ... if not exists" keeps an index of
-- the same name with other columns, another predicate or no uniqueness.
-- Constraints are compared by table, type and definition (generated names can
-- differ after an upgrade); indexes by their full definition, name included.
-- tests/registration-preflight.integration.test.ts regenerates this list from a
-- fresh database, one migration at a time, and requires it to be identical.
defs(migration, kind, tbl, name, def) as (values
  ('001_control_center', 'index', 'announcement', 'announcement_pkey', 'CREATE UNIQUE INDEX announcement_pkey ON public.announcement USING btree (id)'),
  ('001_control_center', 'f', 'announcement', 'announcement_tournament_id_fkey', 'FOREIGN KEY (tournament_id) REFERENCES tournament(id)'),
  ('001_control_center', 'n', 'announcement', 'announcement_id_not_null', 'NOT NULL id'),
  ('001_control_center', 'n', 'announcement', 'announcement_message_not_null', 'NOT NULL message'),
  ('001_control_center', 'n', 'announcement', 'announcement_published_not_null', 'NOT NULL published'),
  ('001_control_center', 'n', 'announcement', 'announcement_revision_not_null', 'NOT NULL revision'),
  ('001_control_center', 'n', 'announcement', 'announcement_title_not_null', 'NOT NULL title'),
  ('001_control_center', 'n', 'announcement', 'announcement_tournament_id_not_null', 'NOT NULL tournament_id'),
  ('001_control_center', 'p', 'announcement', 'announcement_pkey', 'PRIMARY KEY (id)'),
  ('001_control_center', 'index', 'application', 'application_pkey', 'CREATE UNIQUE INDEX application_pkey ON public.application USING btree (id)'),
  ('001_control_center', 'index', 'application', 'application_tournament_id_player_id_key', 'CREATE UNIQUE INDEX application_tournament_id_player_id_key ON public.application USING btree (tournament_id, player_id)'),
  ('001_control_center', 'c', 'application', 'application_status_check', 'CHECK ((status = ANY (ARRAY[''pending''::text, ''waitlisted''::text, ''approved''::text, ''rejected''::text, ''withdrawn''::text])))'),
  ('001_control_center', 'f', 'application', 'application_player_id_fkey', 'FOREIGN KEY (player_id) REFERENCES player(id)'),
  ('001_control_center', 'f', 'application', 'application_tournament_id_fkey', 'FOREIGN KEY (tournament_id) REFERENCES tournament(id)'),
  ('001_control_center', 'n', 'application', 'application_created_at_not_null', 'NOT NULL created_at'),
  ('001_control_center', 'n', 'application', 'application_id_not_null', 'NOT NULL id'),
  ('001_control_center', 'n', 'application', 'application_player_id_not_null', 'NOT NULL player_id'),
  ('001_control_center', 'n', 'application', 'application_revision_not_null', 'NOT NULL revision'),
  ('001_control_center', 'n', 'application', 'application_status_not_null', 'NOT NULL status'),
  ('001_control_center', 'n', 'application', 'application_tournament_id_not_null', 'NOT NULL tournament_id'),
  ('001_control_center', 'p', 'application', 'application_pkey', 'PRIMARY KEY (id)'),
  ('001_control_center', 'u', 'application', 'application_tournament_id_player_id_key', 'UNIQUE (tournament_id, player_id)'),
  ('001_control_center', 'index', 'audit_event', 'audit_event_pkey', 'CREATE UNIQUE INDEX audit_event_pkey ON public.audit_event USING btree (id)'),
  ('001_control_center', 'n', 'audit_event', 'audit_event_action_not_null', 'NOT NULL action'),
  ('001_control_center', 'n', 'audit_event', 'audit_event_actor_not_null', 'NOT NULL actor'),
  ('001_control_center', 'n', 'audit_event', 'audit_event_created_at_not_null', 'NOT NULL created_at'),
  ('001_control_center', 'n', 'audit_event', 'audit_event_entity_not_null', 'NOT NULL entity'),
  ('001_control_center', 'n', 'audit_event', 'audit_event_id_not_null', 'NOT NULL id'),
  ('001_control_center', 'p', 'audit_event', 'audit_event_pkey', 'PRIMARY KEY (id)'),
  ('001_control_center', 'index', 'coordinator', 'coordinator_pkey', 'CREATE UNIQUE INDEX coordinator_pkey ON public.coordinator USING btree (discord_id)'),
  ('001_control_center', 'c', 'coordinator', 'coordinator_discord_id_check', 'CHECK ((discord_id ~ ''^[0-9]{17,20}$''::text))'),
  ('001_control_center', 'c', 'coordinator', 'coordinator_operations_check', 'CHECK ((operations <@ ARRAY[''registrations''::text, ''results''::text, ''announcements''::text]))'),
  ('001_control_center', 'n', 'coordinator', 'coordinator_active_not_null', 'NOT NULL active'),
  ('001_control_center', 'n', 'coordinator', 'coordinator_discord_id_not_null', 'NOT NULL discord_id'),
  ('001_control_center', 'n', 'coordinator', 'coordinator_operations_not_null', 'NOT NULL operations'),
  ('001_control_center', 'n', 'coordinator', 'coordinator_tournaments_not_null', 'NOT NULL tournaments'),
  ('001_control_center', 'p', 'coordinator', 'coordinator_pkey', 'PRIMARY KEY (discord_id)'),
  ('001_control_center', 'index', 'finals_access', 'finals_access_pkey', 'CREATE UNIQUE INDEX finals_access_pkey ON public.finals_access USING btree (tournament_id)'),
  ('001_control_center', 'f', 'finals_access', 'finals_access_tournament_id_fkey', 'FOREIGN KEY (tournament_id) REFERENCES tournament(id)'),
  ('001_control_center', 'n', 'finals_access', 'finals_access_credential_cipher_not_null', 'NOT NULL credential_cipher'),
  ('001_control_center', 'n', 'finals_access', 'finals_access_released_not_null', 'NOT NULL released'),
  ('001_control_center', 'n', 'finals_access', 'finals_access_tournament_id_not_null', 'NOT NULL tournament_id'),
  ('001_control_center', 'p', 'finals_access', 'finals_access_pkey', 'PRIMARY KEY (tournament_id)'),
  ('001_control_center', 'index', 'fixture', 'fixture_pkey', 'CREATE UNIQUE INDEX fixture_pkey ON public.fixture USING btree (id)'),
  ('001_control_center', 'index', 'fixture', 'fixture_tournament_id_stage_round_home_away_key', 'CREATE UNIQUE INDEX fixture_tournament_id_stage_round_home_away_key ON public.fixture USING btree (tournament_id, stage, round, home, away)'),
  ('001_control_center', 'c', 'fixture', 'fixture_away_score_check', 'CHECK (((away_score >= 0) AND (away_score <= 99)))'),
  ('001_control_center', 'c', 'fixture', 'fixture_check', 'CHECK ((home <> away))'),
  ('001_control_center', 'c', 'fixture', 'fixture_check1', 'CHECK (((home_score IS NULL) = (away_score IS NULL)))'),
  ('001_control_center', 'c', 'fixture', 'fixture_check2', 'CHECK (((winner IS NULL) OR (winner = home) OR (winner = away)))'),
  ('001_control_center', 'c', 'fixture', 'fixture_home_score_check', 'CHECK (((home_score >= 0) AND (home_score <= 99)))'),
  ('001_control_center', 'c', 'fixture', 'fixture_stage_check', 'CHECK ((stage = ANY (ARRAY[''league''::text, ''knockout''::text])))'),
  ('001_control_center', 'f', 'fixture', 'fixture_away_fkey', 'FOREIGN KEY (away) REFERENCES player(id)'),
  ('001_control_center', 'f', 'fixture', 'fixture_home_fkey', 'FOREIGN KEY (home) REFERENCES player(id)'),
  ('001_control_center', 'f', 'fixture', 'fixture_tournament_id_fkey', 'FOREIGN KEY (tournament_id) REFERENCES tournament(id)'),
  ('001_control_center', 'f', 'fixture', 'fixture_winner_fkey', 'FOREIGN KEY (winner) REFERENCES player(id)'),
  ('001_control_center', 'n', 'fixture', 'fixture_home_not_null', 'NOT NULL home'),
  ('001_control_center', 'n', 'fixture', 'fixture_id_not_null', 'NOT NULL id'),
  ('001_control_center', 'n', 'fixture', 'fixture_revision_not_null', 'NOT NULL revision'),
  ('001_control_center', 'n', 'fixture', 'fixture_round_not_null', 'NOT NULL round'),
  ('001_control_center', 'n', 'fixture', 'fixture_slot_not_null', 'NOT NULL slot'),
  ('001_control_center', 'n', 'fixture', 'fixture_stage_not_null', 'NOT NULL stage'),
  ('001_control_center', 'n', 'fixture', 'fixture_tournament_id_not_null', 'NOT NULL tournament_id'),
  ('001_control_center', 'p', 'fixture', 'fixture_pkey', 'PRIMARY KEY (id)'),
  ('001_control_center', 'u', 'fixture', 'fixture_tournament_id_stage_round_home_away_key', 'UNIQUE (tournament_id, stage, round, home, away)'),
  ('001_control_center', 'index', 'player', 'player_contact_hash_key', 'CREATE UNIQUE INDEX player_contact_hash_key ON public.player USING btree (contact_hash)'),
  ('001_control_center', 'index', 'player', 'player_discord_id_key', 'CREATE UNIQUE INDEX player_discord_id_key ON public.player USING btree (discord_id)'),
  ('001_control_center', 'index', 'player', 'player_efootball_hash_key', 'CREATE UNIQUE INDEX player_efootball_hash_key ON public.player USING btree (efootball_hash)'),
  ('001_control_center', 'index', 'player', 'player_pkey', 'CREATE UNIQUE INDEX player_pkey ON public.player USING btree (id)'),
  ('001_control_center', 'c', 'player', 'player_preference_check', 'CHECK ((preference = ANY (ARRAY[''whatsapp''::text, ''discord''::text])))'),
  ('001_control_center', 'n', 'player', 'player_consent_at_not_null', 'NOT NULL consent_at'),
  ('001_control_center', 'n', 'player', 'player_consent_version_not_null', 'NOT NULL consent_version'),
  ('001_control_center', 'n', 'player', 'player_contact_cipher_not_null', 'NOT NULL contact_cipher'),
  ('001_control_center', 'n', 'player', 'player_contact_hash_not_null', 'NOT NULL contact_hash'),
  ('001_control_center', 'n', 'player', 'player_gaming_name_not_null', 'NOT NULL gaming_name'),
  ('001_control_center', 'n', 'player', 'player_id_not_null', 'NOT NULL id'),
  ('001_control_center', 'n', 'player', 'player_preference_not_null', 'NOT NULL preference'),
  ('001_control_center', 'p', 'player', 'player_pkey', 'PRIMARY KEY (id)'),
  ('001_control_center', 'u', 'player', 'player_contact_hash_key', 'UNIQUE (contact_hash)'),
  ('001_control_center', 'u', 'player', 'player_discord_id_key', 'UNIQUE (discord_id)'),
  ('001_control_center', 'u', 'player', 'player_efootball_hash_key', 'UNIQUE (efootball_hash)'),
  ('001_control_center', 'index', 'qualification', 'qualification_pkey', 'CREATE UNIQUE INDEX qualification_pkey ON public.qualification USING btree (tournament_id, player_id)'),
  ('001_control_center', 'index', 'qualification', 'qualification_tournament_id_rank_key', 'CREATE UNIQUE INDEX qualification_tournament_id_rank_key ON public.qualification USING btree (tournament_id, rank)'),
  ('001_control_center', 'f', 'qualification', 'qualification_player_id_fkey', 'FOREIGN KEY (player_id) REFERENCES player(id)'),
  ('001_control_center', 'f', 'qualification', 'qualification_tournament_id_fkey', 'FOREIGN KEY (tournament_id) REFERENCES tournament(id)'),
  ('001_control_center', 'n', 'qualification', 'qualification_player_id_not_null', 'NOT NULL player_id'),
  ('001_control_center', 'n', 'qualification', 'qualification_rank_not_null', 'NOT NULL rank'),
  ('001_control_center', 'n', 'qualification', 'qualification_tournament_id_not_null', 'NOT NULL tournament_id'),
  ('001_control_center', 'p', 'qualification', 'qualification_pkey', 'PRIMARY KEY (tournament_id, player_id)'),
  ('001_control_center', 'u', 'qualification', 'qualification_tournament_id_rank_key', 'UNIQUE (tournament_id, rank)'),
  ('001_control_center', 'index', 'rate_limit', 'rate_limit_pkey', 'CREATE UNIQUE INDEX rate_limit_pkey ON public.rate_limit USING btree (key)'),
  ('001_control_center', 'n', 'rate_limit', 'rate_limit_expires_at_not_null', 'NOT NULL expires_at'),
  ('001_control_center', 'n', 'rate_limit', 'rate_limit_hits_not_null', 'NOT NULL hits'),
  ('001_control_center', 'n', 'rate_limit', 'rate_limit_key_not_null', 'NOT NULL key'),
  ('001_control_center', 'p', 'rate_limit', 'rate_limit_pkey', 'PRIMARY KEY (key)'),
  ('001_control_center', 'index', 'tournament', 'tournament_pkey', 'CREATE UNIQUE INDEX tournament_pkey ON public.tournament USING btree (id)'),
  ('001_control_center', 'c', 'tournament', 'tournament_status_check', 'CHECK ((status = ANY (ARRAY[''draft''::text, ''open''::text, ''locked''::text, ''league''::text, ''knockout''::text, ''completed''::text])))'),
  ('001_control_center', 'n', 'tournament', 'tournament_capacity_not_null', 'NOT NULL capacity'),
  ('001_control_center', 'n', 'tournament', 'tournament_id_not_null', 'NOT NULL id'),
  ('001_control_center', 'n', 'tournament', 'tournament_name_not_null', 'NOT NULL name'),
  ('001_control_center', 'n', 'tournament', 'tournament_revision_not_null', 'NOT NULL revision'),
  ('001_control_center', 'n', 'tournament', 'tournament_status_not_null', 'NOT NULL status'),
  ('001_control_center', 'p', 'tournament', 'tournament_pkey', 'PRIMARY KEY (id)'),
  ('001_control_center', 'index', 'xgamer_migration', 'xgamer_migration_pkey', 'CREATE UNIQUE INDEX xgamer_migration_pkey ON public.xgamer_migration USING btree (name)'),
  ('001_control_center', 'n', 'xgamer_migration', 'xgamer_migration_applied_at_not_null', 'NOT NULL applied_at'),
  ('001_control_center', 'n', 'xgamer_migration', 'xgamer_migration_hash_not_null', 'NOT NULL hash'),
  ('001_control_center', 'n', 'xgamer_migration', 'xgamer_migration_name_not_null', 'NOT NULL name'),
  ('001_control_center', 'p', 'xgamer_migration', 'xgamer_migration_pkey', 'PRIMARY KEY (name)'),
  ('002_open_registration', 'c', 'player', 'player_efootball_pair', 'CHECK (((efootball_hash IS NULL) = (efootball_cipher IS NULL)))'),
  ('002_open_registration', 'c', 'qualification', 'qualification_rank_range', 'CHECK (((rank >= 1) AND (rank <= 32)))'),
  ('002_open_registration', 'c', 'tournament', 'tournament_opponents_check', 'CHECK (((opponents IS NULL) OR ((opponents >= 1) AND (opponents <= 63))))'),
  ('002_open_registration', 'c', 'tournament', 'tournament_qualifiers_check', 'CHECK ((qualifiers = ANY (ARRAY[2, 4, 8, 16, 32])))'),
  ('002_open_registration', 'n', 'tournament', 'tournament_format_not_null', 'NOT NULL format'),
  ('002_open_registration', 'n', 'tournament', 'tournament_qualifiers_not_null', 'NOT NULL qualifiers'),
  ('003_multi_tournament', 'index', 'fixture', 'league_pair_ordered', 'CREATE UNIQUE INDEX league_pair_ordered ON public.fixture USING btree (tournament_id, home, away) WHERE (stage = ''league''::text)'),
  ('003_multi_tournament', 'index', 'player', 'player_public_no', 'CREATE UNIQUE INDEX player_public_no ON public.player USING btree (public_no)'),
  ('003_multi_tournament', 'n', 'player', 'player_public_no_not_null', 'NOT NULL public_no'),
  ('003_multi_tournament', 'c', 'tournament', 'tournament_fee_check', 'CHECK (((entry_fee IS NULL) OR (entry_fee >= 0)))'),
  ('003_multi_tournament', 'c', 'tournament', 'tournament_format_v2', 'CHECK ((format = ANY (ARRAY[''league''::text, ''knockout''::text])))'),
  ('003_multi_tournament', 'c', 'tournament', 'tournament_legs_check', 'CHECK ((legs = ANY (ARRAY[1, 2])))'),
  ('003_multi_tournament', 'n', 'tournament', 'tournament_created_at_not_null', 'NOT NULL created_at'),
  ('003_multi_tournament', 'n', 'tournament', 'tournament_knockout_not_null', 'NOT NULL knockout'),
  ('003_multi_tournament', 'n', 'tournament', 'tournament_legs_not_null', 'NOT NULL legs'),
  ('004_seasons_podium', 'index', 'podium', 'podium_pkey', 'CREATE UNIQUE INDEX podium_pkey ON public.podium USING btree (tournament_id, place)'),
  ('004_seasons_podium', 'index', 'podium', 'podium_tournament_id_player_id_key', 'CREATE UNIQUE INDEX podium_tournament_id_player_id_key ON public.podium USING btree (tournament_id, player_id)'),
  ('004_seasons_podium', 'c', 'podium', 'podium_place_check', 'CHECK (((place >= 1) AND (place <= 3)))'),
  ('004_seasons_podium', 'f', 'podium', 'podium_player_id_fkey', 'FOREIGN KEY (player_id) REFERENCES player(id)'),
  ('004_seasons_podium', 'f', 'podium', 'podium_tournament_id_fkey', 'FOREIGN KEY (tournament_id) REFERENCES tournament(id)'),
  ('004_seasons_podium', 'n', 'podium', 'podium_place_not_null', 'NOT NULL place'),
  ('004_seasons_podium', 'n', 'podium', 'podium_player_id_not_null', 'NOT NULL player_id'),
  ('004_seasons_podium', 'n', 'podium', 'podium_tournament_id_not_null', 'NOT NULL tournament_id'),
  ('004_seasons_podium', 'p', 'podium', 'podium_pkey', 'PRIMARY KEY (tournament_id, place)'),
  ('004_seasons_podium', 'u', 'podium', 'podium_tournament_id_player_id_key', 'UNIQUE (tournament_id, player_id)'),
  ('004_seasons_podium', 'index', 'tournament', 'tournament_competition_season', 'CREATE UNIQUE INDEX tournament_competition_season ON public.tournament USING btree (lower(competition), season) WHERE ((competition IS NOT NULL) AND (deleted_at IS NULL))'),
  ('004_seasons_podium', 'c', 'tournament', 'tournament_season_check', 'CHECK ((((competition IS NULL) AND (season IS NULL)) OR ((competition IS NOT NULL) AND (season IS NOT NULL) AND ((season >= 1) AND (season <= 999)))))'),
  ('004_seasons_podium', 'n', 'tournament', 'tournament_published_not_null', 'NOT NULL published'),
  ('004_seasons_podium', 'index', 'tournament_photo', 'tournament_photo_pkey', 'CREATE UNIQUE INDEX tournament_photo_pkey ON public.tournament_photo USING btree (tournament_id)'),
  ('004_seasons_podium', 'c', 'tournament_photo', 'tournament_photo_content_type_check', 'CHECK ((content_type = ANY (ARRAY[''image/jpeg''::text, ''image/webp''::text, ''image/png''::text])))'),
  ('004_seasons_podium', 'c', 'tournament_photo', 'tournament_photo_data_check', 'CHECK ((octet_length(data) <= 716800))'),
  ('004_seasons_podium', 'f', 'tournament_photo', 'tournament_photo_tournament_id_fkey', 'FOREIGN KEY (tournament_id) REFERENCES tournament(id)'),
  ('004_seasons_podium', 'n', 'tournament_photo', 'tournament_photo_content_type_not_null', 'NOT NULL content_type'),
  ('004_seasons_podium', 'n', 'tournament_photo', 'tournament_photo_data_not_null', 'NOT NULL data'),
  ('004_seasons_podium', 'n', 'tournament_photo', 'tournament_photo_tournament_id_not_null', 'NOT NULL tournament_id'),
  ('004_seasons_podium', 'n', 'tournament_photo', 'tournament_photo_updated_at_not_null', 'NOT NULL updated_at'),
  ('004_seasons_podium', 'p', 'tournament_photo', 'tournament_photo_pkey', 'PRIMARY KEY (tournament_id)'),
  ('005_announcement_dates', 'index', 'announcement', 'announcement_tournament_recent', 'CREATE INDEX announcement_tournament_recent ON public.announcement USING btree (tournament_id, created_at DESC) WHERE (deleted_at IS NULL)'),
  ('005_announcement_dates', 'n', 'announcement', 'announcement_created_at_not_null', 'NOT NULL created_at'),
  ('008_team_name_provenance', 'c', 'application', 'application_team_name_source_check', 'CHECK (((team_name_source IS NULL) OR (team_name_source = ANY (ARRAY[''registration''::text, ''registration_record''::text, ''organizer_attested''::text, ''organizer_corrected''::text]))))'),
  ('009_contact_change', 'index', 'contact_change', 'contact_change_open_number', 'CREATE UNIQUE INDEX contact_change_open_number ON public.contact_change USING btree (new_contact_hash) WHERE (status = ANY (ARRAY[''pending_code''::text, ''awaiting_second_admin''::text]))'),
  ('009_contact_change', 'index', 'contact_change', 'contact_change_open_player', 'CREATE UNIQUE INDEX contact_change_open_player ON public.contact_change USING btree (player_id) WHERE (status = ANY (ARRAY[''pending_code''::text, ''awaiting_second_admin''::text]))'),
  ('009_contact_change', 'index', 'contact_change', 'contact_change_pkey', 'CREATE UNIQUE INDEX contact_change_pkey ON public.contact_change USING btree (id)'),
  ('009_contact_change', 'index', 'contact_change', 'contact_change_queue', 'CREATE INDEX contact_change_queue ON public.contact_change USING btree (status, created_at)'),
  ('009_contact_change', 'c', 'contact_change', 'contact_change_attempts_check', 'CHECK (((attempts >= 0) AND (attempts <= 5)))'),
  ('009_contact_change', 'c', 'contact_change', 'contact_change_check', 'CHECK (((route = ''independent_evidence''::text) = ((evidence_type IS NOT NULL) AND (evidence_note IS NOT NULL))))'),
  ('009_contact_change', 'c', 'contact_change', 'contact_change_check1', 'CHECK (((evidence_type <> ALL (ARRAY[''known_person_live_video''::text, ''known_person_in_person''::text])) OR (evidence_observed_at IS NOT NULL)))'),
  ('009_contact_change', 'c', 'contact_change', 'contact_change_check2', 'CHECK (((evidence_type IS DISTINCT FROM ''efootball_possession''::text) OR (challenge_hash IS NOT NULL) OR (status <> ALL (ARRAY[''pending_code''::text, ''awaiting_second_admin''::text]))))'),
  ('009_contact_change', 'c', 'contact_change', 'contact_change_check3', 'CHECK (((evidence_type = ''efootball_possession''::text) OR (challenge_hash IS NULL)))'),
  ('009_contact_change', 'c', 'contact_change', 'contact_change_check4', 'CHECK (((approved_by IS NULL) OR (approved_by <> requested_by)))'),
  ('009_contact_change', 'c', 'contact_change', 'contact_change_check5', 'CHECK (((status <> ALL (ARRAY[''awaiting_second_admin''::text, ''completed''::text])) OR (code_checked_at IS NOT NULL)))'),
  ('009_contact_change', 'c', 'contact_change', 'contact_change_check6', 'CHECK (((status <> ''awaiting_second_admin''::text) OR ((route = ''independent_evidence''::text) AND (approve_by IS NOT NULL))))'),
  ('009_contact_change', 'c', 'contact_change', 'contact_change_check7', 'CHECK (((status <> ''completed''::text) OR (route = ''established_channel''::text) OR (approved_by IS NOT NULL)))'),
  ('009_contact_change', 'c', 'contact_change', 'contact_change_check8', 'CHECK (((status <> ''completed''::text) OR (evidence_type IS DISTINCT FROM ''efootball_possession''::text) OR (challenge_confirmed_at IS NOT NULL)))'),
  ('009_contact_change', 'c', 'contact_change', 'contact_change_check9', 'CHECK (((status = ANY (ARRAY[''pending_code''::text, ''awaiting_second_admin''::text])) = (finished_at IS NULL)))'),
  ('009_contact_change', 'c', 'contact_change', 'contact_change_evidence_note_check', 'CHECK (((evidence_note IS NULL) OR ((char_length(evidence_note) >= 20) AND (char_length(evidence_note) <= 500))))'),
  ('009_contact_change', 'c', 'contact_change', 'contact_change_evidence_type_check', 'CHECK ((evidence_type = ANY (ARRAY[''efootball_possession''::text, ''known_person_live_video''::text, ''known_person_in_person''::text])))'),
  ('009_contact_change', 'c', 'contact_change', 'contact_change_resends_check', 'CHECK (((resends >= 0) AND (resends <= 2)))'),
  ('009_contact_change', 'c', 'contact_change', 'contact_change_route_check', 'CHECK ((route = ANY (ARRAY[''established_channel''::text, ''independent_evidence''::text])))'),
  ('009_contact_change', 'c', 'contact_change', 'contact_change_status_check', 'CHECK ((status = ANY (ARRAY[''pending_code''::text, ''awaiting_second_admin''::text, ''completed''::text, ''cancelled''::text, ''failed''::text, ''expired''::text])))'),
  ('009_contact_change', 'f', 'contact_change', 'contact_change_player_id_fkey', 'FOREIGN KEY (player_id) REFERENCES player(id)'),
  ('009_contact_change', 'f', 'contact_change', 'contact_change_tournament_id_fkey', 'FOREIGN KEY (tournament_id) REFERENCES tournament(id)'),
  ('009_contact_change', 'n', 'contact_change', 'contact_change_attempts_not_null', 'NOT NULL attempts'),
  ('009_contact_change', 'n', 'contact_change', 'contact_change_created_at_not_null', 'NOT NULL created_at'),
  ('009_contact_change', 'n', 'contact_change', 'contact_change_expires_at_not_null', 'NOT NULL expires_at'),
  ('009_contact_change', 'n', 'contact_change', 'contact_change_from_contact_version_not_null', 'NOT NULL from_contact_version'),
  ('009_contact_change', 'n', 'contact_change', 'contact_change_id_not_null', 'NOT NULL id'),
  ('009_contact_change', 'n', 'contact_change', 'contact_change_new_contact_cipher_not_null', 'NOT NULL new_contact_cipher'),
  ('009_contact_change', 'n', 'contact_change', 'contact_change_new_contact_hash_not_null', 'NOT NULL new_contact_hash'),
  ('009_contact_change', 'n', 'contact_change', 'contact_change_player_id_not_null', 'NOT NULL player_id'),
  ('009_contact_change', 'n', 'contact_change', 'contact_change_requested_by_not_null', 'NOT NULL requested_by'),
  ('009_contact_change', 'n', 'contact_change', 'contact_change_resends_not_null', 'NOT NULL resends'),
  ('009_contact_change', 'n', 'contact_change', 'contact_change_route_not_null', 'NOT NULL route'),
  ('009_contact_change', 'n', 'contact_change', 'contact_change_status_not_null', 'NOT NULL status'),
  ('009_contact_change', 'n', 'contact_change', 'contact_change_tournament_id_not_null', 'NOT NULL tournament_id'),
  ('009_contact_change', 'p', 'contact_change', 'contact_change_pkey', 'PRIMARY KEY (id)'),
  ('009_contact_change', 'c', 'player', 'player_contact_attestation_method', 'CHECK (((contact_verification_method IS NULL) OR (contact_verification_method = ANY (ARRAY[''organizer_attested_established_channel''::text, ''organizer_attested_independent_evidence''::text]))))'),
  ('009_contact_change', 'c', 'player', 'player_contact_attestation_pair', 'CHECK (((contact_verified_at IS NULL) = (contact_verification_method IS NULL)))'),
  ('009_contact_change', 'c', 'player', 'player_contact_version_positive', 'CHECK ((contact_version >= 1))'),
  ('009_contact_change', 'n', 'player', 'player_contact_version_not_null', 'NOT NULL contact_version'),
  ('011_returning_player_registration', 'index', 'returning_registration_request', 'returning_registration_pending_claim', 'CREATE UNIQUE INDEX returning_registration_pending_claim ON public.returning_registration_request USING btree (tournament_id, contact_proof) WHERE (status = ''pending''::text)'),
  ('011_returning_player_registration', 'index', 'returning_registration_request', 'returning_registration_pending_queue', 'CREATE INDEX returning_registration_pending_queue ON public.returning_registration_request USING btree (tournament_id, created_at, id) WHERE (status = ''pending''::text)'),
  ('011_returning_player_registration', 'index', 'returning_registration_request', 'returning_registration_request_application_id_key', 'CREATE UNIQUE INDEX returning_registration_request_application_id_key ON public.returning_registration_request USING btree (application_id)'),
  ('011_returning_player_registration', 'index', 'returning_registration_request', 'returning_registration_request_pkey', 'CREATE UNIQUE INDEX returning_registration_request_pkey ON public.returning_registration_request USING btree (id)'),
  ('011_returning_player_registration', 'c', 'returning_registration_request', 'returning_registration_request_check', 'CHECK (((status = ''pending''::text) = (decided_at IS NULL)))'),
  ('011_returning_player_registration', 'c', 'returning_registration_request', 'returning_registration_request_check1', 'CHECK (((status = ''pending''::text) = (contact_proof IS NOT NULL)))'),
  ('011_returning_player_registration', 'c', 'returning_registration_request', 'returning_registration_request_check2', 'CHECK (((status = ''pending''::text) = (team_name IS NOT NULL)))'),
  ('011_returning_player_registration', 'c', 'returning_registration_request', 'returning_registration_request_check3', 'CHECK (((status = ''approved''::text) = (application_id IS NOT NULL)))'),
  ('011_returning_player_registration', 'c', 'returning_registration_request', 'returning_registration_request_claimed_public_no_check', 'CHECK ((claimed_public_no > 0))'),
  ('011_returning_player_registration', 'c', 'returning_registration_request', 'returning_registration_request_contact_proof_check', 'CHECK ((contact_proof ~ ''^[a-f0-9]{64}$''::text))'),
  ('011_returning_player_registration', 'c', 'returning_registration_request', 'returning_registration_request_status_check', 'CHECK ((status = ANY (ARRAY[''pending''::text, ''approved''::text, ''rejected''::text])))'),
  ('011_returning_player_registration', 'c', 'returning_registration_request', 'returning_registration_request_team_name_check', 'CHECK (((char_length(team_name) >= 2) AND (char_length(team_name) <= 40)))'),
  ('011_returning_player_registration', 'f', 'returning_registration_request', 'returning_registration_request_application_id_fkey', 'FOREIGN KEY (application_id) REFERENCES application(id)'),
  ('011_returning_player_registration', 'f', 'returning_registration_request', 'returning_registration_request_tournament_id_fkey', 'FOREIGN KEY (tournament_id) REFERENCES tournament(id)'),
  ('011_returning_player_registration', 'n', 'returning_registration_request', 'returning_registration_request_claimed_public_no_not_null', 'NOT NULL claimed_public_no'),
  ('011_returning_player_registration', 'n', 'returning_registration_request', 'returning_registration_request_created_at_not_null', 'NOT NULL created_at'),
  ('011_returning_player_registration', 'n', 'returning_registration_request', 'returning_registration_request_id_not_null', 'NOT NULL id'),
  ('011_returning_player_registration', 'n', 'returning_registration_request', 'returning_registration_request_status_not_null', 'NOT NULL status'),
  ('011_returning_player_registration', 'n', 'returning_registration_request', 'returning_registration_request_tournament_id_not_null', 'NOT NULL tournament_id'),
  ('011_returning_player_registration', 'p', 'returning_registration_request', 'returning_registration_request_pkey', 'PRIMARY KEY (id)'),
  ('011_returning_player_registration', 'u', 'returning_registration_request', 'returning_registration_request_application_id_key', 'UNIQUE (application_id)'),
  ('012_new_player_registration_approval', 'index', 'new_player_registration_request', 'new_player_registration_pending_claim', 'CREATE UNIQUE INDEX new_player_registration_pending_claim ON public.new_player_registration_request USING btree (tournament_id, contact_proof, gaming_name, team_name) WHERE (status = ''pending''::text)'),
  ('012_new_player_registration_approval', 'index', 'new_player_registration_request', 'new_player_registration_pending_queue', 'CREATE INDEX new_player_registration_pending_queue ON public.new_player_registration_request USING btree (tournament_id, created_at, id) WHERE (status = ''pending''::text)'),
  ('012_new_player_registration_approval', 'index', 'new_player_registration_request', 'new_player_registration_request_application_id_key', 'CREATE UNIQUE INDEX new_player_registration_request_application_id_key ON public.new_player_registration_request USING btree (application_id)'),
  ('012_new_player_registration_approval', 'index', 'new_player_registration_request', 'new_player_registration_request_pkey', 'CREATE UNIQUE INDEX new_player_registration_request_pkey ON public.new_player_registration_request USING btree (id)'),
  ('012_new_player_registration_approval', 'c', 'new_player_registration_request', 'new_player_registration_request_check', 'CHECK (((status = ''pending''::text) = (decided_at IS NULL)))'),
  ('012_new_player_registration_approval', 'c', 'new_player_registration_request', 'new_player_registration_request_check1', 'CHECK (((status = ''pending''::text) = (contact_proof IS NOT NULL)))'),
  ('012_new_player_registration_approval', 'c', 'new_player_registration_request', 'new_player_registration_request_check2', 'CHECK (((status = ''pending''::text) = (gaming_name IS NOT NULL)))'),
  ('012_new_player_registration_approval', 'c', 'new_player_registration_request', 'new_player_registration_request_check3', 'CHECK (((status = ''pending''::text) = (team_name IS NOT NULL)))'),
  ('012_new_player_registration_approval', 'c', 'new_player_registration_request', 'new_player_registration_request_check4', 'CHECK (((status = ''approved''::text) = (application_id IS NOT NULL)))'),
  ('012_new_player_registration_approval', 'c', 'new_player_registration_request', 'new_player_registration_request_contact_proof_check', 'CHECK ((contact_proof ~ ''^[a-f0-9]{64}$''::text))'),
  ('012_new_player_registration_approval', 'c', 'new_player_registration_request', 'new_player_registration_request_gaming_name_check', 'CHECK (((char_length(gaming_name) >= 2) AND (char_length(gaming_name) <= 40)))'),
  ('012_new_player_registration_approval', 'c', 'new_player_registration_request', 'new_player_registration_request_status_check', 'CHECK ((status = ANY (ARRAY[''pending''::text, ''approved''::text, ''rejected''::text])))'),
  ('012_new_player_registration_approval', 'c', 'new_player_registration_request', 'new_player_registration_request_team_name_check', 'CHECK (((char_length(team_name) >= 2) AND (char_length(team_name) <= 40)))'),
  ('012_new_player_registration_approval', 'f', 'new_player_registration_request', 'new_player_registration_request_application_id_fkey', 'FOREIGN KEY (application_id) REFERENCES application(id)'),
  ('012_new_player_registration_approval', 'f', 'new_player_registration_request', 'new_player_registration_request_tournament_id_fkey', 'FOREIGN KEY (tournament_id) REFERENCES tournament(id)'),
  ('012_new_player_registration_approval', 'n', 'new_player_registration_request', 'new_player_registration_request_consent_version_not_null', 'NOT NULL consent_version'),
  ('012_new_player_registration_approval', 'n', 'new_player_registration_request', 'new_player_registration_request_created_at_not_null', 'NOT NULL created_at'),
  ('012_new_player_registration_approval', 'n', 'new_player_registration_request', 'new_player_registration_request_id_not_null', 'NOT NULL id'),
  ('012_new_player_registration_approval', 'n', 'new_player_registration_request', 'new_player_registration_request_status_not_null', 'NOT NULL status'),
  ('012_new_player_registration_approval', 'n', 'new_player_registration_request', 'new_player_registration_request_tournament_id_not_null', 'NOT NULL tournament_id'),
  ('012_new_player_registration_approval', 'p', 'new_player_registration_request', 'new_player_registration_request_pkey', 'PRIMARY KEY (id)'),
  ('012_new_player_registration_approval', 'u', 'new_player_registration_request', 'new_player_registration_request_application_id_key', 'UNIQUE (application_id)')
),
ledger_xml as (
  select case when to_regclass('public.xgamer_migration') is null then '<table/>'::xml
    else query_to_xml('select name, hash from public.xgamer_migration', false, false, '') end as doc
),
ledger as (
  select (xpath('/row/name/text()', r))[1]::text as name,
         (xpath('/row/hash/text()', r))[1]::text as hash
  from ledger_xml, unnest(xpath('/table/row', doc)) as r
),
actual_defs as (
  select 'index'::text as kind, c.relname::text as tbl, i.relname::text as name, pg_get_indexdef(i.oid) as def
  from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class c on c.oid = x.indrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in (select tbl from defs)
    -- An invalid index (a failed concurrent build) enforces nothing: count it as missing.
    and x.indisvalid and x.indisready
  union all
  select k.contype::text, c.relname::text, k.conname::text, pg_get_constraintdef(k.oid)
  from pg_constraint k
  join pg_class c on c.oid = k.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in (select tbl from defs)
),
def_check as (
  select d.*, exists (
    select 1 from actual_defs a where a.kind = d.kind and a.tbl = d.tbl and a.def = d.def
  ) as ok
  from defs d
),
checks(ord, check_name, status, detail) as (
  select 1, 'PostgreSQL version',
    case when current_setting('server_version_num')::int >= 180000 then 'pass' else 'fail' end,
    'server_version_num=' || current_setting('server_version_num')
  union all
  select 2, 'Migration ledger present',
    case when to_regclass('public.xgamer_migration') is not null then 'pass' else 'fail' end,
    coalesce((select count(*)::text from ledger), '0') || ' ledger row(s)'
  union all
  select 3, 'Ledger: ' || e.name,
    case
      when l.hash is null then
        case when e.name < '006' then 'fail' else 'pass' end
      when l.hash = e.lf_hash then 'pass'
      when l.hash = e.crlf_hash then 'warn'
      else 'fail'
    end,
    case
      when l.hash is null then
        case when e.name < '006' then 'missing: this release expects it applied already'
             else 'not applied yet (applied by the release packet)' end
      when l.hash = e.lf_hash then 'applied, checksum matches'
      when l.hash = e.crlf_hash then 'applied from a CRLF checkout of the same SQL (not an edit)'
      else 'applied with a DIFFERENT checksum: stop and investigate'
    end
  from expected e left join ledger l on l.name = e.name
  union all
  select 4, 'Ledger: 006_mcp_oauth (outside this code)',
    case
      when l.hash is null then 'warn'
      when l.hash = 'ae5529b1a747ca3ba6fe30da75ed1d3b368bbb57462a9917c3162468cddde2d1' then 'pass'
      else 'fail'
    end,
    case
      when l.hash is null then 'not recorded (expected in production since 7 Nov 2026)'
      when l.hash = 'ae5529b1a747ca3ba6fe30da75ed1d3b368bbb57462a9917c3162468cddde2d1' then 'recognized, pinned checksum'
      else 'different checksum from the pinned value'
    end
  from (select 1) one left join ledger l on l.name = '006_mcp_oauth'
  union all
  select 5, 'Unknown ledger entries',
    case when count(*) = 0 then 'pass' else 'warn' end,
    coalesce(string_agg(l.name, ', ' order by l.name), 'none')
  from ledger l
  where l.name not in (select name from expected) and l.name <> '006_mcp_oauth'
  union all
  select 6, 'Objects for ' || c.migration || ': ' || c.object,
    case
      when exists (select 1 from ledger l where l.name = c.migration) then
        case when to_regclass(c.object) is not null then 'pass' else 'fail' end
      else
        case when to_regclass(c.object) is null then 'pass' else 'fail' end
    end,
    case
      when exists (select 1 from ledger l where l.name = c.migration) then
        case when to_regclass(c.object) is not null then 'present (migration applied)'
             else 'MISSING although the migration is recorded' end
      else
        case when to_regclass(c.object) is null then 'absent, as expected before the migration'
             else 'ALREADY EXISTS without a ledger row: "if not exists" would silently keep it' end
    end
  from created c
  union all
  select 7, 'Columns for ' || a.migration || ': ' || a.tbl || '.' || a.col,
    case
      when exists (select 1 from ledger l where l.name = a.migration) then
        case when present then 'pass' else 'fail' end
      else
        case when present then 'warn' else 'pass' end
    end,
    case
      when exists (select 1 from ledger l where l.name = a.migration) then
        case when present then 'present (migration applied)'
             else 'MISSING although the migration is recorded' end
      else
        case when present then 'already exists without a ledger row: check it matches the migration'
             else 'absent, as expected before the migration' end
    end
  from (
    select a.*, exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = a.tbl and c.column_name = a.col
    ) as present
    from added a
  ) a
  union all
  -- Migrations run in name order, so a recorded later migration with an earlier
  -- one missing means the ledger was edited or a migration was skipped.
  select 8, 'Ledger order: ' || e.name,
    case when exists (
      select 1 from ledger l join expected later on later.name = l.name
      where later.name > e.name
    ) then 'fail' else 'pass' end,
    coalesce('missing while ' || (
      select string_agg(l.name, ', ' order by l.name) from ledger l join expected later
        on later.name = l.name where later.name > e.name
    ) || ' is recorded', 'not applied yet, and no later migration is recorded')
  from expected e
  where not exists (select 1 from ledger l where l.name = e.name)
  union all
  -- Exact index and constraint definitions of every applied migration.
  select 9, 'Definitions for ' || d.migration,
    case
      when not exists (select 1 from ledger l where l.name = d.migration) then
        case when d.migration < '006' then 'fail' else 'pass' end
      when bool_and(d.ok) then 'pass'
      else 'fail'
    end,
    case
      when not exists (select 1 from ledger l where l.name = d.migration) then
        case when d.migration < '006' then 'not checked: the migration is missing from the ledger'
             else 'not applied yet: the migration creates or replaces its ' || count(*) || ' definition(s)' end
      when bool_and(d.ok) then 'all ' || count(*) || ' index and constraint definitions match'
      else 'MISSING OR DIFFERENT: ' || string_agg(d.tbl || '.' || d.name, ', ' order by d.tbl, d.name)
        filter (where not d.ok) || '. Stop and investigate.'
    end
  from def_check d
  group by d.migration
  union all
  -- Anything else on these tables, or a known name with another definition.
  select 10, 'Unexpected indexes and constraints',
    case when count(*) = 0 then 'pass' else 'warn' end,
    case when count(*) = 0 then 'none'
      else string_agg(a.tbl || '.' || a.name, ', ' order by a.tbl, a.name)
        || ': not defined like this by these migrations. Review before the release.'
    end
  from actual_defs a
  where not exists (
    select 1 from defs d where d.kind = a.kind and d.tbl = a.tbl and d.def = a.def
  )
)
select check_name, status, detail from checks order by ord, check_name;

rollback;
