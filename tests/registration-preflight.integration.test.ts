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
/** Runs the file's statements; the checks are the last result. */
const preflight = async (searchPath?: string) => {
  const results = (await sql.begin("read only", async (tx) => {
    if (searchPath) await tx.unsafe(`set local search_path = ${searchPath}`);
    return tx.unsafe(query);
  })) as unknown as Row[][] | Row[];
  const last = results.at(-1);
  return (Array.isArray(last) ? last : results) as Row[];
};
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
  // It only reads: no data-changing or schema statements outside comments and
  // string literals (the expected definitions are data, compared as text).
  const code = query
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/--.*$/gm, "")
    .toLowerCase();
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
    // A later migration recorded while earlier ones are missing (and its objects absent).
    const files = await migrationFiles();
    const nine = files.find((f) => f.name === "009_contact_change")!;
    await sql`insert into xgamer_migration(name,hash) values(${nine.name},${nine.hash})`;
    try {
      const rows = await preflight();
      assert.deepEqual(failures(rows).sort(), [
        "Columns for 009_contact_change: player.contact_verification_method",
        "Columns for 009_contact_change: player.contact_verified_at",
        "Columns for 009_contact_change: player.contact_version",
        "Definitions for 009_contact_change",
        "Ledger order: 007_application_team_name",
        "Ledger order: 008_team_name_provenance",
        "Objects for 009_contact_change: public.contact_change",
        "Objects for 009_contact_change: public.contact_change_open_number",
        "Objects for 009_contact_change: public.contact_change_open_player",
        "Objects for 009_contact_change: public.contact_change_queue",
      ]);
    } finally {
      await sql`delete from xgamer_migration where name=${nine.name}`;
    }
    // A column added outside the ledger is flagged for review.
    await sql`alter table application add column team_name text`;
    try {
      assert.equal(
        status(await preflight(), "Columns for 007_application_team_name: application.team_name"),
        "warn",
      );
    } finally {
      await sql`alter table application drop column team_name`;
    }
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

type Def = { migration: string; kind: string; tbl: string; name: string; def: string };
const DEFINITION_ROW =
  /^ {2}\('(\d{3}_[a-z0-9_]+)', '(index|[cfnpu])', '([a-z_]+)', '([a-z0-9_]+)', '((?:[^']|'')*)'\),?$/gm;
const listedDefinitions = async (): Promise<Def[]> =>
  [
    ...(await readFile(FILE, "utf8"))
      .replace(/\r\n/g, "\n")
      .matchAll(DEFINITION_ROW),
  ].map(
    ([, migration, kind, tbl, name, def]) => ({
      migration,
      kind,
      tbl,
      name,
      def: def.replace(/''/g, "'"),
    }),
  );
const defKey = (d: { kind: string; tbl: string; def: string }) =>
  `${d.kind}|${d.tbl}|${d.def}`;

test(
  "the preflight's expected definitions are exactly what 001–012 create, each owned by the migration that last sets it",
  { skip },
  async () => {
    const url = new URL(base!);
    const name = url.pathname.slice(1) + "_catalog";
    if (!/^[a-z0-9_]{1,50}$/.test(name))
      throw new Error("Unsafe test database name.");
    const setup = postgres(base!, { ssl: false, max: 1, onnotice: () => {} });
    try {
      await setup`drop database if exists ${setup(name)} with (force)`;
      await setup`create database ${setup(name)}`;
    } finally {
      await setup.end();
    }
    url.pathname = "/" + name;
    const fresh = postgres(url.toString(), { ssl: false, max: 1, onnotice: () => {} });
    try {
      const { applyMigrations } = await import("../src/lib/migrations");
      const files = await migrationFiles();
      // One migration at a time: an item belongs to the migration after which it
      // first appears and then stays until 012.
      const owned = new Map<string, Def>();
      for (const f of files) {
        await applyMigrations(
          fresh as never,
          files.filter((g) => g.name <= f.name),
          () => {},
        );
        const now = await fresh<Omit<Def, "migration">[]>`
          select 'index' as kind, c.relname as tbl, i.relname as name, pg_get_indexdef(i.oid) as def
          from pg_index x join pg_class i on i.oid=x.indexrelid join pg_class c on c.oid=x.indrelid
          join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
          union all
          select k.contype::text, c.relname, k.conname, pg_get_constraintdef(k.oid)
          from pg_constraint k join pg_class c on c.oid=k.conrelid
          join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'`;
        const present = new Set(now.map(defKey));
        for (const k of [...owned.keys()]) if (!present.has(k)) owned.delete(k);
        for (const d of now)
          if (!owned.has(defKey(d)))
            owned.set(defKey(d), {
              migration: f.name,
              kind: d.kind,
              tbl: d.tbl,
              name: d.name,
              def: d.def,
            });
      }
      const sorted = (list: Def[]) =>
        [...list].sort((a, b) => defKey(a).localeCompare(defKey(b)));
      const listed = await listedDefinitions();
      assert.equal(listed.length, owned.size);
      assert.deepEqual(sorted(listed), sorted([...owned.values()]));
      // The release-critical guards are listed with their exact predicates.
      const defs = listed.map((d) => d.def);
      for (const expected of [
        "CREATE UNIQUE INDEX contact_change_open_number ON public.contact_change USING btree (new_contact_hash) WHERE (status = ANY (ARRAY['pending_code'::text, 'awaiting_second_admin'::text]))",
        "CREATE UNIQUE INDEX new_player_registration_pending_claim ON public.new_player_registration_request USING btree (tournament_id, contact_proof, gaming_name, team_name) WHERE (status = 'pending'::text)",
        "CREATE UNIQUE INDEX returning_registration_pending_claim ON public.returning_registration_request USING btree (tournament_id, contact_proof) WHERE (status = 'pending'::text)",
        "CREATE UNIQUE INDEX player_contact_hash_key ON public.player USING btree (contact_hash)",
      ])
        assert.ok(defs.includes(expected), expected);
    } finally {
      await fresh.end();
    }
  },
);

