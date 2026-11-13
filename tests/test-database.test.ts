import { test } from "node:test";
import assert from "node:assert/strict";
import { isLocalTestDatabase, testDatabaseUrl } from "./helpers/test-database";

test("integration tests accept only a disposable database on this machine", () => {
  for (const ok of [
    "postgres://postgres@127.0.0.1:55432/postgres",
    "postgres://postgres:postgres@localhost:5432/xgamer_ci",
    "postgresql://postgres@localhost/xgamer_ci",
    "postgres://postgres@[::1]:5432/xgamer_ci",
  ])
    assert.equal(isLocalTestDatabase(ok), true, ok);

  for (const bad of [
    // A text match on "@localhost/" would have accepted these two.
    "postgres://u:p@ep-x-123.ap-southeast-1.aws.neon.tech/neondb?x=@localhost/",
    "postgres://u:p@ep-x.neon.tech/neondb#@127.0.0.1/",
    "postgres://u:p@localhost:5432/db?host=ep-x.neon.tech",
    "postgres://u:p@localhost:5432/db?hostaddr=10.0.0.1",
    "postgres://u:p@ep-x.neon.tech/neondb",
    "postgres://u:p@localhost.evil.example/db",
    "postgres://u:p@127.0.0.1.nip.io/db",
    "postgres://u:p@localhost:5432/",
    "mysql://root@localhost/db",
    "not a url",
  ])
    assert.equal(isLocalTestDatabase(bad), false, bad);
});

test("CI cannot silently skip the database tests", () => {
  assert.equal(testDatabaseUrl({}), undefined);
  assert.throws(
    () => testDatabaseUrl({ REQUIRE_DATABASE_TESTS: "1" }),
    /REQUIRE_DATABASE_TESTS=1/,
  );
  assert.throws(
    () =>
      testDatabaseUrl({
        TEST_DATABASE_URL: "postgres://u:p@ep-x.neon.tech/neondb?x=@localhost/",
      }),
    /local disposable database/,
  );
  assert.equal(
    testDatabaseUrl({
      REQUIRE_DATABASE_TESTS: "1",
      TEST_DATABASE_URL:
        "postgres://postgres:postgres@localhost:5432/xgamer_ci",
    }),
    "postgres://postgres:postgres@localhost:5432/xgamer_ci",
  );
});
