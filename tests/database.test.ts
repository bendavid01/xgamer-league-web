import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = [
  "001_control_center.sql",
  "002_open_registration.sql",
  "003_multi_tournament.sql",
  "004_seasons_podium.sql",
  "005_announcement_dates.sql",
  "007_application_team_name.sql",
  "008_team_name_provenance.sql",
  "009_contact_change.sql",
];
async function migrated() {
  const pg = new PGlite();
  for (const file of MIGRATIONS)
    await pg.exec(
      await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"),
    );
  return pg;
}

test("PostgreSQL migrations: open registration, any field size, byes, recovery and immutable audits", async () => {
  const pg = await migrated();
  try {
    // Registration needs no eFootball ID; organizers choose any number of players (no 64 cap).
    const ids: string[] = [];
    for (let i = 0; i < 70; i++) {
      const p = await pg.query<{ id: string }>(
        `insert into player(gaming_name,team_name,contact_hash,contact_cipher,consent_version) values($1,$2,$3,'encrypted','test') returning id`,
        [`Player ${i}`, `Team ${i}`, `phone${i}`],
      );
      const a = await pg.query<{ id: string }>(
        `insert into application(tournament_id,player_id,status) values('xgamer-2026-10',$1,'pending') returning id`,
        [p.rows[0].id],
      );
      ids.push(a.rows[0].id);
    }
    const pending = await pg.query<{ n: number }>(
      `select count(*)::int as n from application where status='pending'`,
    );
    assert.equal(pending.rows[0].n, 70);
    await pg.query(
      `update application set status='approved' where id = any($1)`,
      [ids],
    );

    // Duplicate phone numbers are rejected.
    await assert.rejects(
      () =>
        pg.query(
          `insert into player(gaming_name,contact_hash,contact_cipher,consent_version) values('Dup','phone1','x','test')`,
        ),
      /unique/,
    );
    // eFootball ID added later: unique, and hash/cipher must be set together.
    await pg.query(
      `update player set efootball_hash='ef1',efootball_cipher='x' where gaming_name='Player 1'`,
    );
    await assert.rejects(
      () =>
        pg.query(
          `update player set efootball_hash='ef1',efootball_cipher='x' where gaming_name='Player 2'`,
        ),
      /unique/,
    );
    await assert.rejects(
      () =>
        pg.query(
          `update player set efootball_hash='ef3' where gaming_name='Player 3'`,
        ),
      /player_efootball_pair|check/,
    );

    // Format settings.
    await pg.exec(
      `update tournament set format='knockout',qualifiers=4,opponents=null`,
    );
    await assert.rejects(
      () => pg.exec(`update tournament set format='swiss'`),
      /check/,
    );
    await assert.rejects(
      () => pg.exec(`update tournament set qualifiers=6`),
      /check/,
    );

    // A knockout bye: no away player, the home player is the winner.
    const [a, b] = (
      await pg.query<{ id: string }>(
        `select id from player order by gaming_name limit 2`,
      )
    ).rows;
    await pg.query(
      `insert into fixture(tournament_id,stage,round,slot,home,away,winner) values('xgamer-2026-10','knockout',1,0,$1,null,$1)`,
      [a.id],
    );
    await assert.rejects(
      () =>
        pg.query(
          `insert into fixture(tournament_id,stage,round,slot,home,away,winner) values('xgamer-2026-10','knockout',1,1,$1,$1,null)`,
          [b.id],
        ),
      /check/,
    );
    await pg.query(
      `insert into qualification(tournament_id,player_id,rank) values('xgamer-2026-10',$1,16)`,
      [a.id],
    );

    // Audit history cannot be edited or deleted.
    await pg.query(
      `insert into audit_event(actor,action,entity,before_value,after_value) values('admin','review',$1,'{"status":"pending"}','{"status":"approved"}')`,
      [ids[0]],
    );
    await assert.rejects(() => pg.exec(`delete from audit_event`), /immutable/);
    await assert.rejects(
      () => pg.exec(`update audit_event set actor='forged'`),
      /immutable/,
    );
    await assert.rejects(
      () =>
        pg.exec(
          `insert into coordinator(discord_id,operations,tournaments) values('12345678901234567',array['delete'],array['xgamer-2026-10'])`,
        ),
      /check/,
    );

    // Restore a backup into an independent database and inspect real records.
    const restored = new PGlite({ loadDataDir: await pg.dumpDataDir() });
    try {
      const count = await restored.query<{ n: number }>(
        `select count(*)::int as n from application where status='approved'`,
      );
      assert.equal(count.rows[0].n, 70);
      const audit = await restored.query<{ after_value: { status: string } }>(
        `select after_value from audit_event`,
      );
      assert.equal(audit.rows[0].after_value.status, "approved");
    } finally {
      await restored.close();
    }
  } finally {
    await pg.close();
  }
});

