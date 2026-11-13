import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, currentChampions, RANKING_POINTS } from "../src/lib/records";

const T = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  competition: null,
  season: null,
  status: "completed",
  photo: null,
  ...extra,
});
const E = (t: string, id: string, no: number) => ({
  tournament_id: t,
  id,
  no,
  name: id.toUpperCase(),
  team: null,
});
let slot = 0;
const F = (
  t: string,
  round: number,
  home: string,
  away: string,
  hs: number,
  as: number,
) => ({
  tournament_id: t,
  round,
  slot: slot++,
  home,
  away,
  home_score: hs,
  away_score: as,
});

test("records: totals, streaks, clean sheets, ranking points and match records come only from real results", () => {
  const tournaments = [
    T("s1", { competition: "Pro League", season: 1 }),
    T("s2", { competition: "Pro League", season: 2, status: "league" }),
    T("cup"),
  ];
  const entries = [
    E("s1", "a", 1),
    E("s1", "b", 2),
    E("s1", "c", 3),
    E("s2", "a", 1),
    E("s2", "b", 2),
    E("cup", "c", 3),
    E("cup", "b", 2),
  ];
  const fixtures = [
    F("s1", 1, "a", "b", 3, 0),
    F("s1", 2, "a", "c", 2, 2),
    F("s1", 3, "b", "c", 1, 0),
    F("s2", 1, "a", "b", 5, 1),
    F("s2", 2, "b", "a", 0, 0),
  ];
  const podium = [
    { tournament_id: "s1", place: 1, player_id: "a" },
    { tournament_id: "s1", place: 2, player_id: "b" },
    { tournament_id: "s1", place: 3, player_id: "c" },
    { tournament_id: "cup", place: 1, player_id: "c" },
  ];
  const qualified = [{ tournament_id: "s1", player_id: "a" }];
  const r = compute(tournaments, entries, fixtures, podium, qualified);
  const a = r.players.find((p) => p.id === "a")!;
  assert.equal(a.code, "XG-0001");
  assert.equal(a.tournaments, 2);
  assert.deepEqual([a.played, a.won, a.drawn, a.lost], [4, 2, 2, 0]);
  assert.deepEqual([a.gf, a.ga, a.gd], [10, 3, 7]);
  assert.equal(a.cleanSheets, 2);
  assert.equal(a.bestWinStreak, 1);
  assert.equal(a.bestUnbeaten, 4);
  assert.deepEqual(a.form, ["W", "D", "W", "D"]);
  assert.equal(
    a.ranking,
    RANKING_POINTS.champion +
      RANKING_POINTS.knockout +
      2 * RANKING_POINTS.leagueWin,
  );
  assert.equal(r.players[0].id, "a", "ranked first");
  const c = r.players.find((p) => p.id === "c")!;
  assert.equal(c.titles, 1);
  assert.equal(c.podiums, 2);
  // Hall of Fame: finished tournaments with a champion, newest first; live season excluded.
  assert.deepEqual(
    r.hall.map((h) => h.label),
    ["cup", "Pro League · Season 1"],
  );
  assert.equal(r.hall[1].places[1]!.name, "B");
  assert.equal(r.biggestWins[0].winnerGoals - r.biggestWins[0].loserGoals, 4);
  assert.equal(
    r.highestScoring[0].winnerGoals + r.highestScoring[0].loserGoals,
    6,
  );
  assert.deepEqual(r.totals, {
    tournaments: 3,
    matches: 5,
    goals: 14,
    players: 3,
  });
  // Current champions: one per competition (latest season) and one per cup.
  assert.equal(currentChampions(r.hall).length, 2);
});

test("records: nothing is invented when there are no results", () => {
  const r = compute([T("x", { status: "open" })], [E("x", "a", 1)], [], [], []);
  assert.equal(r.hall.length, 0);
  assert.equal(r.biggestWins.length, 0);
  assert.equal(r.players[0].played, 0);
  assert.equal(r.players[0].winRate, 0);
  assert.equal(r.players[0].ranking, 0);
});

test('Hall of Fame: per-tournament team in entry mode ("Not recorded" when unknown); current team in current mode', () => {
  const e = (t: string, id: string, no: number, entry_team: string | null) => ({
    tournament_id: t,
    id,
    no,
    name: id,
    team: id === "p1" ? "Arsenal" : "Chelsea",
    entry_team,
  });
  const run = (mode: "current" | "entry") =>
    compute(
      [T("t1"), T("t2")],
      [
        e("t1", "p1", 7, "Real Madrid"),
        e("t1", "p2", 8, null),
        e("t2", "p1", 7, "Arsenal"),
        e("t2", "p2", 8, "Chelsea"),
      ],
      [],
      [
        { tournament_id: "t1", place: 1, player_id: "p1" },
        { tournament_id: "t1", place: 2, player_id: "p2" },
        { tournament_id: "t2", place: 1, player_id: "p1" },
      ],
      [],
      mode,
    );
  const r = run("entry");
  const hall = (id: string) => r.hall.find((h) => h.id === id)!;
  assert.equal(hall("t1").places[0]!.team, "Real Madrid");
  // Not recorded: says so, and never borrows the current team (Chelsea).
  assert.equal(hall("t1").places[1]!.team, "Not recorded");
  assert.equal(hall("t2").places[0]!.team, "Arsenal");
  // All-time boards use the player's current team.
  assert.equal(r.players.find((p) => p.id === "p1")!.team, "Arsenal");
  // Rollout default ("current"): every podium shows the current team, as before 007.
  const current = run("current");
  const hallNow = (id: string) => current.hall.find((h) => h.id === id)!;
  assert.equal(hallNow("t1").places[0]!.team, "Arsenal");
  assert.equal(hallNow("t1").places[1]!.team, "Chelsea");
});
