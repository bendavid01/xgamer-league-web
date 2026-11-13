/**
 * Migration 008 (generic team-name provenance), tests G1–G5 of the approved
 * OM "Edit player details" design. PGlite embeds PostgreSQL 18.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const dir = new URL("../migrations/", import.meta.url);
const source = (file: string) => readFile(new URL(file, dir), "utf8");
const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const LABELS = [
  "registration",
  "registration_record",
  "organizer_attested",
  "organizer_corrected",
];
const BEFORE_007 = [
  "001_control_center.sql",
  "002_open_registration.sql",
  "003_multi_tournament.sql",
  "004_seasons_podium.sql",
  "005_announcement_dates.sql",
];
/** Labels named in a migration's check constraint for team_name_source. */
const labelsIn = (sql: string) =>
  [
    ...(sql
      .replace(/--.*$/gm, "")
      .match(/team_name_source in \(([^)]*)\)/)?.[1]
      .matchAll(/'([a-z_]+)'/g) ?? []),
  ].map((m) => m[1]);

test("G1: migration 007 is byte-identical (checksum unchanged)", async () => {
  assert.equal(
    sha256(await source("007_application_team_name.sql")),
    "bbc004390ba1b09cbc7ce09c2fc644192e7d081d92e54a3bfaec397655f5ea41",
  );
});

