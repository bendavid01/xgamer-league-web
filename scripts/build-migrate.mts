/**
 * Runs before `next build`. Ordinary builds never change the database.
 *
 * - Production: a read-only check. The build stops if this code needs a migration
 *   the database doesn't have yet, or if an applied migration file was edited, so
 *   code can't go live ahead of its schema. Nothing is written.
 * - Preview/development builds on Vercel: no database access at all.
 * - MIGRATE_ON_BUILD=true: an approved release only. Applies the pending
 *   migrations, then checks. Remove the variable straight after that deploy.
 * - No DATABASE_URL (local builds, CI): nothing.
 */
import { db } from "../src/lib/db";
import {
  applyMigrations,
  buildMode,
  compareLedger,
  migrationFiles,
  readLedger,
} from "../src/lib/migrations";

const mode = buildMode(process.env);
let failure = "";
if (mode === "skip") {
  console.log(
    process.env.DATABASE_URL
      ? `[migrate] ${process.env.VERCEL_ENV ?? "non-production"} build — no database access.`
      : "[migrate] DATABASE_URL not set — no database access.",
  );
} else {
  const sql = db();
  try {
    const files = await migrationFiles();
    if (mode === "apply") {
      console.log(
        "[migrate] MIGRATE_ON_BUILD=true — applying pending migrations for an approved release. Remove MIGRATE_ON_BUILD after this deploy.",
      );
      await applyMigrations(sql, files, (line) =>
        console.log(`[migrate] ${line}`),
      );
    }
    const status = compareLedger(files, await readLedger(sql));
    if (status.unknown.length)
      console.log(
        `[migrate] Applied outside this code version (left untouched): ${status.unknown.join(", ")}.`,
      );
    if (status.changed.length)
      failure = `[migrate] Applied migration file(s) were edited: ${status.changed.join(", ")}. Never edit an applied migration; add a new one.`;
    else if (status.pending.length)
      failure = `[migrate] The database is missing migration(s) ${status.pending.join(", ")}. Ordinary builds don't change the database. After approval, set MIGRATE_ON_BUILD=true for one production deploy, then remove it.`;
    else
      console.log(
        mode === "apply"
          ? "[migrate] Database schema now matches this code."
          : "[migrate] Database schema matches this code. Nothing was changed.",
      );
  } finally {
    await sql.end();
  }
}
if (failure) {
  console.error(failure);
  process.exit(1);
}
