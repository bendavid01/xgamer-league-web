import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLeague, qualifyTopN, roundRobin } from "../src/lib/tournament";
import { shuffled } from "../src/lib/control";
import { pickLive, uploadsPlaylist } from "../src/lib/youtube";

const field = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));

function check(n: number, legs: 1 | 2, perPlayer: number | null) {
  const players = field(n);
  const fixtures = buildLeague(players, legs, perPlayer);
  const per = perPlayer ?? n - 1;
  const label = `n=${n} legs=${legs} per=${perPlayer}`;
  assert.equal(fixtures.length, (n * per * legs) / 2, `${label}: match count`);
  const rounds = new Map<number, string[]>();
  const pairs = new Map<string, number>();
  const ordered = new Set<string>();
  const games = new Map<string, number>(),
    homes = new Map<string, number>();
  for (const f of fixtures) {
    assert(f.home && f.away && f.home !== f.away, `${label}: valid match`);
    const busy = rounds.get(f.round) ?? [];
    assert(
      !busy.includes(f.home) && !busy.includes(f.away),
      `${label}: double booking in round ${f.round}`,
    );
    rounds.set(f.round, [...busy, f.home, f.away]);
    const key = [f.home, f.away].sort().join("|");
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
    assert(
      !ordered.has(`${f.home}>${f.away}`),
      `${label}: same home/away twice`,
    );
    ordered.add(`${f.home}>${f.away}`);
    for (const p of [f.home, f.away]) games.set(p, (games.get(p) ?? 0) + 1);
    homes.set(f.home, (homes.get(f.home) ?? 0) + 1);
  }
  for (const count of pairs.values())
    assert.equal(count, legs, `${label}: each pair meets ${legs}x`);
  for (const p of players) {
    assert.equal(games.get(p.id), per * legs, `${label}: games for ${p.id}`);
    const h = homes.get(p.id) ?? 0,
      a = per * legs - h;
    if (legs === 2) assert.equal(h, a, `${label}: home & away must be equal`);
    else assert(Math.abs(h - a) <= 1, `${label}: home/away balance ${h}/${a}`);
  }
  // The same pair never meets in consecutive rounds (unavoidable only when a leg is a single round).
  if (legs === 2 && rounds.size > 2) {
    const sorted = [...rounds.keys()].sort((x, y) => x - y);
    for (let i = 1; i < sorted.length; i++) {
      const prev = fixtures
        .filter((f) => f.round === sorted[i - 1])
        .map((f) => [f.home, f.away].sort().join("|"));
      const cur = fixtures
        .filter((f) => f.round === sorted[i])
        .map((f) => [f.home, f.away].sort().join("|"));
      assert(
        !cur.some((k) => prev.includes(k)),
        `${label}: back-to-back rematch`,
      );
    }
  }
  return fixtures;
}

test("league builder: every field size 2–64, single and home & away", () => {
  for (let n = 2; n <= 64; n++)
    for (const legs of [1, 2] as const) check(n, legs, null);
});

test("league builder: matches-per-player limits give equal games and no repeats", () => {
  for (let n = 3; n <= 40; n++)
    for (let k = 1; k < n; k++) {
      if ((n * k) % 2) {
        assert.throws(() => buildLeague(field(n), 1, k), /even/);
        continue;
      }
      for (const legs of [1, 2] as const) check(n, legs, k);
    }
  assert.throws(() => buildLeague(field(6), 1, 6), /fewer/);
});

test("odd fields: everyone rests exactly once per round-robin leg", () => {
  for (const n of [3, 5, 9, 15, 31]) {
    const fixtures = buildLeague(field(n));
    const rounds = Math.max(...fixtures.map((f) => f.round));
    assert.equal(rounds, n);
    for (const p of field(n)) {
      const played = new Set(
        fixtures
          .filter((f) => f.home === p.id || f.away === p.id)
          .map((f) => f.round),
      );
      assert.equal(rounds - played.size, 1, `n=${n}: ${p.id} rests once`);
    }
  }
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
