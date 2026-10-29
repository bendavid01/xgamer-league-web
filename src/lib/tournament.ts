export type Entrant = { id: string; name: string };
export type Fixture = {
  id: string;
  round: number;
  home: string | null;
  away: string | null;
};
export type Result = {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
};

/** First N circle rounds: each player gets N unique opponents. */
export function leaguePhase(entrants: Entrant[], opponents = 4): Fixture[] {
  validate(entrants);
  if (
    entrants.length % 2 ||
    !Number.isInteger(opponents) ||
    opponents < 1 ||
    opponents >= entrants.length
  )
    throw new Error("An even field and a valid opponent count are required.");
  return roundRobin(entrants).filter((f) => f.round <= opponents);
}
export function qualifyLeaguePhase(
  entrants: Entrant[],
  results: Result[],
  opponents = 4,
  playoffWinners: string[] = [],
) {
  const expected = new Set(
    leaguePhase(entrants, opponents).map((f) =>
      [f.home, f.away].sort().join("|"),
    ),
  );
  const played = results.map((r) => [r.home, r.away].sort().join("|"));
  if (
    played.length !== expected.size ||
    new Set(played).size !== expected.size ||
    played.some((k) => !expected.has(k))
  )
    throw new Error(
      "Complete every scheduled league fixture before qualification.",
    );
  const ranked = standings(entrants, results);
  if (ranked.length < 8) throw new Error("Eight qualifiers are required.");
  const a = ranked[7],
    b = ranked[8];
  if (b && a.pts === b.pts && a.gd === b.gd && a.gf === b.gf) {
    const tied = ranked.filter(
      (p) => p.pts === a.pts && p.gd === a.gd && p.gf === a.gf,
    );
    const start = ranked.findIndex((p) => p.id === tied[0].id),
      needed = 8 - start;
    if (
      playoffWinners.length !== needed ||
      new Set(playoffWinners).size !== needed ||
      playoffWinners.some((id) => !tied.some((p) => p.id === id))
    )
      throw new Error(
        "The eighth-place tie requires confirmed playoff winners before qualification.",
      );
    return [
      ...ranked.slice(0, start),
      ...playoffWinners.map((id) => tied.find((p) => p.id === id)!),
    ];
  }
  if (playoffWinners.length)
    throw new Error(
      "Playoff overrides are only allowed for a tied qualification cutoff.",
    );
  return ranked.slice(0, 8);
}
function validate(entrants: Entrant[]) {
  if (entrants.length < 2 || entrants.length > 64)
    throw new Error("Enter between 2 and 64 participants.");
  if (
    new Set(entrants.map((e) => e.id)).size !== entrants.length ||
    entrants.some((e) => !e.id || !e.name.trim())
  )
    throw new Error("Participants must have unique IDs and names.");
}

/** Circle method: odd fields receive one bye per participant; no self matches. */
export function roundRobin(entrants: Entrant[]): Fixture[] {
  validate(entrants);
  const ring: (string | null)[] = entrants.map((e) => e.id);
  if (ring.length % 2) ring.push(null);
  const fixtures: Fixture[] = [];
  for (let round = 1; round < ring.length; round++) {
    for (let i = 0; i < ring.length / 2; i++) {
      const a = ring[i],
        b = ring[ring.length - 1 - i];
      if (a && b)
        fixtures.push({
          id: `rr-${round}-${i}`,
          round,
          home: round % 2 ? a : b,
          away: round % 2 ? b : a,
        });
    }
    ring.splice(1, 0, ring.pop()!);
  }
  return fixtures;
}

/** Seed order is supplied by the organizer. A null opponent is an automatic bye. */
export function knockout(entrants: Entrant[]): Fixture[] {
  validate(entrants);
  const size = 2 ** Math.ceil(Math.log2(entrants.length));
  let seeds = [1, 2];
  while (seeds.length < size) {
    const next = seeds.length * 2 + 1;
    seeds = seeds.flatMap((s) => [s, next - s]);
  }
  return Array.from({ length: size / 2 }, (_, i) => ({
    id: `ko-1-${i}`,
    round: 1,
    home: entrants[seeds[i * 2] - 1]?.id ?? null,
    away: entrants[seeds[i * 2 + 1] - 1]?.id ?? null,
  }));
}

export function advanceKnockout(
  fixtures: Fixture[],
  winners: Record<string, string>,
): Fixture[] {
  if (!fixtures.length || (fixtures.length % 2 && fixtures.length !== 1))
    throw new Error("Invalid bracket round.");
  const advancing = fixtures.map((f) => {
    if (!f.home && !f.away) throw new Error("Empty fixture.");
    const winner = !f.home ? f.away : !f.away ? f.home : winners[f.id];
    if (!winner || ![f.home, f.away].includes(winner))
      throw new Error("Every played match needs a valid confirmed winner.");
    return winner;
  });
  if (fixtures.length === 1) return [];
  return Array.from({ length: advancing.length / 2 }, (_, i) => ({
    id: `ko-${fixtures[0].round + 1}-${i}`,
    round: fixtures[0].round + 1,
    home: advancing[i * 2],
    away: advancing[i * 2 + 1],
  }));
}

