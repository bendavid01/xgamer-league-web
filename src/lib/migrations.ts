import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { db } from "./db";

/**
 * Database migrations: migrations/NNN_name.sql, applied once each, in order,
 * recorded with a checksum in xgamer_migration. Used by scripts/migrate.mts
 * (a deliberate run) and scripts/build-migrate.mts (the build check).
 */
type Sql = ReturnType<typeof db>;
export type Migration = { name: string; source: string; hash: string };
export type LedgerEntry = { name: string; hash: string };
export type MigrationStatus = {
  /** In this code version but not applied to the database. */
  pending: string[];
  /** Applied, but the file has been edited since. */
  changed: string[];
  /** Applied outside this code version, but known and accepted (see RECOGNIZED_OUTSIDE). */
  recognized: string[];
  /** Applied outside this code version and not recognized. Reported, never touched. */
  unknown: string[];
};

/**
 * Migrations applied to production outside this code version that we know about.
 * 006 was written by the feature/mcp-server preview build on 7 Nov 2026. Its file
 * lives on that branch and must stay byte-identical; it is never re-run or edited.
 */
export const RECOGNIZED_OUTSIDE: Record<string, string> = {
  "006_mcp_oauth":
    "MCP branch (feature/mcp-server), applied by its preview build on 7 Nov 2026",
};

const FILE = /^\d{3}_[a-z0-9_]+\.sql$/;

export async function migrationFiles(
  dir: URL = new URL("../../migrations/", import.meta.url),
): Promise<Migration[]> {
  const names = (await readdir(dir)).filter((f) => FILE.test(f)).sort();
  return Promise.all(
    names.map(async (file) => {
      const source = await readFile(new URL(file, dir), "utf8");
      return {
        name: file.replace(/\.sql$/, ""),
        source,
        hash: createHash("sha256").update(source).digest("hex"),
      };
    }),
  );
}

const outside = (files: Migration[], applied: Map<string, string>) =>
  [...applied.keys()]
    .filter((name) => !files.some((f) => f.name === name))
    .sort();

/** Pure comparison of the migration files with the database ledger. */
export function compareLedger(
  files: Migration[],
  ledger: LedgerEntry[],
): MigrationStatus {
  const applied = new Map(ledger.map((m) => [m.name, m.hash]));
  return {
    pending: files.filter((f) => !applied.has(f.name)).map((f) => f.name),
    changed: files
      .filter((f) => applied.has(f.name) && applied.get(f.name) !== f.hash)
      .map((f) => f.name),
    recognized: outside(files, applied).filter((n) => n in RECOGNIZED_OUTSIDE),
    unknown: outside(files, applied).filter((n) => !(n in RECOGNIZED_OUTSIDE)),
  };
}

/** Read-only. An empty list when the ledger table doesn't exist yet. */
export async function readLedger(sql: Sql): Promise<LedgerEntry[]> {
  const [{ present }] = await sql<
    { present: boolean }[]
  >`select to_regclass('public.xgamer_migration') is not null as present`;
  if (!present) return [];
  return [
    ...(await sql<
      LedgerEntry[]
    >`select name, hash from xgamer_migration order by name`),
  ];
}

/** Applies pending migrations in order, under an advisory lock. Deliberate runs only. */
export async function applyMigrations(
  sql: Sql,
  files: Migration[],
  log: (line: string) => void = console.log,
) {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(2026102401)`;
    await tx`create table if not exists xgamer_migration(name text primary key, hash text not null, applied_at timestamptz not null default now())`;
    for (const f of files) {
      const [previous] =
        await tx`select hash from xgamer_migration where name=${f.name}`;
      if (previous) {
        if (previous.hash !== f.hash)
          throw new Error(
            `Applied migration ${f.name} checksum differs. Create a new migration.`,
          );
        continue;
      }
      await tx.unsafe(f.source);
      await tx`insert into xgamer_migration(name,hash) values(${f.name},${f.hash})`;
      log(`Applied ${f.name}.`);
    }
  });
}

export type BuildMode = "skip" | "check" | "apply";

/**
 * What a build may do with the database. Ordinary builds never change it:
 * production builds only check, preview/development builds on Vercel don't
 * connect at all, and applying needs MIGRATE_ON_BUILD=true (an approved release).
 */
export function buildMode(env: Record<string, string | undefined>): BuildMode {
  if (!env.DATABASE_URL) return "skip";
  if (env.MIGRATE_ON_BUILD === "true") return "apply";
  if (env.VERCEL && env.VERCEL_ENV !== "production") return "skip";
  return "check";
}