test(
  "after the packet, an index or constraint with the right name but the wrong definition fails the preflight",
  { skip },
  async () => {
    // The earlier tests left this database with the whole packet applied.
    assert.deepEqual(failures(await preflight()), []);
    // A session without public on its search path would print "public.player(id)"
    // in foreign keys; the file fixes the path, so nothing fails falsely.
    assert.ok(
      (await preflight("pg_catalog")).every((r) => r.status === "pass"),
    );
    const detail = (rows: Row[], name: string) =>
      rows.find((r) => r.check_name === name)?.detail ?? "";
    const expectFailure = async (
      check: string,
      object: string,
      breakIt: string,
      restore: string,
    ) => {
      await sql.unsafe(breakIt);
      try {
        const rows = await preflight();
        assert.deepEqual(failures(rows), [check], object);
        assert.ok(detail(rows, check).includes(object), detail(rows, check));
        return rows;
      } finally {
        await sql.unsafe(restore);
      }
    };
    // Same name, not unique: two open changes to one number would be allowed.
    let rows = await expectFailure(
      "Definitions for 009_contact_change",
      "contact_change.contact_change_open_number",
      `drop index contact_change_open_number;
       create index contact_change_open_number on contact_change(new_contact_hash)
         where status in ('pending_code','awaiting_second_admin')`,
      `drop index contact_change_open_number;
       create unique index contact_change_open_number on contact_change(new_contact_hash)
         where status in ('pending_code','awaiting_second_admin')`,
    );
    assert.equal(status(rows, "Unexpected indexes and constraints"), "warn");
    // Same name and uniqueness, no predicate: decided requests would block new ones.
    await expectFailure(
      "Definitions for 012_new_player_registration_approval",
      "new_player_registration_request.new_player_registration_pending_claim",
      `drop index new_player_registration_pending_claim;
       create unique index new_player_registration_pending_claim on new_player_registration_request
         (tournament_id, contact_proof, gaming_name, team_name)`,
      `drop index new_player_registration_pending_claim;
       create unique index new_player_registration_pending_claim on new_player_registration_request
         (tournament_id, contact_proof, gaming_name, team_name) where status = 'pending'`,
    );
    // Same name, other columns.
    await expectFailure(
      "Definitions for 011_returning_player_registration",
      "returning_registration_request.returning_registration_pending_claim",
      `drop index returning_registration_pending_claim;
       create unique index returning_registration_pending_claim on returning_registration_request
         (tournament_id, contact_proof, team_name) where status = 'pending'`,
      `drop index returning_registration_pending_claim;
       create unique index returning_registration_pending_claim on returning_registration_request
         (tournament_id, contact_proof) where status = 'pending'`,
    );
    // A weakened check constraint under its original name.
    await expectFailure(
      "Definitions for 008_team_name_provenance",
      "application.application_team_name_source_check",
      `alter table application drop constraint application_team_name_source_check;
       alter table application add constraint application_team_name_source_check check (true)`,
      `alter table application drop constraint application_team_name_source_check;
       alter table application add constraint application_team_name_source_check check (
         team_name_source is null or team_name_source in
         ('registration','registration_record','organizer_attested','organizer_corrected'))`,
    );
    // The unique number on file that ON CONFLICT (contact_hash) relies on.
    await expectFailure(
      "Definitions for 001_control_center",
      "player.player_contact_hash_key",
      "alter table player drop constraint player_contact_hash_key",
      "alter table player add constraint player_contact_hash_key unique (contact_hash)",
    );
    // Right definition, but invalid (a failed concurrent build): it enforces nothing.
    // Simulated in the catalog of this disposable database.
    await expectFailure(
      "Definitions for 009_contact_change",
      "contact_change.contact_change_open_player",
      `update pg_index set indisvalid = false
         where indexrelid = 'public.contact_change_open_player'::regclass`,
      `update pg_index set indisvalid = true
         where indexrelid = 'public.contact_change_open_player'::regclass`,
    );
    // A dropped NOT NULL.
    await expectFailure(
      "Definitions for 012_new_player_registration_approval",
      "new_player_registration_request.new_player_registration_request_consent_version_not_null",
      "alter table new_player_registration_request alter column consent_version drop not null",
      "alter table new_player_registration_request alter column consent_version set not null",
    );
    // An extra index on a covered table is reported for review, not failed.
    await sql`create unique index preflight_extra on player(gaming_name)`;
    try {
      rows = await preflight();
      assert.deepEqual(failures(rows), []);
      assert.equal(status(rows, "Unexpected indexes and constraints"), "warn");
      assert.ok(
        detail(rows, "Unexpected indexes and constraints").includes("player.preflight_extra"),
      );
    } finally {
      await sql`drop index preflight_extra`;
    }
    rows = await preflight();
    assert.ok(rows.every((r) => r.status === "pass"), JSON.stringify(rows));
  },
);