export function standings(entrants: Entrant[], results: Result[]) {
  const rows = new Map(
    entrants.map((e) => [
      e.id,
      {
        ...e,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0,
      },
    ]),
  );
  for (const r of results) {
    const home = rows.get(r.home),
      away = rows.get(r.away);
    if (
      !home ||
      !away ||
      home === away ||
      ![r.homeScore, r.awayScore].every(
        (s) => Number.isInteger(s) && s >= 0 && s <= 99,
      )
    )
      throw new Error("Invalid result.");
    home.played++;
    away.played++;
    home.gf += r.homeScore;
    home.ga += r.awayScore;
    away.gf += r.awayScore;
    away.ga += r.homeScore;
    if (r.homeScore === r.awayScore) {
      home.drawn++;
      away.drawn++;
      home.pts++;
      away.pts++;
    } else {
      const [winner, loser] =
        r.homeScore > r.awayScore ? [home, away] : [away, home];
      winner.won++;
      winner.pts += 3;
      loser.lost++;
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, gd: r.gf - r.ga }))
    .sort(
      (a, b) =>
        b.pts - a.pts ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
}

export function leagueKnockout(
  entrants: Entrant[],
  results: Result[],
  qualifiers: number,
) {
  validate(entrants);
  if (
    qualifiers < 2 ||
    qualifiers > entrants.length ||
    !Number.isInteger(Math.log2(qualifiers))
  )
    throw new Error(
      "Qualifiers must be a power of two within the participant count.",
    );
  const expected = new Set(
    roundRobin(entrants).map((f) => [f.home, f.away].sort().join("|")),
  );
  const played = results.map((r) => [r.home, r.away].sort().join("|"));
  if (
    played.length !== expected.size ||
    new Set(played).size !== expected.size ||
    played.some((key) => !expected.has(key))
  )
    throw new Error("Complete every league fixture once before qualification.");
  const ranked = standings(entrants, results);
  // Points, goal difference, goals scored; alphabetic ordering is display-only.
  const a = ranked[qualifiers - 1],
    b = ranked[qualifiers];
  if (b && a.pts === b.pts && a.gd === b.gd && a.gf === b.gf)
    throw new Error(
      "Qualification tie requires an administrator playoff decision.",
    );
  return knockout(ranked.slice(0, qualifiers));
}

/**
 * Top-N qualification from a completed league table (any field size).
 * The caller guarantees every scheduled league fixture has a confirmed score.
 * A tie exactly across the cutoff must be settled by organizer-recorded playoff winners.
 */
export function qualifyTopN(
  entrants: Entrant[],
  results: Result[],
  qualifiers: number,
  playoffWinners: string[] = [],
) {
  if (
    !Number.isInteger(Math.log2(qualifiers)) ||
    qualifiers < 2 ||
    qualifiers >= entrants.length
  )
    throw new Error(
      "Choose Top 2, 4, 8, 16 or 32, fewer than the number of players.",
    );
  const ranked = standings(entrants, results);
  const a = ranked[qualifiers - 1],
    b = ranked[qualifiers];
  const same = (p: (typeof ranked)[number]) =>
    p.pts === a.pts && p.gd === a.gd && p.gf === a.gf;
  if (b && same(b)) {
    const tied = ranked.filter(same);
    const start = ranked.findIndex((p) => p.id === tied[0].id),
      needed = qualifiers - start;
    if (
      playoffWinners.length !== needed ||
      new Set(playoffWinners).size !== needed ||
      playoffWinners.some((id) => !tied.some((p) => p.id === id))
    )
      throw new Error(
        `Tie at the qualification cutoff: choose ${needed} playoff winner(s) from the tied players.`,
      );
    return [
      ...ranked.slice(0, start),
      ...playoffWinners.map((id) => tied.find((p) => p.id === id)!),
    ];
  }
  if (playoffWinners.length)
    throw new Error("Playoff winners are only needed for a tied cutoff.");
  return ranked.slice(0, qualifiers);
}

/** Organizer-selected fixtures for the chosen format. Byes have away = null. */
export function firstFixtures(
  format: "league" | "knockout" | "league_knockout",
  entrants: Entrant[],
  opponents: number | null,
) {
  if (format === "knockout")
    return { stage: "knockout" as const, fixtures: knockout(entrants) };
  const fixtures =
    opponents && opponents < entrants.length - 1
      ? leaguePhase(entrants, opponents)
      : roundRobin(entrants);
  return { stage: "league" as const, fixtures };
}
