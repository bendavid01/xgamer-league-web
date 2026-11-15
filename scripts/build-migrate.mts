/**
 * Runs before `next build`. Builds never change the database.
 *
 * - Production: a read-only check. The build stops if this code needs a migration
 *   the database doesn't have yet, or if an applied migration file was edited, so
 *   code can't go live ahead of its schema. Nothing is written.
 * - Preview/development builds on Vercel: no database access at all.
 * - No DATABASE_URL (local builds, CI): nothing.
 * - MIGRATE_ON_BUILD is ignored (reported, never acted on). Migrations reach a
 *   database only through a deliberate run: the approved production packet
 *   (docs/MIGRATIONS.md), or `npm run db:migrate` for a local database. This
 *   script deliberately does not import the migration runner.
 */
import { db } from "../src/lib/db";
import {
  buildMode,
  compareLedger,
  migrateOnBuildRequested,
  migrationFiles,
  readLedger,
} from "../src/lib/migrations";
import { OUTSIDE_MIGRATIONS } from "../src/lib/known-migrations";

if (migrateOnBuildRequested(process.env))
  console.warn(
    "[migrate] WARNING: MIGRATE_ON_BUILD is set but ignored. Builds never apply migrations; use the approved migration procedure. Remove the variable.",
  );
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
    const status = compareLedger(files, await readLedger(sql));
    for (const name of status.recognized)
      console.log(
        `[migrate] Recognized, applied outside this code version (left untouched): ${name} — ${OUTSIDE_MIGRATIONS.get(name)?.description}.`,
      );
    if (status.unknown.length)
      console.log(
        `[migrate] WARNING: applied outside this code version and not recognized (left untouched): ${status.unknown.join(", ")}.`,
      );
    if (status.lineEndingVariants.length)
      console.log(
        `[migrate] NOTE: recorded from a CRLF (Windows) checkout of the same SQL (not an edit; ledger left untouched): ${status.lineEndingVariants.join(", ")}.`,
      );
    if (status.changed.length)
      failure = `[migrate] Applied migration checksum differs: ${status.changed.join(", ")}. Verify the ledger before proceeding.`;
    else if (status.pending.length)
      failure = `[migrate] The database is missing migration(s) ${status.pending.join(", ")}. Builds never change the database. Apply them through the approved migration procedure first.`;
    else
      console.log(
        "[migrate] Database schema matches this code. Nothing was changed.",
      );
  } finally {
    await sql.end();
  }
}
if (failure) {
  console.error(failure);
  process.exit(1);
}