test("G2: 008 only re-creates the provenance check, with exactly the 4 labels, and aborts without 007", async () => {
  const sql = await source("008_team_name_provenance.sql");
  const statements = sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  assert.equal(statements.length, 2);
  assert.match(
    statements[0],
    /^alter table application drop constraint application_team_name_source_check$/,
  );
  assert.match(
    statements[1],
    /^alter table application add constraint application_team_name_source_check check \(/,
  );
  assert.deepEqual(labelsIn(sql).sort(), [...LABELS].sort());
  // Schema only: no data statements, no procedural block, no IDs.
  assert.doesNotMatch(
    sql.replace(/--.*$/gm, ""),
    /\b(insert|update|delete|truncate|do|copy)\b/i,
  );
  assert.doesNotMatch(sql, /[0-9a-f]{8}-[0-9a-f]{4}-|XG-\d|timeline/i);

  const pg = new PGlite();
  try {
    for (const f of BEFORE_007) await pg.exec(await source(f));
    await assert.rejects(pg.exec(`begin; ${sql} commit;`));
    await pg.exec("rollback");
    const cols = await pg.query(
      `select column_name from information_schema.columns where table_name='application' and column_name like 'team_name%'`,
    );
    assert.equal(cols.rows.length, 0, "nothing was created");
  } finally {
    await pg.close();
  }
});

test("G3: a fresh database applies 001–008; the 4 labels are accepted, anything else rejected", async () => {
  const files = (await readdir(dir)).filter((f) => /^\d{3}_.*\.sql$/.test(f));
  assert.deepEqual(files.sort().slice(-2), [
    "007_application_team_name.sql",
    "008_team_name_provenance.sql",
  ]);
  const pg = new PGlite();
  try {
    for (const f of files.sort()) await pg.exec(await source(f));
    const { rows } = await pg.query<{ id: string }>(
      `insert into player(gaming_name,team_name,contact_hash,contact_cipher,consent_version) values('A','T','h','c','v') returning id`,
    );
    const { rows: app } = await pg.query<{ id: string }>(
      `insert into application(tournament_id,player_id,status) values('xgamer-2026-10',$1,'approved') returning id`,
      [rows[0].id],
    );
    const set = (source: string | null) =>
      pg.query(
        `update application set team_name='T', team_name_source=$1 where id=$2`,
        [source, app[0].id],
      );
    for (const label of [...LABELS, null]) await set(label);
    for (const bad of ["guess", "organizer", "Registration", ""])
      await assert.rejects(set(bad), /application_team_name_source_check/);
  } finally {
    await pg.close();
  }
});

test("G4: every later migration that redefines the provenance check keeps all 4 labels", async () => {
  const later = (await readdir(dir)).filter(
    (f) => /^\d{3}_.*\.sql$/.test(f) && f > "008",
  );
  for (const f of later) {
    const sql = await source(f);
    if (!/application_team_name_source_check/.test(sql)) continue;
    const labels = labelsIn(sql);
    for (const label of LABELS)
      assert.ok(labels.includes(label), `${f} drops the label ${label}`);
  }
});

test("G5: production-shaped data: 007 + 008 in one transaction change nothing but the ledger and the new columns", async () => {
  const pg = new PGlite();
  try {
    for (const f of BEFORE_007) await pg.exec(await source(f));
    await pg.exec(`
      insert into tournament(id,name,status,published,format,knockout,qualifiers,legs)
        values('pro-cup','Pro Cup','completed',true,'league',false,2,1);
      create table xgamer_migration(name text primary key, hash text not null, applied_at timestamptz not null default now());`);
    for (const f of BEFORE_007)
      await pg.query(`insert into xgamer_migration(name,hash) values($1,$2)`, [
        f.replace(/\.sql$/, ""),
        sha256(await source(f)),
      ]);
    await pg.query(`insert into xgamer_migration(name,hash) values($1,$2)`, [
      "006_mcp_oauth",
      "ae5529b1a747ca3ba6fe30da75ed1d3b368bbb57462a9917c3162468cddde2d1",
    ]);
    const ids: string[] = [];
    for (const [i, team] of ["Lions", "Tigers", "Wolves"].entries()) {
      const p = await pg.query<{ id: string }>(
        `insert into player(gaming_name,team_name,contact_hash,contact_cipher,consent_version) values($1,$2,$3,'c','v') returning id`,
        [`P${i}`, team, `h${i}`],
      );
      const a = await pg.query<{ id: string }>(
        `insert into application(tournament_id,player_id,status) values('pro-cup',$1,'approved') returning id`,
        [p.rows[0].id],
      );
      // Registration records: the first two are from before 18:21 UTC (no team).
      await pg.query(
        `insert into audit_event(actor,action,entity,tournament_id,after_value) values($1,'application.create',$2,'pro-cup',$3::jsonb)`,
        [
          `player:${p.rows[0].id}`,
          a.rows[0].id,
          JSON.stringify(
            i < 2
              ? { playerId: p.rows[0].id, status: "pending" }
              : { playerId: p.rows[0].id, team, status: "pending" },
          ),
        ],
      );
      ids.push(p.rows[0].id);
    }
    await pg.query(
      `insert into fixture(tournament_id,stage,round,slot,home,away,home_score,away_score) values
        ('pro-cup','league',1,1,$1,$2,2,1),('pro-cup','league',2,1,$2,$3,0,0),('pro-cup','league',3,1,$3,$1,1,3)`,
      ids,
    );
    await pg.query(
      `insert into podium(tournament_id,place,player_id) values('pro-cup',1,$1),('pro-cup',2,$2),('pro-cup',3,$3)`,
      ids,
    );
    await pg.exec(
      `insert into audit_event(actor,action,entity,tournament_id,summary) values('759756138437804042','score','pro-cup','pro-cup','Entered score')`,
    );
    const fingerprints = async () =>
      (
        await pg.query(`select
          (select md5(string_agg(id::text||':'||public_no||':'||gaming_name||':'||coalesce(team_name,'-')||':'||contact_hash, ',' order by id)) from player) as players,
          (select md5(string_agg(id::text||':'||tournament_id||':'||player_id||':'||status||':'||revision||':'||coalesce(deleted_at::text,'-'), ',' order by id)) from application) as entries,
          (select md5(string_agg(id::text||':'||round||':'||home||':'||away||':'||coalesce(home_score::text,'-')||':'||coalesce(away_score::text,'-')||':'||revision, ',' order by id)) from fixture) as fixtures,
          (select md5(string_agg(tournament_id||':'||place||':'||player_id, ',' order by place)) from podium) as podium,
          (select md5(string_agg(id::text||':'||actor||':'||action||':'||entity||':'||coalesce(after_value::text,'-')||':'||created_at, ',' order by id)) from audit_event) as audit,
          (select count(*)::int from audit_event) as audit_count,
          (select md5(string_agg(id||':'||status||':'||coalesce(published::text,'-'), ',' order by id)) from tournament) as tournaments`)
      ).rows[0];
    const ledger = async () =>
      (
        await pg.query<{ name: string }>(
          `select name from xgamer_migration order by name`,
        )
      ).rows.map((r) => r.name);
    const before = await fingerprints();
    const ledgerBefore = await ledger();

    // The release packet: both migrations and both ledger rows in one transaction.
    const m7 = await source("007_application_team_name.sql");
    const m8 = await source("008_team_name_provenance.sql");
    await pg.exec(`begin;\n${m7}\n${m8}\n
      insert into xgamer_migration(name,hash) values('007_application_team_name','${sha256(m7)}'),('008_team_name_provenance','${sha256(m8)}');
      commit;`);

    assert.deepEqual(await fingerprints(), before, "only the ledger changes");
    assert.deepEqual(await ledger(), [
      ...ledgerBefore,
      "007_application_team_name",
      "008_team_name_provenance",
    ]);
    const teams = await pg.query<{ s: string | null; c: number }>(
      `select team_name_source s, count(*)::int c from application group by 1 order by 1`,
    );
    // Only the record that holds a team is recovered; the others wait for OM review.
    assert.deepEqual(teams.rows, [
      { s: "registration_record", c: 1 },
      { s: null, c: 2 },
    ]);
  } finally {
    await pg.close();
  }
});
