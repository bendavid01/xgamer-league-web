import { test } from "node:test";
import assert from "node:assert/strict";
import {
  roundRobin,
  knockout,
  advanceKnockout,
  standings,
  leagueKnockout,
} from "../src/lib/tournament";
const entrants = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: String(i), name: `Player ${i}` }));
for (const n of [2, 3, 4, 5, 8, 17, 64])
  test(`round robin ${n}: every pair once, no round conflicts`, () => {
    const fixtures = roundRobin(entrants(n));
    assert.equal(fixtures.length, (n * (n - 1)) / 2);
    assert.equal(
      new Set(fixtures.map((f) => [f.home, f.away].sort().join("|"))).size,
      fixtures.length,
    );
    for (const round of new Set(fixtures.map((f) => f.round))) {
      const ids = fixtures
        .filter((f) => f.round === round)
        .flatMap((f) => [f.home, f.away]);
      assert.equal(new Set(ids).size, ids.length);
    }
  });
test("knockout byes and advancement preserve all entrants", () => {
  let fixtures = knockout(entrants(5));
  assert.equal(
    new Set(fixtures.flatMap((f) => [f.home, f.away]).filter(Boolean)).size,
    5,
  );
  assert.equal(fixtures.filter((f) => !f.home || !f.away).length, 3);
  assert.throws(() => advanceKnockout(fixtures, {}));
  fixtures = advanceKnockout(
    fixtures,
    Object.fromEntries(fixtures.map((f) => [f.id, f.home ?? f.away!])),
  );
  assert.equal(fixtures.length, 2);
  assert.throws(() =>
    advanceKnockout(fixtures, { [fixtures[0].id]: "intruder" }),
  );
});
test("standings count draws, losses and goal difference", () => {
  const rows = standings(entrants(3), [
    { home: "0", away: "1", homeScore: 2, awayScore: 0 },
    { home: "1", away: "2", homeScore: 1, awayScore: 1 },
  ]);
  assert.equal(rows[0].pts, 3);
  assert.equal(rows[0].gd, 2);
  assert.equal(rows.find((r) => r.id === "1")?.lost, 1);
  assert.throws(() =>
    standings(entrants(2), [
      { home: "0", away: "1", homeScore: -1, awayScore: 0 },
    ]),
  );
});
test("league qualification rejects incomplete, duplicate and tied results", () => {
  assert.throws(() => leagueKnockout(entrants(4), [], 2));
  const results = roundRobin(entrants(4)).map((f) => ({
    home: f.home!,
    away: f.away!,
    homeScore: 0,
    awayScore: 0,
  }));
  assert.throws(() => leagueKnockout(entrants(4), results, 2), /tie/);
  results[0] = { ...results[1] };
  assert.throws(() => leagueKnockout(entrants(4), results, 2), /once/);
});
test("invalid participant counts and IDs rejected", () => {
  assert.throws(() => roundRobin([]));
  assert.throws(() => knockout([entrants(2)[0], entrants(2)[0]]));
});

test("league phase qualifies the ranked field after every fixture is confirmed", () => {
  const field = entrants(4);
  const results = roundRobin(field).map((f) => ({
    home: f.home!,
    away: f.away!,
    homeScore: Number(f.home) < Number(f.away) ? 1 : 0,
    awayScore: Number(f.home) < Number(f.away) ? 0 : 1,
  }));
  const bracket = leagueKnockout(field, results, 2);
  assert.equal(bracket.length, 1);
  assert.deepEqual(
    new Set([bracket[0].home, bracket[0].away]),
    new Set(["0", "1"]),
  );
});
