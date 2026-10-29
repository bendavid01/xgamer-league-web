import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = [
  "001_control_center.sql",
  "002_open_registration.sql",
  "003_multi_tournament.sql",
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
