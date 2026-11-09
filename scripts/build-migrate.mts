/**
 * Runs during `npm run build` (Vercel). Applies pending database migrations using the
 * DATABASE_URL Vercel already holds, so nobody has to copy the database password anywhere.
 * Without DATABASE_URL (local builds, CI) it does nothing. A failed migration fails the
 * build, so code never goes live against an out-of-date schema.
 */
const onVercel = !!process.env.VERCEL;
const env = process.env.VERCEL_ENV;
if (!process.env.DATABASE_URL) {
  console.log("[migrate] DATABASE_URL not set — skipping database migrations.");
} else if (
  onVercel &&
  env !== "production" &&
  process.env.MIGRATE_ON_BUILD !== "true"
) {
  // WHY: Vercel Preview builds share the production DATABASE_URL in this project.
  // Only production builds may change the schema; a preview with its own isolated
  // database can opt in with MIGRATE_ON_BUILD=true.
  console.log(
    `[migrate] ${env ?? "non-production"} build — skipping database migrations.`,
  );
} else {
  await import("./migrate.mts");
}
