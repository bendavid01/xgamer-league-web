import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildMode,
  compareLedger,
  migrateOnBuildRequested,
  migrationFiles,
} from "../src/lib/migrations";

const url = "postgres://user@host/db";

test("ordinary builds never change the database", () => {
  // No database configured: nothing to do.
  assert.equal(buildMode({}), "skip");
  assert.equal(buildMode({ VERCEL: "1", VERCEL_ENV: "production" }), "skip");
  // Production builds only check.
  assert.equal(
    buildMode({ DATABASE_URL: url, VERCEL: "1", VERCEL_ENV: "production" }),
    "check",
  );
  // Preview and development builds on Vercel don't touch any database.
  assert.equal(
    buildMode({ DATABASE_URL: url, VERCEL: "1", VERCEL_ENV: "preview" }),
    "skip",
  );
  assert.equal(
    buildMode({ DATABASE_URL: url, VERCEL: "1", VERCEL_ENV: "development" }),
    "skip",
  );
  // Local build with a database: check only.
  assert.equal(buildMode({ DATABASE_URL: url }), "check");
  // No build ever applies migrations, whatever MIGRATE_ON_BUILD says: a Vercel
  // production build only checks, and a preview build doesn't connect at all.
  for (const v of ["true", "1", "yes", "TRUE", ""]) {
    assert.equal(
      buildMode({
        DATABASE_URL: url,
        VERCEL: "1",
        VERCEL_ENV: "production",
        MIGRATE_ON_BUILD: v,
      }),
      "check",
    );
    assert.equal(
      buildMode({
        DATABASE_URL: url,
        VERCEL: "1",
        VERCEL_ENV: "preview",
        MIGRATE_ON_BUILD: v,
      }),
      "skip",
    );
    assert.equal(buildMode({ DATABASE_URL: url, MIGRATE_ON_BUILD: v }), "check");
  }
  assert.equal(migrateOnBuildRequested({ MIGRATE_ON_BUILD: "true" }), true);
  assert.equal(migrateOnBuildRequested({ MIGRATE_ON_BUILD: " " }), false);
  assert.equal(migrateOnBuildRequested({}), false);
});

