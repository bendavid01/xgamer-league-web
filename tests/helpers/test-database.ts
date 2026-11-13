/**
 * Safety rules for the database integration tests. Those tests DROP the `public`
 * schema of the database they are given, so they may only ever touch a disposable
 * server on this machine (a developer's local PostgreSQL or the CI service container).
 *
 * - The URL is parsed, and its host must be exactly localhost, 127.0.0.1 or ::1.
 *   A text match is not enough: `…@ep-x.neon.tech/db?x=@localhost/` would pass one.
 * - `host` / `hostaddr` query parameters are refused, because some drivers let them
 *   redirect the connection elsewhere.
 * - When REQUIRE_DATABASE_TESTS=1 (set in CI), a missing URL is an error rather than a
 *   skip, so CI can never report success without running the database tests.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalTestDatabase(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
    LOCAL_HOSTS.has(url.hostname) &&
    url.pathname.length > 1 &&
    !url.searchParams.has("host") &&
    !url.searchParams.has("hostaddr")
  );
}

/**
 * Returns the disposable test database URL, or undefined when the database tests
 * should be skipped (local runs without a database). Throws on anything unsafe.
 */
export function testDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const url = env.TEST_DATABASE_URL?.trim();
  if (!url) {
    if (env.REQUIRE_DATABASE_TESTS === "1")
      throw new Error(
        "REQUIRE_DATABASE_TESTS=1 but TEST_DATABASE_URL is not set: the database integration tests must run here.",
      );
    return undefined;
  }
  if (!isLocalTestDatabase(url))
    throw new Error(
      "TEST_DATABASE_URL must point at a local disposable database (host localhost, 127.0.0.1 or ::1).",
    );
  return url;
}
