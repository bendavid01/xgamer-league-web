import { db } from "../src/lib/db";
import { applyMigrations, migrationFiles } from "../src/lib/migrations";

/**
 * Deliberate run (`npm run db:migrate`): applies every pending
 * migrations/NNN_name.sql in order, once, with a checksum ledger.
 */
const sql = db();
try {
  await applyMigrations(sql, await migrationFiles());
  console.log("Migrations verified.");
} finally {
  await sql.end();
}
