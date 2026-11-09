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
  // 006 is recognized; the check passes and never touches it.
  assert.deepEqual(
    compareLedger(files, [...ledger, { name: "006_mcp_oauth", hash: "h" }]),
    { pending: [], changed: [], recognized: ["006_mcp_oauth"], unknown: [] },
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
