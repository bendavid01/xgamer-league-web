import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMode,
  compareLedger,
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
  // Applying needs the explicit switch, spelled exactly.
  assert.equal(
    buildMode({
      DATABASE_URL: url,
      VERCEL: "1",
      VERCEL_ENV: "production",
      MIGRATE_ON_BUILD: "true",
    }),
    "apply",
  );
  for (const v of ["1", "yes", "TRUE", ""])
    assert.equal(
      buildMode({
        DATABASE_URL: url,
        VERCEL: "1",
        VERCEL_ENV: "production",
        MIGRATE_ON_BUILD: v,
      }),
      "check",
    );
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
  });
  // Production today: 001–005 plus 006_mcp_oauth from the MCP preview build.
  // A known name with a different checksum fails the check.
  assert.deepEqual(
    compareLedger(files, [...ledger, { name: "006_mcp_oauth", hash: "h" }]),
    { pending: [], changed: ["006_mcp_oauth"], recognized: [], unknown: [] },
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

test("G6: the release branch against production's ledger (001–006, then 007 + 008 + 009): schema matches, 006 recognized and untouched", async () => {
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
  // Before the release packet: 007 and 008 are pending, so a production build stops.
  assert.deepEqual(compareLedger(files, production), {
    pending: [
      "007_application_team_name",
      "008_team_name_provenance",
      "009_contact_change",
    ],
    changed: [],
    recognized: ["006_mcp_oauth"],
    unknown: [],
  });
  // After the packet records 007 and 008: clean, and 006 is still only recognized.
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
        },
      ],
      drifted,
    ),
    { pending: [], changed: ["006_mcp_oauth"], recognized: [], unknown: [] },
  );
});
