import { test } from "node:test";
import assert from "node:assert/strict";
import { participantStatus, tournamentRecords } from "../src/lib/champions";
import { codeNumber, playerCode } from "../src/lib/codes";

const P = (id: string, n: number) => ({
  id,
  code: playerCode(n),
  name: id.toUpperCase(),
  team: `${id} FC`,
});
const players = [P("a", 1), P("b", 2), P("c", 3), P("d", 4)];
let k = 0;
const F = (
  round: number,
  home: string,
  away: string,
  hs: number | null,
  as: number | null,
) => ({
  id: `f${k++}`,
  round,
  slot: 0,
  home,
  away,
  home_score: hs,
  away_score: as,
});

test("permanent IDs: XG- prefix, grows past four digits, never parses out of range", () => {
  assert.equal(playerCode(7), "XG-0007");
  assert.equal(playerCode(10000), "XG-10000");
  assert.equal(playerCode(100000), "XG-100000");
  assert.equal(codeNumber("XG-0007"), 7);
  assert.equal(codeNumber("xg-100000"), 100000);
  assert.equal(codeNumber("XG-2147483647"), 2147483647);
  assert.equal(codeNumber("XG-2147483648"), null);
  assert.equal(codeNumber("XG-12345678901"), null);
});

test("records: top scorer, streak, biggest victory, ties and unplayed fixtures", () => {
  const fixtures = [
    F(1, "a", "b", 3, 0),
    F(1, "c", "d", 1, 1),
    F(2, "a", "c", 2, 0),
    F(2, "b", "d", 5, 2),
    F(3, "d", "a", 1, 0),
    F(3, "b", "c", 0, 3),
    F(4, "a", "d", null, null), // not played: never counted
  ];
  const r = tournamentRecords(players, fixtures);
  assert.equal(r.matches, 6);
  assert.deepEqual(r.lines.a, {
    played: 3,
    won: 2,
    drawn: 0,
    lost: 1,
    gf: 5,
    ga: 1,
    gd: 4,
    bestStreak: 2,
  });
  assert.deepEqual(
    r.topScorer,
    { value: 5, players: [players[0], players[1]] },
    "a and b tie on 5",
  );
  assert.deepEqual(
    r.longestStreak?.players.map((p) => p.id),
    ["a"],
  );
  assert.equal(r.longestStreak?.value, 2);
  // a 3-0 b, b 5-2 d (3), b 0-3 c: margin 3 shared by three matches
  assert.equal(r.biggestVictory.length, 3);
  assert(r.biggestVictory.every((v) => v.winnerGoals - v.loserGoals === 3));
  assert.deepEqual(
    r.mostDraws?.players.map((p) => p.id),
    ["c", "d"],
  );
  assert.equal(r.highestGoalDifference?.value, 4);
});

test("best defence: needs 3+ matches and half of the most active player's, exact ties", () => {
  const few = tournamentRecords(players, [
    F(1, "a", "b", 1, 0),
    F(2, "a", "c", 1, 0),
  ]);
  assert.equal(few.bestDefence, null, "nobody has 3 matches yet");
  assert.equal(few.defenceMin, 3);
  const fixtures = [
    ...[1, 2, 3, 4, 5, 6].map((r) => F(r, "a", "b", 1, 1)), // a,b: 6 matches, 1 per match
    F(7, "c", "d", 0, 0), // c,d: 1 match, 0 conceded — too few to qualify
    F(8, "c", "d", 0, 0),
  ];
  const r = tournamentRecords(players, fixtures);
  assert.equal(r.defenceMin, 3);
  assert.deepEqual(
    r.bestDefence?.players.map((p) => p.id),
    ["a", "b"],
  );
  assert.equal(r.bestDefence?.perMatch, 1);
});

test("records recalculate after a corrected score; no results gives empty records", () => {
  const before = tournamentRecords(players, [F(1, "a", "b", 9, 0)]);
  const after = tournamentRecords(players, [F(1, "a", "b", 1, 0)]);
  assert.equal(before.topScorer?.value, 9);
  assert.equal(after.topScorer?.value, 1);
  const none = tournamentRecords(players, []);
  assert.equal(none.matches, 0);
  assert.equal(none.topScorer, null);
  assert.equal(none.longestStreak, null);
  assert.deepEqual(none.biggestVictory, []);
});

test("statuses only from recorded facts; podium only when finished", () => {
  const league = { status: "league", format: "league", knockout: true };
  const done = { status: "completed", format: "league", knockout: true };
  assert.equal(participantStatus(league, "a", new Set(), []), "Participating");
  assert.equal(participantStatus(league, "a", new Set(["a"]), []), "Qualified");
  assert.equal(
    participantStatus(league, "b", new Set(["a"]), []),
    "Not qualified",
  );
  assert.equal(
    participantStatus(done, "a", new Set(["a"]), ["a", "b", null]),
    "Champion",
  );
  assert.equal(
    participantStatus(done, "b", new Set(["a"]), ["a", "b", null]),
    "Runner-up",
  );
  assert.equal(
    participantStatus(
      { status: "open", format: "league", knockout: false },
      "a",
      new Set(),
      [],
    ),
    "Registered",
  );
});
