import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { db } from "../src/lib/db";

/** Applies every migrations/NNN_name.sql in order, once, with a checksum ledger. */
const sql = db();
try {
  const dir = new URL("../migrations/", import.meta.url);
  const files = (await readdir(dir))
    .filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(2026102401)`;
    await tx`create table if not exists xgamer_migration(name text primary key, hash text not null, applied_at timestamptz not null default now())`;
    for (const file of files) {
      const name = file.replace(/\.sql$/, "");
      const source = await readFile(new URL(file, dir), "utf8");
      const hash = createHash("sha256").update(source).digest("hex");
      const [previous] =
        await tx`select hash from xgamer_migration where name=${name}`;
      if (previous) {
        if (previous.hash !== hash)
          throw new Error(
            `Applied migration ${name} checksum differs. Create a new migration.`,
          );
        continue;
      }
      await tx.unsafe(source);
      await tx`insert into xgamer_migration(name,hash) values(${name},${hash})`;
      console.log(`Applied ${name}.`);
    }
  });
  console.log("Migrations verified.");
} finally {
  await sql.end();
}
