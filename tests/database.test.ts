import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("PostgreSQL migration: 70 applications, 64-slot cap, recovery and immutable audits", async () => {
  const pg = new PGlite();
  try {
    for (const file of [
      "001_control_center.sql",
      "002_registration_contacts.sql",
    ])
      await pg.exec(
        await readFile(
          new URL(`../migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
    const ids: string[] = [];
    for (let i = 0; i < 70; i++) {
      const p = await pg.query<{ id: string }>(
        `insert into player(gaming_name,efootball_hash,efootball_cipher,contact_hash,contact_cipher,preference,consent_version) values($1,$2,'encrypted',$3,'encrypted','discord','test') returning id`,
        [`Player ${i}`, `game${i}`, `contact${i}`],
      );
      const a = await pg.query<{ id: string }>(
        `insert into application(tournament_id,player_id,status) values('xgamer-2026-10',$1,'pending') returning id`,
        [p.rows[0].id],
      );
      ids.push(a.rows[0].id);
    }
    const counts = await pg.query<{ status: string; n: number }>(
      `select status,count(*)::int as n from application group by status`,
    );
    assert.equal(counts.rows.find((r) => r.status === "pending")?.n, 64);
    assert.equal(counts.rows.find((r) => r.status === "waitlisted")?.n, 6);
    await assert.rejects(
      () =>
        pg.query(`update application set status='approved' where id=$1`, [
          ids[69],
        ]),
      /capacity/,
    );
    await pg.query(`update application set status='rejected' where id=$1`, [
      ids[0],
    ]);
    await pg.query(
      `update application set status='approved',verified_at=now() where id=$1`,
      [ids[64]],
    );
    const [count] = (
      await pg.query<{ n: number }>(
        `select count(*)::int as n from application where status in ('pending','approved') and deleted_at is null`,
      )
    ).rows;
    assert.equal(count.n, 64);
    await assert.rejects(
      () =>
        pg.query(
          `insert into player(gaming_name,efootball_hash,efootball_cipher,contact_hash,contact_cipher,preference,consent_version) values('Duplicate','game1','x','different','x','discord','test')`,
        ),
      /unique/,
    );
    await pg.query(
      `insert into audit_event(actor,action,entity,before_value,after_value) values('admin','review',$1,'{"status":"pending"}','{"status":"approved"}')`,
      [ids[64]],
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
    // Optional Discord contact: unique when present, and hash/cipher must be paired.
    await pg.query(
      `update player set discord_handle_hash='d1',discord_handle_cipher='x' where gaming_name='Player 1'`,
    );
    await assert.rejects(
      () =>
        pg.query(
          `update player set discord_handle_hash='d1',discord_handle_cipher='x' where gaming_name='Player 2'`,
        ),
      /unique/,
    );
    await assert.rejects(
      () =>
        pg.query(
          `update player set discord_handle_hash='d3' where gaming_name='Player 3'`,
        ),
      /check|player_discord_handle_pair/,
    );
    // Re-running the migration is harmless.
    await pg.exec(
      await readFile(
        new URL("../migrations/002_registration_contacts.sql", import.meta.url),
        "utf8",
      ),
    );
    // Restore the engine's binary backup into an independent database and inspect actual records.
    const backup = await pg.dumpDataDir();
    const restored = new PGlite({ loadDataDir: backup });
    try {
      const restoredCount = await restored.query<{ n: number }>(
        `select count(*)::int as n from application`,
      );
      assert.equal(restoredCount.rows[0].n, 70);
      const audit = await restored.query<{
        before_value: { status: string };
        after_value: { status: string };
      }>(`select before_value,after_value from audit_event`);
      assert.equal(audit.rows[0].before_value.status, "pending");
      assert.equal(audit.rows[0].after_value.status, "approved");
    } finally {
      await restored.close();
    }
  } finally {
    await pg.close();
  }
});
