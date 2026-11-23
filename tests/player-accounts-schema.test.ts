/**
 * 013_player_accounts and 014_registration_tiers on an embedded PostgreSQL 18
 * (PGlite): existing data is untouched and the constraints hold the account
 * invariants even against direct writes. Runs without TEST_DATABASE_URL.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { migrationFiles } from "../src/lib/migrations";

const HASH = `scrypt$16384$8$1$${"a".repeat(22)}$${"b".repeat(86)}`;

async function upTo(pg: PGlite, last: string) {
  await pg.exec(
    `create table if not exists xgamer_migration(name text primary key, hash text not null, applied_at timestamptz not null default now())`,
  );
  const done = new Set(
    (await pg.query<{ name: string }>(`select name from xgamer_migration`)).rows.map((r) => r.name),
  );
  for (const f of await migrationFiles())
    if (f.name <= last && !done.has(f.name)) {
      await pg.exec(f.source);
      await pg.query(`insert into xgamer_migration(name,hash) values($1,$2)`, [f.name, f.hash]);
    }
}

const rejects = (pg: PGlite, sql: string, params: unknown[], pattern: RegExp) =>
  assert.rejects(() => pg.query(sql, params), pattern, sql);

test("013 and 014 keep every existing player, entry and pending request as it was", async () => {
  const pg = new PGlite();
  try {
    await upTo(pg, "012_new_player_registration_approval");
    await pg.exec(`insert into tournament(id,name,status,published) values('cup','Cup','open',true)`);
    for (let i = 1; i <= 3; i++)
      await pg.query(
        `insert into player(gaming_name,team_name,contact_hash,contact_cipher,consent_version,deleted_at)
         values($1,'Club',$2,'c','v',$3)`,
        [`Player ${i}`, `hash${i}`, i === 3 ? new Date() : null],
      );
    await pg.exec(`insert into application(tournament_id,player_id,status,team_name,team_name_source)
      select 'cup',id,'approved','Club','registration' from player`);
    await pg.query(
      `insert into new_player_registration_request(tournament_id,gaming_name,team_name,contact_proof,consent_version)
       values('cup','Waiting','Club',$1,'v')`,
      ["f".repeat(64)],
    );
    const snapshot = async () => ({
      players: (await pg.query(`select id,gaming_name,team_name,public_no,contact_hash,deleted_at from player order by public_no`)).rows,
      entries: (await pg.query(`select * from application order by id`)).rows,
      requests: (await pg.query(`select id,tournament_id,gaming_name,team_name,contact_proof,status from new_player_registration_request`)).rows,
      sequence: (await pg.query(`select last_value,is_called from player_public_no_seq`)).rows,
    });
    const before = await snapshot();
    await upTo(pg, "014_registration_tiers");
    assert.deepEqual(await snapshot(), before);
    // Defaults: everyone stays a registered XG player, nothing claimed or locked.
    assert.deepEqual(
      (await pg.query(`select distinct player_type,display_nickname,nickname_locked from player`)).rows,
      [{ player_type: "registered", display_nickname: null, nickname_locked: false }],
    );
    assert.equal((await pg.query(`select * from player_credential`)).rows.length, 0);
    assert.deepEqual(
      (await pg.query(`select registration_tier,pending_password_hash,pending_nickname from new_player_registration_request`)).rows,
      [{ registration_tier: "registered", pending_password_hash: null, pending_nickname: null }],
    );
    // Safe to run twice (repository convention).
    for (const f of (await migrationFiles()).filter((f) => f.name >= "013")) await pg.exec(f.source);
    assert.deepEqual(await snapshot(), before);
  } finally {
    await pg.close();
  }
});

test("players: guests have no XG ID, nicknames are unique ignoring case and lock only when set", async () => {
  const pg = new PGlite();
  try {
    await upTo(pg, "014_registration_tiers");
    const add = (name: string, extra = "", values: unknown[] = []) =>
      pg.query<{ id: string; public_no: number }>(
        `insert into player(gaming_name,contact_hash,contact_cipher,consent_version${extra ? "," + extra : ""})
         values($1,$2,'c','v'${values.map((_, i) => `,$${i + 3}`).join("")}) returning id,public_no`,
        [name, `h-${name}`, ...values],
      );
    const reg = (await add("Reg")).rows[0];
    assert.ok(reg.public_no > 0);
    // A guest takes a negative number from its own sequence; the XG ID sequence doesn't move.
    const seq = async () => (await pg.query<{ last_value: string }>(`select last_value from player_public_no_seq`)).rows[0].last_value;
    const before = await seq();
    const guest = (
      await pg.query<{ public_no: number }>(
        `insert into player(gaming_name,contact_hash,contact_cipher,consent_version,player_type,public_no)
         values('Guest','h-guest','c','v','guest',-nextval('player_guest_no_seq')) returning public_no`,
      )
    ).rows[0];
    assert.equal(guest.public_no, -1);
    assert.equal(await seq(), before);
    // The sign of the number always matches the type.
    await rejects(pg, `insert into player(gaming_name,contact_hash,contact_cipher,consent_version,player_type) values('G2','h-g2','c','v','guest')`, [], /player_guest_number/);
    await rejects(pg, `insert into player(gaming_name,contact_hash,contact_cipher,consent_version,public_no) values('R2','h-r2','c','v',-5)`, [], /player_guest_number/);
    await rejects(pg, `update player set player_type='vip' where id=$1`, [reg.id], /player_type_check/);
    await rejects(pg, `update player set display_nickname='Ghost' where public_no=-1`, [], /player_guest_no_nickname/);

    await pg.query(`update player set display_nickname='Neo',nickname_locked=true where id=$1`, [reg.id]);
    const other = (await add("Other")).rows[0];
    await rejects(pg, `update player set display_nickname='NEO' where id=$1`, [other.id], /player_display_nickname_ci/);
    await rejects(pg, `update player set display_nickname='N' where id=$1`, [other.id], /player_display_nickname_length/);
    await rejects(pg, `update player set nickname_locked=true where id=$1`, [other.id], /player_nickname_lock/);
  } finally {
    await pg.close();
  }
});

test("credentials and one-time codes: hashes only, bounded counter, one open code per purpose", async () => {
  const pg = new PGlite();
  try {
    await upTo(pg, "014_registration_tiers");
    const { rows } = await pg.query<{ id: string }>(
      `insert into player(gaming_name,contact_hash,contact_cipher,consent_version) values('P','h','c','v') returning id`,
    );
    const id = rows[0].id;
    // A plaintext password can't be stored, and a hash needs its change time.
    await rejects(pg, `insert into player_credential(player_id,password_hash,password_changed_at) values($1,'hunter2hunter2',now())`, [id], /player_credential_password_hash_check/);
    await rejects(pg, `insert into player_credential(player_id,password_hash) values($1,$2)`, [id, HASH], /player_credential_check/);
    await pg.query(`insert into player_credential(player_id) values($1)`, [id]);
    await rejects(pg, `update player_credential set failed_attempts=6 where player_id=$1`, [id], /failed_attempts_check/);
    await pg.query(`update player_credential set password_hash=$2,password_changed_at=now() where player_id=$1`, [id, HASH]);

    const admin = "759756138437804042";
    const code = (purpose: string, hash: string) =>
      pg.query(
        `insert into player_one_time_code(player_id,purpose,code_hash,expires_at,created_by_admin) values($1,$2,$3,now()+interval '24 hours',$4)`,
        [id, purpose, hash, admin],
      );
    await rejects(pg, `insert into player_one_time_code(player_id,purpose,code_hash,expires_at,created_by_admin) values($1,'claim','K7Q2XM',now()+interval '1 hour',$2)`, [id, admin], /code_hash_check/);
    await rejects(pg, `insert into player_one_time_code(player_id,purpose,code_hash,expires_at,created_by_admin) values($1,'login',$2,now()+interval '1 hour',$3)`, [id, "a".repeat(64), admin], /purpose_check/);
    await rejects(pg, `insert into player_one_time_code(player_id,purpose,code_hash,expires_at,created_by_admin) values($1,'claim',$2,now()-interval '1 hour',$3)`, [id, "a".repeat(64), admin], /player_one_time_code_check/);
    await code("claim", "a".repeat(64));
    await code("reset", "b".repeat(64));
    await assert.rejects(() => code("claim", "c".repeat(64)), /player_one_time_code_active/);
    await pg.exec(`update player_one_time_code set revoked_at=now() where purpose='claim'`);
    await code("claim", "c".repeat(64));
    await rejects(pg, `update player_one_time_code set used_at=now() where revoked_at is not null`, [], /player_one_time_code_check1/);
    // Credentials and codes go with the player record.
    await pg.query(`delete from player where id=$1`, [id]);
    assert.equal((await pg.query(`select * from player_credential`)).rows.length, 0);
    assert.equal((await pg.query(`select * from player_one_time_code`)).rows.length, 0);
  } finally {
    await pg.close();
  }
});

test("registration tiers: a decision always clears the password hash and nickname", async () => {
  const pg = new PGlite();
  try {
    await upTo(pg, "014_registration_tiers");
    await pg.exec(`insert into tournament(id,name,status,published) values('cup','Cup','open',true)`);
    const request = (tier: string, hash: string | null, nickname: string | null, n: number) =>
      pg.query<{ id: string }>(
        `insert into new_player_registration_request(tournament_id,gaming_name,team_name,contact_proof,consent_version,
           registration_tier,pending_password_hash,pending_nickname)
         values('cup',$1,'Club',$2,'v',$3,$4,$5) returning id`,
        [`Applicant ${n}`, String(n).repeat(64).slice(0, 64), tier, hash, nickname],
      );
    const { id } = (await request("registered", HASH, "Owl", 1)).rows[0];
    await rejects(pg, `update new_player_registration_request set status='rejected',decided_at=now(),gaming_name=null,team_name=null,contact_proof=null where id=$1`, [id], /new_player_registration_account_purged/);
    await pg.query(`update new_player_registration_request set status='rejected',decided_at=now(),gaming_name=null,team_name=null,contact_proof=null,pending_password_hash=null,pending_nickname=null where id=$1`, [id]);
    await assert.rejects(() => request("guest", HASH, "Owl", 2), /new_player_registration_guest_no_account/);
    await assert.rejects(() => request("registered", "plaintext", "Owl", 3), /new_player_registration_password_hash/);
    await assert.rejects(() => request("registered", HASH, null, 4), /new_player_registration_account_pair/);
    await assert.rejects(() => request("vip", null, null, 5), /new_player_registration_tier_check/);
    await request("guest", null, null, 6);
    await request("registered", null, null, 7);
  } finally {
    await pg.close();
  }
});

test("the release preflight passes on a database with 001–014 applied", async () => {
  const pg = new PGlite();
  try {
    await upTo(pg, "014_registration_tiers");
    // Production's 006 row, recognized by its pinned checksum.
    await pg.query(`insert into xgamer_migration(name,hash) values('006_mcp_oauth',$1)`, [
      "ae5529b1a747ca3ba6fe30da75ed1d3b368bbb57462a9917c3162468cddde2d1",
    ]);
    const file = (await readFile(new URL("../docs/sql/registration-preflight.sql", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
    const results = await pg.exec(file);
    const checks = results.find((r) => r.fields.some((f) => f.name === "check_name"))!
      .rows as { check_name: string; status: string; detail: string }[];
    assert.ok(checks.length > 30);
    assert.deepEqual(checks.filter((c) => c.status !== "pass"), []);
    for (const name of ["Definitions for 013_player_accounts", "Definitions for 014_registration_tiers", "Objects for 013_player_accounts: public.player_credential", "Ledger: 014_registration_tiers"])
      assert.ok(checks.some((c) => c.check_name === name && c.status === "pass"), name);
  } finally {
    await pg.close();
  }
});
