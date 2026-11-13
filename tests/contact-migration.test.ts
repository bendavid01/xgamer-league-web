/**
 * Migration 009_contact_change (M9-1 to M9-5). PGlite embeds PostgreSQL 18.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const dir = new URL("../migrations/", import.meta.url);
const source = (file: string) => readFile(new URL(file, dir), "utf8");
const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");
const files = async () =>
  (await readdir(dir)).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();

async function upTo(last: string) {
  const pg = new PGlite();
  for (const f of await files()) if (f <= last) await pg.exec(await source(f));
  return pg;
}
async function seed(pg: PGlite) {
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const p = await pg.query<{ id: string }>(
      `insert into player(gaming_name,team_name,contact_hash,contact_cipher,consent_version) values($1,$2,$3,'cipher','v') returning id`,
      [`P${i}`, `T${i}`, `hash-${i}`],
    );
    await pg.query(
      `insert into application(tournament_id,player_id,status) values('xgamer-2026-10',$1,'approved')`,
      [p.rows[0].id],
    );
    await pg.query(
      `insert into audit_event(actor,action,entity,after_value) values('x','application.create',$1,'{}')`,
      [p.rows[0].id],
    );
    ids.push(p.rows[0].id);
  }
  return ids;
}
const fingerprints = async (pg: PGlite) =>
  (
    await pg.query(`select
      (select md5(string_agg(id::text||public_no||gaming_name||coalesce(team_name,'')||contact_hash||contact_cipher, ',' order by id)) from player) players,
      (select md5(string_agg(id::text||tournament_id||player_id||status, ',' order by id)) from application) entries,
      (select md5(string_agg(id::text||action||entity||coalesce(after_value::text,''), ',' order by id)) from audit_event) audit,
      (select count(*)::int from audit_event) audit_count`)
  ).rows[0];

test("M9-1: 009 adds the contact columns with defaults and changes no existing data", async () => {
  const pg = await upTo("008_team_name_provenance.sql");
  try {
    const ids = await seed(pg);
    const before = await fingerprints(pg);
    await pg.exec(await source("009_contact_change.sql"));
    assert.deepEqual(await fingerprints(pg), before);
    const rows = await pg.query(
      `select contact_version, contact_verified_at, contact_verification_method from player where id = any($1::uuid[])`,
      [ids],
    );
    assert.ok(
      rows.rows.every(
        (r) =>
          (r as { contact_version: number }).contact_version === 1 &&
          (r as { contact_verified_at: null }).contact_verified_at === null &&
          (r as { contact_verification_method: null })
            .contact_verification_method === null,
      ),
    );
    const comment = await pg.query<{ c: string }>(
      `select col_description('player'::regclass, (select attnum from pg_attribute where attrelid='player'::regclass and attname='contact_verified_at')) c`,
    );
    assert.match(comment.rows[0].c, /not authorization for player login/);
    // Running it again changes nothing (repository convention: migrations are safe to rerun).
    await pg.exec(await source("009_contact_change.sql"));
    assert.deepEqual(await fingerprints(pg), before);
  } finally {
    await pg.close();
  }
});

test("M9-2: constraints: actor separation, evidence, attestation pairs, statuses and limits", async () => {
  const pg = await upTo("009_contact_change.sql");
  try {
    const [pid] = await seed(pg);
    const insert = (cols: Record<string, unknown>) => {
      const row: Record<string, unknown> = {
        player_id: pid,
        tournament_id: "xgamer-2026-10",
        route: "established_channel",
        new_contact_hash: `h-${Math.random()}`,
        new_contact_cipher: "c",
        from_contact_version: 1,
        requested_by: "759756138437804042",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        ...cols,
      };
      const keys = Object.keys(row);
      return pg.query<{ id: string }>(
        `insert into contact_change(${keys.join(",")}) values(${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
        Object.values(row),
      );
    };
    const evidence = {
      route: "independent_evidence",
      evidence_type: "known_person_live_video",
      evidence_note: "Saw the player live on video with two organizers",
      evidence_observed_at: new Date().toISOString(),
    };
    // Valid baselines.
    const r1 = await insert({});
    await pg.query(
      `update contact_change set status='cancelled', finished_at=now() where id=$1`,
      [r1.rows[0].id],
    );
    const r2 = await insert(evidence);
    // Same admin can never approve.
    await assert.rejects(
      pg.query(
        `update contact_change set approved_by=requested_by where id=$1`,
        [r2.rows[0].id],
      ),
      /check/,
    );
    // A completed evidence change needs an approver and a code check.
    await assert.rejects(
      pg.query(
        `update contact_change set status='completed', finished_at=now(), code_checked_at=now() where id=$1`,
        [r2.rows[0].id],
      ),
      /check/,
    );
    await pg.query(
      `update contact_change set status='cancelled', finished_at=now() where id=$1`,
      [r2.rows[0].id],
    );
    // Evidence route without evidence, people evidence without a time, eFootball without a challenge.
    await assert.rejects(insert({ route: "independent_evidence" }), /check/);
    await assert.rejects(
      insert({ ...evidence, evidence_observed_at: null }),
      /check/,
    );
    await assert.rejects(
      insert({
        ...evidence,
        evidence_type: "efootball_possession",
        evidence_observed_at: null,
      }),
      /check/,
    );
    await assert.rejects(insert({ evidence_note: "too short" }), /check/);
    // Unknown status, attempts above 5, resends above 2.
    await assert.rejects(insert({ status: "approved" }), /check/);
    await assert.rejects(insert({ attempts: 6 }), /check/);
    await assert.rejects(insert({ resends: 3 }), /check/);
    // Attestation fields on player: method required with the time, and only known methods.
    await assert.rejects(
      pg.query(`update player set contact_verified_at=now() where id=$1`, [
        pid,
      ]),
      /check/,
    );
    await assert.rejects(
      pg.query(
        `update player set contact_verified_at=now(), contact_verification_method='verified' where id=$1`,
        [pid],
      ),
      /check/,
    );
    await pg.query(
      `update player set contact_verified_at=now(), contact_verification_method='organizer_attested_independent_evidence' where id=$1`,
      [pid],
    );
    await assert.rejects(
      pg.query(`update player set contact_version=0 where id=$1`, [pid]),
      /check/,
    );
  } finally {
    await pg.close();
  }
});

test("M9-3: one open change per player and per new number; closed changes don't count", async () => {
  const pg = await upTo("009_contact_change.sql");
  try {
    const [a, b] = await seed(pg);
    const add = (player: string, hash: string) =>
      pg.query<{ id: string }>(
        `insert into contact_change(player_id,tournament_id,route,new_contact_hash,new_contact_cipher,from_contact_version,requested_by,expires_at)
         values($1,'xgamer-2026-10','established_channel',$2,'c',1,'759756138437804042',now()+interval '1 hour') returning id`,
        [player, hash],
      );
    const first = await add(a, "n1");
    await assert.rejects(add(a, "n2"), /contact_change_open_player/);
    await assert.rejects(add(b, "n1"), /contact_change_open_number/);
    await pg.query(
      `update contact_change set status='cancelled', finished_at=now() where id=$1`,
      [first.rows[0].id],
    );
    await add(a, "n2");
    await add(b, "n1");
  } finally {
    await pg.close();
  }
});

test("M9-4: the 007 + 008 + 009 release packet in one transaction changes only the ledger and the schema", async () => {
  const before7 = (await files()).filter((f) => f < "007");
  const pg = new PGlite();
  try {
    for (const f of before7) await pg.exec(await source(f));
    await pg.exec(
      `create table xgamer_migration(name text primary key, hash text not null, applied_at timestamptz not null default now())`,
    );
    for (const f of before7)
      await pg.query(`insert into xgamer_migration(name,hash) values($1,$2)`, [
        f.replace(/\.sql$/, ""),
        sha256(await source(f)),
      ]);
    await pg.query(
      `insert into xgamer_migration(name,hash) values('006_mcp_oauth','ae5529b1a747ca3ba6fe30da75ed1d3b368bbb57462a9917c3162468cddde2d1')`,
    );
    await seed(pg);
    const before = await fingerprints(pg);
    const packet = [
      "007_application_team_name.sql",
      "008_team_name_provenance.sql",
      "009_contact_change.sql",
    ];
    let sql = "begin;\n";
    for (const f of packet) {
      const text = await source(f);
      sql += `${text}\ninsert into xgamer_migration(name,hash) values('${f.replace(/\.sql$/, "")}','${sha256(text)}');\n`;
    }
    await pg.exec(sql + "commit;");
    assert.deepEqual(await fingerprints(pg), before);
    const ledger = await pg.query<{ name: string }>(
      `select name from xgamer_migration order by name`,
    );
    assert.deepEqual(ledger.rows.map((r) => r.name).slice(-4), [
      "006_mcp_oauth",
      "007_application_team_name",
      "008_team_name_provenance",
      "009_contact_change",
    ]);
  } finally {
    await pg.close();
  }
});

test("M9-5: numbering: 001–005 and 007–009 in the repository; 010 reserved for player accounts; docs and health agree", async () => {
  assert.deepEqual(
    (await files()).map((f) => f.slice(0, 3)),
    ["001", "002", "003", "004", "005", "007", "008", "009"],
  );
  const { KNOWN_MIGRATIONS } = await import("../src/lib/health");
  assert.ok(KNOWN_MIGRATIONS.includes("009_contact_change"));
  const doc = await readFile(
    new URL("../docs/MIGRATIONS.md", import.meta.url),
    "utf8",
  );
  assert.match(doc, /009_contact_change/);
  assert.match(doc, /010_player_accounts/);
  assert.match(doc, /reserved/i);
  // 009 adds contact_version; a future 010 must not add it again.
  for (const f of (await files()).filter((f) => f >= "010"))
    assert.doesNotMatch(
      await source(f),
      /add column (if not exists )?contact_version/i,
      f,
    );
});