test("the build script cannot apply migrations: it never imports the runner", async () => {
  const { readFile } = await import("node:fs/promises");
  const script = await readFile(
    new URL("../scripts/build-migrate.mts", import.meta.url),
    "utf8",
  );
  assert.ok(!/applyMigrations/.test(script), "build-migrate must not apply");
  assert.ok(!/\bunsafe\s*\(/.test(script));
  assert.ok(!/insert into|create table|alter table/i.test(script));
});

test("ledger check finds pending, edited and outside migrations", async () => {
  const files = await migrationFiles();
  assert.deepEqual(
    files.slice(0, 5).map((f) => f.name),
    [
      "001_control_center",
      "002_open_registration",
      "003_multi_tournament",
      "004_seasons_podium",
      "005_announcement_dates",
    ],
  );
  const ledger = files.map((f) => ({ name: f.name, hash: f.hash }));
  assert.deepEqual(compareLedger(files, ledger), {
    pending: [],
    changed: [],
    recognized: [],
    unknown: [],
    lineEndingVariants: [],
  });
  // Production today: 001–005 plus 006_mcp_oauth from the MCP preview build.
  // A known name with a different checksum fails the check.
  assert.deepEqual(
    compareLedger(files, [...ledger, { name: "006_mcp_oauth", hash: "h" }]),
    {
      pending: [],
      changed: ["006_mcp_oauth"],
      recognized: [],
      unknown: [],
      lineEndingVariants: [],
    },
  );
  // Anything else applied outside the code is reported as unknown (still untouched).
  assert.deepEqual(
    compareLedger(files, [...ledger, { name: "099_mystery", hash: "h" }])
      .unknown,
    ["099_mystery"],
  );
  const last = files.at(-1)!.name;
  assert.deepEqual(compareLedger(files, ledger.slice(0, -1)).pending, [last]);
  const edited = ledger.map((m, i) => (i === 0 ? { ...m, hash: "edited" } : m));
  assert.deepEqual(compareLedger(files, edited).changed, [files[0].name]);
  // A fresh database: everything pending.
  assert.deepEqual(
    compareLedger(files, []).pending,
    files.map((f) => f.name),
  );
});

test("G6: the release ledger includes the returning-player migration and verifies 006 without running it", async () => {
  const files = await migrationFiles();
  assert.ok(
    !files.some((f) => f.name.startsWith("006")),
    "006 never ships here",
  );
  const production = [
    ...files.filter((f) => f.name < "006"),
    {
      name: "006_mcp_oauth",
      // Production's stored hash (feature/mcp-server 49de1cf, confirmed in M1).
      hash: "ae5529b1a747ca3ba6fe30da75ed1d3b368bbb57462a9917c3162468cddde2d1",
    },
  ].map(({ name, hash }) => ({ name, hash }));
  // Before the release packet: the build stops because the new schema is pending.
  assert.deepEqual(compareLedger(files, production), {
    pending: [
      "007_application_team_name",
      "008_team_name_provenance",
      "009_contact_change",
      "011_returning_player_registration",
      "012_new_player_registration_approval",
    ],
    changed: [],
    recognized: ["006_mcp_oauth"],
    unknown: [],
    lineEndingVariants: [],
  });
  // After the packet: all required migrations are present and 006 remains recognized.
  const after = [
    ...production,
    ...files
      .filter((f) => f.name > "006")
      .map(({ name, hash }) => ({ name, hash })),
  ];
  assert.deepEqual(compareLedger(files, after), {
    pending: [],
    changed: [],
    recognized: ["006_mcp_oauth"],
    unknown: [],
    lineEndingVariants: [],
  });
  const drifted = after.map((m) =>
    m.name === "006_mcp_oauth" ? { ...m, hash: "a".repeat(64) } : m,
  );
  // Even a local copy cannot override the independently pinned checksum.
  assert.deepEqual(
    compareLedger(
      [
        ...files,
        {
          ...drifted.find((m) => m.name === "006_mcp_oauth")!,
          source: "select 1",
          crlfHash: "b".repeat(64),
        },
      ],
      drifted,
    ),
    {
      pending: [],
      changed: ["006_mcp_oauth"],
      recognized: [],
      unknown: [],
      lineEndingVariants: [],
    },
  );
});

test("M5: checksums ignore CRLF checkouts and keep every previously issued LF hash", async () => {
  const files = await migrationFiles();
  for (const f of files) {
    assert.ok(!f.source.includes("\r"), `${f.name} is normalized to LF`);
    assert.equal(
      f.crlfHash,
      createHash("sha256").update(f.source.replace(/\n/g, "\r\n")).digest("hex"),
    );
  }
  // Issued checksums (Linux CI and production builds), pinned independently of the
  // working tree so a CRLF checkout on Windows can never change them.
  const issued: Record<string, string> = {
    "001_control_center":
      "ab5720d1adcdce493aad0d728a9bdf8da2c4de5f1ee9a25930a870b45b673066",
    "002_open_registration":
      "a834fadbc255c4bde33ea3620beb6a70f2f5ed70326db7963dca5fd8d60df03c",
    "003_multi_tournament":
      "cc60e24411fd2a8cb3bc62e1145d8e30cd27f92ece89e2728d36dbdf0cf256d7",
    "004_seasons_podium":
      "fde24c503a800f3820087bc418d3625432b7c5770bfcbedd907d462fd39d85b3",
    "005_announcement_dates":
      "30f43e74e0c7e22f9a06c6e89e2069976c04bc86a23127bbe0fb2e1d07b3ee1d",
    "007_application_team_name":
      "bbc004390ba1b09cbc7ce09c2fc644192e7d081d92e54a3bfaec397655f5ea41",
    "008_team_name_provenance":
      "ef7e292c35ac579b37964406ff5bf9f149fd78fec841e83054f1d9f4494b20d1",
    "009_contact_change":
      "af65cfb2a18f63b07ec3cdc7c1945ac18c44a0ae1a46c503742ddb2567f73097",
    "011_returning_player_registration":
      "d179cc982a00a3d1b585e0a5c5d779d94052db02d1640f60408bb5a05259d450",
    "012_new_player_registration_approval":
      "d946cfe3750594eb42bc380a7e874726d3d2006fe0e18129de6b4e1e4d6a4012",
  };
  assert.deepEqual(
    Object.fromEntries(files.map((f) => [f.name, f.hash])),
    issued,
  );
  // The same SQL hashed from a CRLF checkout is equal, not an edit.
  const fromWindows = files.map((f) => ({ name: f.name, hash: f.crlfHash }));
  const status = compareLedger(files, fromWindows);
  assert.deepEqual(status.changed, []);
  assert.deepEqual(status.pending, []);
  assert.deepEqual(
    status.lineEndingVariants,
    files.map((f) => f.name),
  );
  // A real edit is still caught.
  assert.deepEqual(
    compareLedger(files, [{ name: files[0].name, hash: "c".repeat(64) }])
      .changed,
    [files[0].name],
  );
  // The written files are pure LF from git's point of view.
  const { readFile } = await import("node:fs/promises");
  const attributes = await readFile(
    new URL("../.gitattributes", import.meta.url),
    "utf8",
  );
  assert.match(attributes, /^\*\.sql text eol=lf$/m);
  assert.match(attributes, /^migrations\/\*\* text eol=lf$/m);
});
