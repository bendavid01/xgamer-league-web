import { test } from "node:test";
import assert from "node:assert/strict";
import { registrationConfigured } from "../src/lib/configuration";
const configured = {
  REGISTRATION_ENABLED: "true",
  DATABASE_URL: "postgres://test.invalid/db",
  PRIVATE_DATA_KEY: "a".repeat(64),
  APP_ORIGIN: "https://preview.example.test",
};
test("registration readiness requires explicit enablement, encryption and matching-origin configuration", () => {
  assert.equal(registrationConfigured(configured), true);
  for (const key of Object.keys(configured))
    assert.equal(
      registrationConfigured({ ...configured, [key]: "" }),
      false,
      key,
    );
  assert.equal(
    registrationConfigured({ ...configured, PRIVATE_DATA_KEY: "invalid" }),
    false,
  );
  assert.equal(
    registrationConfigured({
      ...configured,
      APP_ORIGIN: "https://preview.example.test/register",
    }),
    false,
  );
  assert.equal(
    registrationConfigured({ ...configured, REGISTRATION_ENABLED: "false" }),
    false,
  );
});
