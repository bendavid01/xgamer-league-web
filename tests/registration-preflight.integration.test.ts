/**
 * L3: docs/sql/registration-preflight.sql, the read-only check to run before the
 * registration release packet. Disposable local database only.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { testDatabaseUrl } from "./helpers/test-database";
import { migrationFiles } from "../src/lib/migrations";

const base = testDatabaseUrl();
const skip = !base && "TEST_DATABASE_URL not set";
const FILE = new URL("../docs/sql/registration-preflight.sql", import.meta.url);
const PINNED_006 =
  "ae5529b1a747ca3ba6fe30da75ed1d3b368bbb57462a9917c3162468cddde2d1";

let sql: ReturnType<typeof postgres>;
let query: string;

type Row = { check_name: string; status: string; detail: string };
const preflight = async () =>
  (await sql.begin("read only", (tx) => tx.unsafe(query))) as unknown as Row[];
const status = (rows: Row[], name: string) =>
  rows.find((r) => r.check_name === name)?.status;
const failures = (rows: Row[]) =>
  rows.filter((r) => r.status === "fail").map((r) => r.check_name);

before(async () => {
  const text = await readFile(FILE, "utf8");
  const start = text.indexOf("begin transaction read only;");
  const end = text.lastIndexOf("rollback;");
  assert.ok(start >= 0 && end > start, "the preflight runs in a read-only transaction");
  query = text.slice(start + "begin transaction read only;".length, end);
  if (!base) return;
  const url = new URL(base);
  const name = url.pathname.slice(1) + "_preflight";
  if (!/^[a-z0-9_]{1,50}$/.test(name))
    throw new Error("Unsafe test database name.");
  const setup = postgres(base, { ssl: false, max: 1, onnotice: () => {} });
  try {
    await setup`drop database if exists ${setup(name)} with (force)`;
    await setup`create database ${setup(name)}`;
  } finally {
    await setup.end();
  }
  url.pathname = "/" + name;
  sql = postgres(url.toString(), { ssl: false, max: 2, onnotice: () => {} });
});

after(async () => {
  if (sql) await sql.end();
});

test("the preflight's expected checksums are exactly the issued LF (and CRLF) values", async () => {
  const text = await readFile(FILE, "utf8");
  const listed = [
    ...text.matchAll(/\('(\d{3}_[a-z0-9_]+)', '([a-f0-9]{64})', '([a-f0-9]{64})'\)/g),
  ].map(([, name, lf, crlf]) => ({ name, lf, crlf }));
  const files = await migrationFiles();
  assert.deepEqual(
    listed,
    files.map((f) => ({ name: f.name, lf: f.hash, crlf: f.crlfHash })),
  );
  // It only reads: no data-changing or schema statements outside the comments.
  const code = query.replace(/--.*$/gm, "").toLowerCase();
  for (const word of ["insert ", "update ", "delete ", "create ", "alter ", "drop ", "truncate "])
    assert.ok(!code.includes(word), `preflight must not contain "${word.trim()}"`);
});

test(
  "the preflight runs without a ledger and fails safely instead of erroring",
  { skip },
  async () => {
    const rows = await preflight();
    assert.equal(status(rows, "Migration ledger present"), "fail");
    assert.equal(status(rows, "PostgreSQL version"), "pass");
    assert.equal(status(rows, "Ledger: 001_control_center"), "fail");
  },
);

test(
  "a production-shaped database (001–005 plus 006) passes before the packet",
  { skip },
  async () => {
    const { applyMigrations } = await import("../src/lib/migrations");
    const files = await migrationFiles();
    await applyMigrations(
      sql as never,
      files.filter((f) => f.name < "006"),
      () => {},
    );
    await sql`insert into xgamer_migration(name,hash) values('006_mcp_oauth',${PINNED_006})`;
    const rows = await preflight();
    assert.deepEqual(failures(rows), []);
    assert.equal(status(rows, "Ledger: 006_mcp_oauth (outside this code)"), "pass");
    assert.equal(status(rows, "Ledger: 012_new_player_registration_approval"), "pass");
    assert.match(
      rows.find((r) => r.check_name === "Ledger: 011_returning_player_registration")!.detail,
      /not applied yet/,
    );
  },
);

test(
  "a table left behind by another build, a CRLF ledger hash and an edited migration are reported",
  { skip },
  async () => {
    await sql`create table returning_registration_request(id integer)`;
    try {
      const rows = await preflight();
      assert.deepEqual(failures(rows), [
        "Objects for 011_returning_player_registration: public.returning_registration_request",
      ]);
    } finally {
      await sql`drop table returning_registration_request`;
    }
    const [first] = await migrationFiles();
    await sql`update xgamer_migration set hash=${first.crlfHash} where name=${first.name}`;
    assert.equal(status(await preflight(), `Ledger: ${first.name}`), "warn");
    await sql`update xgamer_migration set hash=${"0".repeat(64)} where name=${first.name}`;
    assert.equal(status(await preflight(), `Ledger: ${first.name}`), "fail");
    await sql`update xgamer_migration set hash=${first.hash} where name=${first.name}`;
    await sql`update xgamer_migration set hash=${"1".repeat(64)} where name='006_mcp_oauth'`;
    assert.equal(
      status(await preflight(), "Ledger: 006_mcp_oauth (outside this code)"),
      "fail",
    );
    await sql`update xgamer_migration set hash=${PINNED_006} where name='006_mcp_oauth'`;
    await sql`insert into xgamer_migration(name,hash) values('099_mystery','x')`;
    assert.equal(status(await preflight(), "Unknown ledger entries"), "warn");
    await sql`delete from xgamer_migration where name='099_mystery'`;
  },
);

test(
  "after the release packet every check passes and the new objects are present",
  { skip },
  async () => {
    const { applyMigrations } = await import("../src/lib/migrations");
    await applyMigrations(sql as never, await migrationFiles(), () => {});
    const rows = await preflight();
    assert.deepEqual(failures(rows), []);
    assert.ok(rows.every((r) => r.status === "pass"), JSON.stringify(rows));
  },
);
