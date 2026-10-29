/**
 * Runs during `npm run build` (Vercel). Applies pending database migrations using the
 * DATABASE_URL Vercel already holds, so nobody has to copy the database password anywhere.
 * Without DATABASE_URL (local builds, CI) it does nothing. A failed migration fails the
 * build, so code never goes live against an out-of-date schema.
 */
if (!process.env.DATABASE_URL) {
  console.log("[migrate] DATABASE_URL not set — skipping database migrations.");
} else {
  await import("./migrate.mts");
}
