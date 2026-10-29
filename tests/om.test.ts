import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advanceKnockout,
  firstFixtures,
  qualifyTopN,
  roundRobin,
} from "../src/lib/tournament";
import { shuffled } from "../src/lib/control";
import { pickLive, uploadsPlaylist } from "../src/lib/youtube";

const field = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));

test("any field size works for every format", () => {
  for (const n of [2, 3, 5, 7, 12, 16, 23]) {
    const league = firstFixtures("league", field(n), null);
    assert.equal(league.stage, "league");
    assert.equal(league.fixtures.length, (n * (n - 1)) / 2);
    const ko = firstFixtures("knockout", field(n), null);
    assert.equal(ko.stage, "knockout");
    const size = 2 ** Math.ceil(Math.log2(n));
    assert.equal(ko.fixtures.length, size / 2);
    const byes = ko.fixtures.filter((f) => !f.home || !f.away).length;
    assert.equal(byes, size - n);
    // Every player appears exactly once in round one.
    const seen = ko.fixtures.flatMap((f) => [f.home, f.away]).filter(Boolean);
    assert.equal(new Set(seen).size, n);
  }
});

test("league matches per player limits the schedule when the field is even", () => {
  const plan = firstFixtures("league_knockout", field(10), 4);
  assert.equal(plan.fixtures.length, 20);
  assert.throws(() => firstFixtures("league", field(9), 4));
});

test("byes advance automatically and the bracket finishes with one champion", () => {
  let round = firstFixtures("knockout", field(5), null).fixtures;
  let rounds = 0;
  while (round.length) {
    const winners = Object.fromEntries(
      round.filter((f) => f.home && f.away).map((f) => [f.id, f.home!]),
    );
    const next = advanceKnockout(round, winners);
    rounds++;
    if (!next.length) break;
    round = next;
  }
  assert.equal(rounds, 3);
});

test("Top N qualification works for 4, 8 or 16 and blocks unresolved ties", () => {
  const players = field(10);
  const results = roundRobin(players).map((f) => {
    const h = Number(f.home!.slice(1)),
      a = Number(f.away!.slice(1));
    return {
      home: f.home!,
      away: f.away!,
      homeScore: h < a ? 2 : 0,
      awayScore: h < a ? 0 : 2,
    };
  });
  assert.deepEqual(
    qualifyTopN(players, results, 4).map((p) => p.id),
    ["p0", "p1", "p2", "p3"],
  );
  const level = roundRobin(players).map((f) => ({
    home: f.home!,
    away: f.away!,
    homeScore: 1,
    awayScore: 1,
  }));
  assert.throws(() => qualifyTopN(players, level, 4), /Tie/);
  const winners = ["p3", "p5", "p7", "p9"];
  assert.deepEqual(
    qualifyTopN(players, level, 4, winners).map((p) => p.id),
    winners,
  );
  assert.throws(() => qualifyTopN(players, results, 16), /fewer/);
});

test("random draw keeps every player exactly once", () => {
  const players = field(32);
  const draw = shuffled(players);
  assert.equal(draw.length, 32);
  assert.deepEqual(
    [...draw].sort((a, b) => a.id.localeCompare(b.id)),
    [...players].sort((a, b) => a.id.localeCompare(b.id)),
  );
});

test("live detection only reports a stream that is live right now", () => {
  assert.equal(
    uploadsPlaylist("UCabcdefghijklmnopqrstuv"),
    "UUabcdefghijklmnopqrstuv",
  );
  assert.equal(uploadsPlaylist("not-a-channel"), null);
  const ended = {
    id: "aaaaaaaaaaa",
    snippet: { liveBroadcastContent: "none", title: "Old" },
    liveStreamingDetails: { actualStartTime: "x", actualEndTime: "y" },
  };
  const upcoming = {
    id: "bbbbbbbbbbb",
    snippet: { liveBroadcastContent: "upcoming", title: "Soon" },
    liveStreamingDetails: {},
  };
  const live = {
    id: "ccccccccccc",
    snippet: { liveBroadcastContent: "live", title: "  XGamer Final  " },
    liveStreamingDetails: { actualStartTime: "2026-10-29T15:00:00Z" },
  };
  assert.equal(pickLive([ended, upcoming]), null);
  const found = pickLive([ended, live])!;
  assert.equal(found.title, "XGamer Final");
  assert.equal(found.url, "https://www.youtube.com/watch?v=ccccccccccc");
  assert.equal(pickLive([{ ...live, id: "bad id<script>" }]), null);
});
