import { cache } from "react";
import { getTournament, type PublicFixture } from "./tournaments";
import { formatChoice } from "./labels";

/**
 * Tournament-specific Champions data (XG-009): Podium, Players and Records for
 * ONE tournament. Read-only, computed from the official OM tables on every
 * request, so a corrected score updates every record automatically.
 * Separate from the all-time ranking and leaderboards (src/lib/records.ts).
 *
 * Rules (approved by the product owner):
 * - Only finalized results count: league matches with both scores entered in OM.
 * - "Goals" are the goals of the player's eFootball team, not footballer goals.
 * - Best Defence: fewest goals conceded per match, among players with at least
 *   3 completed matches AND at least half (rounded up) of the most active player's.
 * - Winning streak: consecutive wins in fixture round order (then slot), because
 *   real match dates are not stored. A draw or loss ends a streak.
 * - Ties: every player sharing a record is listed.
 * - Results don't record forfeits/walkovers separately; a score is a score.
 */
export const DEFENCE_MIN_MATCHES = 3;

export type Who = {
  id: string;
  code: string;
  name: string;
  team: string | null;
};
export type Holders = { value: number; players: Who[] };
export type Victory = {
  fixtureId: string;
  round: number;
  winner: Who;
  loser: Who;
  winnerGoals: number;
  loserGoals: number;
};
export type Line = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  bestStreak: number;
};

type Fixture = Pick<
  PublicFixture,
  "id" | "round" | "home" | "away" | "home_score" | "away_score"
> & { slot?: number };

/** Deterministic official order: round, then slot, then id. */
export const officialOrder = (fixtures: Fixture[]) =>
  fixtures
    .filter((f) => f.home_score !== null && f.away_score !== null)
    .sort(
      (a, b) =>
        a.round - b.round ||
        (a.slot ?? 0) - (b.slot ?? 0) ||
        a.id.localeCompare(b.id),
    );

export function tournamentRecords(players: Who[], fixtures: Fixture[]) {
  const games = officialOrder(fixtures);
  const lines = new Map<string, Line & { streak: number }>(
    players.map((p) => [
      p.id,
      {
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        bestStreak: 0,
        streak: 0,
      },
    ]),
  );
  const victories: Victory[] = [];
  const who = new Map(players.map((p) => [p.id, p]));
  for (const g of games) {
    const hs = g.home_score!,
      as = g.away_score!;
    for (const [id, mine, theirs] of [
      [g.home, hs, as],
      [g.away, as, hs],
    ] as const) {
      const l = lines.get(id);
      if (!l) continue; // not an approved participant: never credited
      l.played++;
      l.gf += mine;
      l.ga += theirs;
      if (mine > theirs) {
        l.won++;
        l.streak++;
        l.bestStreak = Math.max(l.bestStreak, l.streak);
      } else {
        if (mine === theirs) l.drawn++;
        else l.lost++;
        l.streak = 0;
      }
      l.gd = l.gf - l.ga;
    }
    const w = hs > as ? g.home : g.away,
      lo = hs > as ? g.away : g.home;
    if (hs !== as && who.get(w) && who.get(lo))
      victories.push({
        fixtureId: g.id,
        round: g.round,
        winner: who.get(w)!,
        loser: who.get(lo)!,
        winnerGoals: Math.max(hs, as),
        loserGoals: Math.min(hs, as),
      });
  }

  const active = players.filter((p) => lines.get(p.id)!.played > 0);
  /** Highest value (or lowest with asc), all ties; null when no one qualifies. */
  const best = (
    pool: Who[],
    value: (l: Line) => number,
    { positive = true } = {},
  ): Holders | null => {
    if (!pool.length) return null;
    const top = Math.max(...pool.map((p) => value(lines.get(p.id)!)));
    if (positive && top <= 0) return null;
    return {
      value: top,
      players: pool.filter((p) => value(lines.get(p.id)!) === top),
    };
  };

  const mostPlayed = active.length
    ? Math.max(...active.map((p) => lines.get(p.id)!.played))
    : 0;
  const defenceMin = Math.max(DEFENCE_MIN_MATCHES, Math.ceil(mostPlayed / 2));
  const eligible = active.filter((p) => lines.get(p.id)!.played >= defenceMin);
  let bestDefence: (Holders & { perMatch: number }) | null = null;
  if (eligible.length) {
    // Compare ga/played exactly (cross-multiplication), so ties are real ties.
    const ratio = (p: Who) => lines.get(p.id)!;
    let lead = eligible[0];
    for (const p of eligible)
      if (ratio(p).ga * ratio(lead).played < ratio(lead).ga * ratio(p).played)
        lead = p;
    const L = ratio(lead);
    const holders = eligible.filter(
      (p) => ratio(p).ga * L.played === L.ga * ratio(p).played,
    );
    bestDefence = {
      value: L.ga,
      perMatch: Math.round((L.ga / L.played) * 100) / 100,
      players: holders,
    };
  }

  const margin = (v: Victory) => v.winnerGoals - v.loserGoals;
  const topMargin = victories.length ? Math.max(...victories.map(margin)) : 0;

  return {
    matches: games.length,
    lines: Object.fromEntries(
      [...lines].map(([id, l]) => [
        id,
        {
          played: l.played,
          won: l.won,
          drawn: l.drawn,
          lost: l.lost,
          gf: l.gf,
          ga: l.ga,
          gd: l.gd,
          bestStreak: l.bestStreak,
        },
      ]),
    ) as Record<string, Line>,
    topScorer: best(active, (l) => l.gf),
    bestDefence,
    defenceMin,
    longestStreak: best(active, (l) => l.bestStreak),
    biggestVictory: victories.filter((v) => margin(v) === topMargin),
    mostWins: best(active, (l) => l.won),
    mostDraws: best(active, (l) => l.drawn),
    highestGoalDifference: best(active, (l) => l.gd, { positive: false }),
  };
}

export type TournamentRecords = ReturnType<typeof tournamentRecords>;

/** Status shown on the Players tab — only what OM records support. */
export function participantStatus(
  t: { status: string; format: string; knockout: boolean },
  playerId: string,
  qualified: Set<string>,
  podium: (string | null)[],
) {
  const place = podium.indexOf(playerId);
  if (t.status === "completed" && place >= 0)
    return ["Champion", "Runner-up", "Third place"][place];
  if (formatChoice(t) === "league_knockout" && qualified.size > 0)
    return qualified.has(playerId) ? "Qualified" : "Not qualified";
  if (t.status === "completed") return "Completed";
  if (["draft", "open", "locked"].includes(t.status)) return "Registered";
  return "Participating";
}

/** Everything the /champions/<tournament> page needs. Public fields only. */
export const getChampionsTournament = cache(async (id: string) => {
  const data = await getTournament(id);
  if (!data) return null;
  const t = data.tournament;
  // A podium is official only once the tournament is finished and an organizer
  // has confirmed 1st place. Nothing is ever taken from a running table.
  const official = t.status === "completed" && !!data.podium[0];
  const qualified = new Set(data.qualified);
  return {
    ...data,
    official,
    rounds: new Set(data.fixtures.map((f) => f.round)).size,
    records: tournamentRecords(data.players, data.fixtures),
    status: Object.fromEntries(
      data.players.map((p) => [
        p.id,
        participantStatus(t, p.id, qualified, official ? data.podium : []),
      ]),
    ) as Record<string, string>,
  };
});