test("the latest migration is safe to run twice", async () => {
  const pg = await migrated();
  try {
    await pg.exec(
      await readFile(
        new URL(
          `../migrations/${MIGRATIONS[MIGRATIONS.length - 1]}`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
  } finally {
    await pg.close();
  }
});

test("migration 003 keeps existing live data: players get readable IDs, old format converts", async () => {
  const pg = new PGlite();
  try {
    for (const file of MIGRATIONS.slice(0, 2))
      await pg.exec(
        await readFile(
          new URL(`../migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
    await pg.exec(
      `insert into player(gaming_name,contact_hash,contact_cipher,consent_version) values('Anil','h1','c','v'),('Rahul','h2','c','v')`,
    );
    await pg.exec(`update tournament set status='open'`);
    await pg.exec(
      await readFile(
        new URL(`../migrations/${MIGRATIONS[2]}`, import.meta.url),
        "utf8",
      ),
    );
    const players = await pg.query<{ public_no: number }>(
      `select public_no from player order by public_no`,
    );
    assert.deepEqual(
      players.rows.map((r) => r.public_no),
      [1, 2],
    );
    const t = await pg.query<{
      format: string;
      knockout: boolean;
      status: string;
      legs: number;
    }>(`select format,knockout,status,legs from tournament`);
    assert.deepEqual(t.rows[0], {
      format: "league",
      knockout: true,
      status: "open",
      legs: 1,
    });
    // New tournaments and players keep numbering.
    await pg.exec(
      `insert into tournament(id,name) values('weekend-cup-1a2b','Weekend Cup')`,
    );
    const next = await pg.query<{ public_no: number }>(
      `insert into player(gaming_name,contact_hash,contact_cipher,consent_version) values('New','h3','c','v') returning public_no`,
    );
    assert.equal(next.rows[0].public_no, 3);
  } finally {
    await pg.close();
  }
});

test("migration 004: seasons are unique per competition, live tournaments stay published, podium rules", async () => {
  const pg = new PGlite();
  try {
    for (const file of MIGRATIONS.slice(0, 3))
      await pg.exec(
        await readFile(
          new URL(`../migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
    await pg.exec(`update tournament set status='league'`);
    await pg.exec(
      `insert into tournament(id,name) values('draft-cup-1a2b','Draft Cup')`,
    );
    await pg.exec(
      await readFile(
        new URL(`../migrations/${MIGRATIONS[3]}`, import.meta.url),
        "utf8",
      ),
    );
    const rows = await pg.query<{ id: string; published: boolean }>(
      `select id,published from tournament order by id`,
    );
    assert.deepEqual(
      rows.rows.map((r) => [r.id, r.published]),
      [
        ["draft-cup-1a2b", false],
        ["xgamer-2026-10", true],
      ],
    );
    await pg.exec(
      `update tournament set competition='XGamer Pro League',season=1 where id='xgamer-2026-10'`,
    );
    await assert.rejects(
      () =>
        pg.exec(
          `insert into tournament(id,name,competition,season) values('s1-copy','x','xgamer pro league',1)`,
        ),
      /unique|duplicate/,
    );
    await assert.rejects(
      () =>
        pg.exec(`update tournament set season=null where id='xgamer-2026-10'`),
      /check/,
    );
    await pg.exec(
      `insert into tournament(id,name,competition,season) values('s2','XGamer Pro League','XGamer Pro League',2)`,
    );
    const p = await pg.query<{ id: string }>(
      `insert into player(gaming_name,contact_hash,contact_cipher,consent_version) values('A','h1','c','v') returning id`,
    );
    const id = p.rows[0].id;
    await pg.query(
      `insert into podium(tournament_id,place,player_id) values('s2',1,$1)`,
      [id],
    );
    await assert.rejects(
      () =>
        pg.query(
          `insert into podium(tournament_id,place,player_id) values('s2',2,$1)`,
          [id],
        ),
      /unique|duplicate/,
    );
    await assert.rejects(
      () =>
        pg.query(
          `insert into podium(tournament_id,place,player_id) values('s2',4,$1)`,
          [id],
        ),
      /check/,
    );
  } finally {
    await pg.close();
  }
});

test("007: each tournament keeps its own team name; only recorded names are recovered", async () => {
  const pg = new PGlite();
  const apply = async (file: string) =>
    pg.exec(
      await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"),
    );
  try {
    for (const file of MIGRATIONS.filter((f) => f < "007")) await apply(file);
    await pg.exec(
      `insert into tournament(id,name) values('cup-one','Cup One'),('cup-two','Cup Two'),('cup-three','Cup Three')`,
    );
    const player = async (name: string, team: string | null) =>
      (
        await pg.query<{ id: string }>(
          `insert into player(gaming_name,team_name,contact_hash,contact_cipher,consent_version) values($1,$2,$3,'encrypted','test') returning id`,
          [name, team, `hash-${name}`],
        )
      ).rows[0].id;
    // audit: undefined = no registration record; null = a record without a team.
    const entry = async (t: string, playerId: string, team?: string | null) => {
      const { id } = (
        await pg.query<{ id: string }>(
          `insert into application(tournament_id,player_id,status) values($1,$2,'approved') returning id`,
          [t, playerId],
        )
      ).rows[0];
      if (team !== undefined)
        await pg.query(
          `insert into audit_event(actor,action,entity,after_value) values($1,'application.create',$2,$3::jsonb)`,
          [
            `player:${playerId}`,
            id,
            JSON.stringify(team === null ? { playerId } : { playerId, team }),
          ],
        );
      return id;
    };
    // One player, three tournaments, three teams. Their current team is the last one.
    const seven = await player("Seven", "Arsenal");
    const a1 = await entry("cup-one", seven, "Real Madrid");
    const a2 = await entry("cup-two", seven, "Barcelona");
    const a3 = await entry("cup-three", seven, "Arsenal");
    // Older entries without a recorded team: the current team must NOT be copied back.
    const old = await player("Old", "Chelsea");
    const b1 = await entry("cup-one", old, null);
    const b2 = await entry("cup-two", old);
    const players = `select id, public_no, gaming_name, team_name from player order by public_no`;
    const before = (await pg.query(players)).rows;
    const audits = `select count(*)::int n from audit_event`;
    const auditCount = (await pg.query<{ n: number }>(audits)).rows[0].n;

    await apply("007_application_team_name.sql");
    const team = async (id: string) =>
      (
        await pg.query(
          `select team_name, team_name_source from application where id=$1`,
          [id],
        )
      ).rows[0];
    const recovered = (name: string) => ({
      team_name: name,
      team_name_source: "registration_record",
    });
    const unknown = { team_name: null, team_name_source: null };
    assert.deepEqual(await team(a1), recovered("Real Madrid"));
    assert.deepEqual(await team(a2), recovered("Barcelona"));
    assert.deepEqual(await team(a3), recovered("Arsenal"));
    assert.deepEqual(await team(b1), unknown);
    assert.deepEqual(await team(b2), unknown);
    // Player IDs, names, current teams and the audit trail are untouched.
    assert.deepEqual((await pg.query(players)).rows, before);
    assert.equal((await pg.query<{ n: number }>(audits)).rows[0].n, auditCount);
    // Running it again changes nothing.
    await apply("007_application_team_name.sql");
    assert.deepEqual(await team(a1), recovered("Real Madrid"));
    assert.deepEqual(await team(b1), unknown);
    // Only known sources are accepted.
    await assert.rejects(
      pg.query(`update application set team_name_source='guess' where id=$1`, [
        b1,
      ]),
    );
  } finally {
    await pg.close();
  }
});
