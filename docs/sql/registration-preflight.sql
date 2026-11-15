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
-- Objects each new migration creates. They must not exist before it is applied.
created(migration, object) as (values
  ('011_returning_player_registration', 'public.returning_registration_request'),
  ('011_returning_player_registration', 'public.returning_registration_pending_claim'),
  ('011_returning_player_registration', 'public.returning_registration_pending_queue'),
  ('012_new_player_registration_approval', 'public.new_player_registration_request'),
  ('012_new_player_registration_approval', 'public.new_player_registration_pending_claim'),
  ('012_new_player_registration_approval', 'public.new_player_registration_pending_queue')
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
)
select check_name, status, detail from checks order by ord, check_name;

rollback;
