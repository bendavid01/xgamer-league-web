import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { encodeSignatureHeader } from "@sanity/webhook";
// Isolated process test values, never deployment credentials.
process.env.AUDIT_WEBHOOK_SECRET = "test-only-webhook-secret";
delete process.env.SANITY_API_WRITE_TOKEN;
const audit = import("../src/app/api/webhooks/audit/route");
const req = (body: string, headers: Record<string, string> = {}) =>
  new NextRequest("https://example.test/api/webhooks/audit", {
    method: "POST",
    body,
    headers,
  });
test("audit rejects unauthenticated requests before parsing", async () => {
  const { POST } = await audit;
  assert.equal((await POST(req("{broken"))).status, 401);
});
test("audit rejects forged signatures", async () => {
  const { POST } = await audit;
  assert.equal(
    (
      await POST(
        req("{}", {
          authorization: "Bearer test-only-webhook-secret",
          "sanity-webhook-signature": "forged",
        }),
      )
    ).status,
    401,
  );
});
test("audit bounds authenticated body size", async () => {
  const { POST } = await audit;
  assert.equal(
    (
      await POST(
        req("x".repeat(65537), {
          authorization: "Bearer test-only-webhook-secret",
        }),
      )
    ).status,
    413,
  );
});
test("audit rejects signed malformed JSON and primitive payloads", async () => {
  const { POST } = await audit;
  for (const body of ["{broken", "null", "[]", "42"]) {
    const signature = await encodeSignatureHeader(
      body,
      Date.now(),
      "test-only-webhook-secret",
    );
    assert.equal(
      (
        await POST(
          req(body, {
            authorization: "Bearer test-only-webhook-secret",
            "sanity-webhook-signature": signature,
          }),
        )
      ).status,
      400,
    );
  }
});
test("audit ignores drafts and unrelated documents without writing", async () => {
  const { POST } = await audit;
  for (const value of [
    { _type: "team", _id: "drafts.t1" },
    { _type: "unrelated", _id: "t1" },
  ]) {
    const body = JSON.stringify(value);
    const signature = await encodeSignatureHeader(
      body,
      Date.now(),
      "test-only-webhook-secret",
    );
    const res = await POST(
      req(body, {
        authorization: "Bearer test-only-webhook-secret",
        "sanity-webhook-signature": signature,
      }),
    );
    assert.equal(res.status, 200);
  }
});
test("audit fails closed without write credentials", async () => {
  const { POST } = await audit;
  const body = JSON.stringify({
    operation: "create",
    current: { _type: "team", _id: "t1", name: "Test" },
  });
  const signature = await encodeSignatureHeader(
    body,
    Date.now(),
    "test-only-webhook-secret",
  );
  assert.equal(
    (
      await POST(
        req(body, {
          authorization: "Bearer test-only-webhook-secret",
          "sanity-webhook-signature": signature,
        }),
      )
    ).status,
    503,
  );
});
test("registration does not accept or persist PII before setup", async () => {
  const { POST } = await import("../src/app/api/registrations/route");
  const res = await POST(
    new Request("https://example.test/api/registrations", { method: "POST" }),
  );
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("cache-control"), "no-store");
});
test("admin endpoints expose no controls without configured authorization", async () => {
  const { GET, POST } = await import("../src/app/api/admin/route");
  assert.equal(
    (await GET(new Request("https://example.test/api/admin"))).status,
    403,
  );
  assert.equal(
    (
      await POST(
        new Request("https://example.test/api/admin", { method: "POST" }),
      )
    ).status,
    403,
  );
});

test("audit rejects malformed nested documents without crashing", async () => {
  const { POST } = await audit;
  for (const current of [{ _type: "team", _id: 123 }, [], false]) {
    const body = JSON.stringify({ operation: "create", current });
    const signature = await encodeSignatureHeader(
      body,
      Date.now(),
      "test-only-webhook-secret",
    );
    assert.equal(
      (
        await POST(
          req(body, {
            authorization: "Bearer test-only-webhook-secret",
            "sanity-webhook-signature": signature,
          }),
        )
      ).status,
      400,
    );
  }
});
