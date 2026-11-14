import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { db } from "./db";
import { OUTSIDE_MIGRATIONS, outsideMigrationStatus } from "./known-migrations";

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
  /** Applied, but the stored checksum differs from its expected value. */
  changed: string[];
  /** Applied outside this code version, with a matching pinned checksum. */
  recognized: string[];
  /** Applied outside this code version and not recognized. Reported, never touched. */
  unknown: string[];
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

/** Pure comparison of the migration files with the database ledger. */
export function compareLedger(
  files: Migration[],
  ledger: LedgerEntry[],
): MigrationStatus {
  const applied = new Map(ledger.map((m) => [m.name, m.hash]));
  const local = files.filter((f) => !OUTSIDE_MIGRATIONS.has(f.name));
  const outside = [...applied]
    .filter(([name]) => !local.some((f) => f.name === name))
    .map(([name, hash]) => ({
      name,
      state: outsideMigrationStatus(name, hash),
    }));
  return {
    pending: local.filter((f) => !applied.has(f.name)).map((f) => f.name),
    changed: [
      ...local
        .filter((f) => applied.has(f.name) && applied.get(f.name) !== f.hash)
        .map((f) => f.name),
      ...outside.filter((m) => m.state === "changed").map((m) => m.name),
    ].sort(),
    recognized: outside
      .filter((m) => m.state === "recognized")
      .map((m) => m.name)
      .sort(),
    unknown: outside
      .filter((m) => m.state === "unknown")
      .map((m) => m.name)
      .sort(),
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
    const ledger = await tx<
      LedgerEntry[]
    >`select name, hash from xgamer_migration`;
    const { changed, pending } = compareLedger(files, ledger);
    if (changed.length)
      throw new Error(
        `Applied migration checksum differs: ${changed.join(", ")}. Verify the ledger before applying migrations.`,
      );
    for (const f of files) {
      if (!pending.includes(f.name)) continue;
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
