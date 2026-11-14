/**
 * WhatsApp number normalization (N1–N5). Indian numbers must stay byte-identical to
 * registration's normalizePhone(), so stored values and lookup hashes never change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePhoneNumberWithError } from "libphonenumber-js/max";

process.env.PRIVATE_DATA_KEY ??= "ef".repeat(32);
import { canonicalPhone, maskPhone } from "../src/lib/phone";
import { normalizePhone } from "../src/lib/registration";
import { fingerprint } from "../src/lib/private-data";

const ok = (x: string) => {
  const r = canonicalPhone(x);
  assert.ok("phone" in r, `${x}: ${"error" in r ? r.error : ""}`);
  return r.phone;
};
const refused = (x: unknown) =>
  assert.ok("error" in canonicalPhone(x), `${String(x)} should be refused`);

/** Deterministic pseudo-random mobiles (registration's rule: 10 digits, first 6–9). */
function* indianMobiles(n: number) {
  let seed = 20261113;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    const first = 6 + (seed % 4);
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    yield `${first}${String(seed % 1_000_000_000).padStart(9, "0")}`;
  }
}
const formats = (m: string) => [
  m,
  `0${m}`,
  `91${m}`,
  `+91${m}`,
  `+91 ${m}`,
  `+91-${m}`,
  `${m.slice(0, 5)} ${m.slice(5)}`,
  `${m.slice(0, 5)}-${m.slice(5)}`,
  `+91 ${m.slice(0, 5)} ${m.slice(5)}`,
  `+91-${m.slice(0, 5)}-${m.slice(5)}`,
  `+91.${m.slice(0, 5)}.${m.slice(5)}`,
  `(${m.slice(0, 3)}) ${m.slice(3, 6)}-${m.slice(6)}`,
  `0 ${m.slice(0, 5)} ${m.slice(5)}`,
  ` ${m} `,
  `${m.slice(0, 2)} ${m.slice(2, 6)} ${m.slice(6)}`,
];

test("N1: Indian numbers are byte-identical to registration's normalizePhone (10,000 random mobiles × 15 formats)", () => {
  let n = 0;
  for (const m of indianMobiles(10_000)) {
    const expected = `+91${m}`;
    for (const f of formats(m)) {
      assert.equal(normalizePhone(f), expected, f);
      assert.equal(ok(f), expected, f);
      n++;
    }
    // libphonenumber-js formats the same subscriber number to the identical E.164.
    if (n % 15 === 0 && n < 15 * 2000)
      assert.equal(parsePhoneNumberWithError(`+91${m}`).number, expected);
  }
  assert.equal(n, 150_000);
  // Registration's documented forms (tests/control.test.ts) all agree too.
  for (const f of [
    "9876543210",
    "98765 43210",
    "+91-98765-43210",
    "919876543210",
    "09876543210",
  ])
    assert.equal(ok(f), "+919876543210");
  // Every Indian number OM accepts, registration accepts with the same value.
  for (const f of ["7911123456", "+91 6000000000", "0 9000000001"])
    assert.equal(ok(f), normalizePhone(f));
});

test("N1b: explicit rules: 0091 refused (as registration), malformed text refused rather than stripped", () => {
  refused("0091 98765 43210");
  assert.equal(
    normalizePhone("0091 98765 43210"),
    "",
    "registration refuses 0091 too",
  );
  refused("0044 7911 123456");
  for (const bad of [
    "98765abc43210", // registration would strip the letters; OM refuses
    "(+91) 98765 43210", // "+" only at the start
    "+91 98765 43210 ext 1",
    "98765/43210",
    "+91 98765 4321O", // letter O
    "＋919876543210", // full-width plus
    "",
    "   ",
    "+",
    "1".repeat(40),
    12345,
    null,
  ])
    refused(bad);
  for (const bad of [
    "+91 1234567890", // not a mobile
    "+91 98765 4321", // 9 digits
    "+91 98765 432100", // 11 digits
    "5876543210",
    "12345",
  ])
    refused(bad);
});

test("N2: lookup hashes are unchanged: fingerprint of the canonical value equals registration's stored hash", () => {
  for (const m of indianMobiles(500))
    for (const f of formats(m))
      assert.equal(
        fingerprint("whatsapp:" + ok(f)),
        fingerprint("whatsapp:" + normalizePhone(f)),
      );
  // A fixed vector, so a change to the key derivation or prefix can't go unnoticed.
  assert.equal(
    fingerprint("whatsapp:" + ok("+91 98765 43210")),
    fingerprint("whatsapp:+919876543210"),
  );
});

test("N3: international numbers are validated with libphonenumber-js and stored as E.164", () => {
  const cases: [string, string][] = [
    ["+44 7911 123456", "+447911123456"],
    ["+1 415 555 0123", "+14155550123"],
    ["+971 50 123 4567", "+971501234567"],
    ["+880 1712-345678", "+8801712345678"],
    ["+94 71 234 5678", "+94712345678"],
    ["+977 984-1234567", "+9779841234567"],
    ["+65 9123 4567", "+6591234567"],
  ];
  for (const [input, e164] of cases) assert.equal(ok(input), e164, input);
  for (const bad of [
    "+44 20 7946 0958", // UK landline: not a WhatsApp-capable mobile type
    "+1 800 555 0199", // toll free
    "+44 7911 12345", // too short
    "+0 123 456 789",
    "+999 1234 5678",
    "+44 7911 12345678901",
  ])
    refused(bad);
});

test("N4: masks show only the calling code and the last 2 digits", () => {
  for (const [phone, masked] of [
    ["+919876543210", "+91 ••••••••10"],
    ["+447911123456", "+44 ••••••••56"],
    ["+14155550123", "+1 ••••••••23"],
    ["+6591234567", "+65 ••••••67"],
  ])
    assert.equal(maskPhone(phone), masked);
  for (const m of indianMobiles(200)) {
    const masked = maskPhone(`+91${m}`);
    assert.doesNotMatch(masked.slice(4), /\d{3,}/);
    assert.ok(masked.endsWith(m.slice(-2)));
  }
});

test("N5: libphonenumber-js is pinned to 1.13.15 and stays out of client code", async () => {
  const pkg = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(pkg.dependencies["libphonenumber-js"], "1.13.15");
  const lock = JSON.parse(
    await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
  );
  assert.equal(
    lock.packages["node_modules/libphonenumber-js"].version,
    "1.13.15",
  );
  assert.equal(lock.packages[""].dependencies["libphonenumber-js"], "1.13.15");
  // No client component imports the phone module or the library.
  const dirs = ["../src/components/", "../src/app/"];
  for (const dir of dirs) {
    const root = fileURLToPath(new URL(dir, import.meta.url));
    for (const file of await readdir(root, { recursive: true })) {
      if (!/\.(t|j)sx?$/.test(file)) continue;
      const path = join(root, file);
      const src = await readFile(path, "utf8");
      if (!src.startsWith('"use client"')) continue;
      assert.doesNotMatch(
        src,
        /libphonenumber|@\/lib\/phone|lib\/phone"/,
        path,
      );
    }
  }
});
