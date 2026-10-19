import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { db } from "../src/lib/db";
const sql = db();
try {
  const source = await readFile(
    new URL("../migrations/001_control_center.sql", import.meta.url),
    "utf8",
  );
  const hash = createHash("sha256").update(source).digest("hex");
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(2026102401)`;
    await tx`create table if not exists xgamer_migration(name text primary key, hash text not null, applied_at timestamptz not null default now())`;
    const [previous] =
      await tx`select hash from xgamer_migration where name='001_control_center'`;
    if (previous) {
      if (previous.hash !== hash)
        throw new Error(
          "Applied migration checksum differs. Create a new migration.",
        );
      return;
    }
    await tx.unsafe(source);
    await tx`insert into xgamer_migration(name,hash) values('001_control_center',${hash})`;
  });
  console.log("Control Center migration verified.");
} finally {
  await sql.end();
}
