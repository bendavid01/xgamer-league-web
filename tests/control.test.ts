import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leaguePhase,
  qualifyLeaguePhase,
  standings,
} from "../src/lib/tournament";
import {
  adminIds,
  allowed,
  type Actor,
  type Operation,
} from "../src/lib/access";
import { encrypt, decrypt, fingerprint } from "../src/lib/private-data";
import { registrationInput } from "../src/lib/registration";
const entrants = Array.from({ length: 64 }, (_, i) => ({
  id: String(i),
  name: `Player ${i}`,
}));
test("64 players receive four distinct opponents, 128 games and no double booking", () => {
  const fixtures = leaguePhase(entrants);
  assert.equal(fixtures.length, 128);
  const pairs = new Set<string>();
  for (const p of entrants) {
    const games = fixtures.filter((f) => f.home === p.id || f.away === p.id);
    assert.equal(games.length, 4);
    assert.equal(new Set(games.map((f) => f.round)).size, 4);
    assert.equal(
      new Set(games.map((f) => (f.home === p.id ? f.away : f.home))).size,
      4,
    );
  }
  for (const f of fixtures) {
    const key = [f.home, f.away].sort().join("|");
    assert(!pairs.has(key));
    pairs.add(key);
  }
  assert.equal(leaguePhase(entrants, 6).length, 192);
  assert.throws(() => leaguePhase(entrants, 64));
});
test("qualification blocks missing games, duplicates and unresolved cutoff ties", () => {
  const results = leaguePhase(entrants).map((f) => ({
    home: f.home!,
    away: f.away!,
    homeScore: 0,
    awayScore: 0,
  }));
  assert.throws(
    () => qualifyLeaguePhase(entrants, results.slice(1)),
    /Complete/,
  );
  assert.throws(
    () => qualifyLeaguePhase(entrants, [...results.slice(1), results[1]]),
    /Complete/,
  );
  assert.throws(() => qualifyLeaguePhase(entrants, results), /tie/);
});
test("score correction recomputes unified standings without accumulating stale points", () => {
  const f = leaguePhase(entrants)[0];
  const result = { home: f.home!, away: f.away!, homeScore: 3, awayScore: 0 };
  const first = standings(entrants, [result]);
  const changed = standings(entrants, [
    { ...result, homeScore: 0, awayScore: 2 },
  ]);
  assert.equal(first.find((p) => p.id === f.home)?.pts, 3);
  assert.equal(changed.find((p) => p.id === f.home)?.pts, 0);
  assert.equal(changed.find((p) => p.id === f.away)?.pts, 3);
});
test("exactly two distinct numeric admin identities; both receive identical access", () => {
  assert.deepEqual(adminIds("123,456"), []);
  assert.deepEqual(adminIds("12345678901234567,12345678901234567"), []);
  const ids = adminIds("12345678901234567,12345678901234568");
  assert.equal(ids.length, 2);
  for (const id of ids)
    for (const op of ["delete", "roles", "audit", "tournaments"] as Operation[])
      assert(
        allowed(
          { id, role: "admin", operations: [], tournaments: [] },
          op,
          "cup",
        ),
      );
});
test("coordinators cannot delete or manage roles even with forged operation assignments", () => {
  const user: Actor = {
    id: "c",
    role: "coordinator",
    operations: [
      "registrations",
      "results",
      "delete",
      "roles",
      "audit",
      "finals",
      "tournaments",
    ],
    tournaments: ["cup"],
  };
  for (const op of [
    "delete",
    "roles",
    "audit",
    "finals",
    "tournaments",
  ] as Operation[])
    assert(!allowed(user, op, "cup"));
  assert(allowed(user, "results", "cup"));
  assert(!allowed(user, "results", "another-cup"));
});
test("contact ciphertext authenticates contents and uses random nonces", () => {
  process.env.PRIVATE_DATA_KEY = "12".repeat(32);
  const a = encrypt("+919876543210");
  assert.equal(decrypt(a), "+919876543210");
  assert.notEqual(a, encrypt("+919876543210"));
  const bytes = Buffer.from(a, "base64");
  bytes[30] ^= 1;
  assert.throws(() => decrypt(bytes.toString("base64")));
  assert.equal(fingerprint("abc"), fingerprint("abc"));
  assert.notEqual(fingerprint("abc"), fingerprint("def"));
});
test("registration requires explicit consent and validates normalized contact", () => {
  const input = {
    gamingName: "Player One",
    efootballId: "abcd1234",
    preference: "whatsapp",
    contact: "+919876543210",
    consent: true,
    website: "",
    tournament: "xgamer-2026-10",
  };
  assert(registrationInput.safeParse(input).success);
  for (const invalid of [
    { consent: false },
    { website: "spam" },
    { contact: "9876543210" },
    { gamingName: "<script>" },
  ])
    assert(!registrationInput.safeParse({ ...input, ...invalid }).success);
  assert.equal(registrationInput.parse(input).efootballId, "ABCD1234");
});
