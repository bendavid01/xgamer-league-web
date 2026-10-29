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
  if (entrants.length < 2 || entrants.length > 128)
    throw new Error("Enter between 2 and 128 participants.");
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

/**
 * League fixtures for any field size.
 * - Every pair meets once (legs = 1) or twice with home and away swapped (legs = 2).
 * - Nobody plays twice in a round. In a full round robin with an odd field, one player
 *   rests each round and everyone rests exactly once per leg.
 * - Home games are balanced: every player's home and away counts differ by at most one
 *   (exactly equal over a home-and-away league).
 * - Optional `perPlayer`: each player plays exactly that many different opponents
 *   (per leg). It must be below the field size and, for an odd field, even.
 * - The second leg mirrors the first, so the same pair never meets in consecutive rounds.
 */
export function buildLeague(
  entrants: Entrant[],
  legs: 1 | 2 = 1,
  perPlayer: number | null = null,
): Fixture[] {
  validate(entrants);
  const n = entrants.length;
  if (perPlayer !== null) {
    if (!Number.isInteger(perPlayer) || perPlayer < 1 || perPlayer >= n)
      throw new Error(
        "Matches per player must be at least 1 and fewer than the number of players.",
      );
    if ((n * perPlayer) % 2)
      throw new Error(
        "With an odd number of players, matches per player must be even.",
      );
  }
  const ids = entrants.map((e) => e.id);
  // Pairings per round (circle method). A subset of rounds when perPlayer is set.
  let rounds: [string, string][][];
  const full = circleRounds(ids);
  if (perPlayer === null || perPlayer === n - 1) rounds = full;
  else if (n % 2 === 0) rounds = full.slice(0, perPlayer);
  else rounds = scheduleRounds(circulantPairs(ids, perPlayer), n);
  // Home/away: orient every match along an Euler circuit, so each player's
  // home and away counts differ by at most one.
  const homeOf = balancedOrientation(ids, rounds.flat());
  let edge = 0;
  const firstLeg = rounds.map((pairs) =>
    pairs.map(([a, b]) => {
      const h = homeOf[edge++] ? a : b;
      return [h, h === a ? b : a] as [string, string];
    }),
  );
  const fixtures: Fixture[] = [];
  const emit = (leg: [string, string][][], offset: number, swap: boolean) =>
    leg.forEach((pairs, r) =>
      pairs.forEach(([h, w], i) =>
        fixtures.push({
          id: `lg-${offset + r + 1}-${i}`,
          round: offset + r + 1,
          home: swap ? w : h,
          away: swap ? h : w,
        }),
      ),
    );
  emit(firstLeg, 0, false);
  if (legs === 2) emit(firstLeg, firstLeg.length, true);
  return fixtures;
}

function circleRounds(ids: string[]): [string, string][][] {
  const ring: (string | null)[] = [...ids];
  if (ring.length % 2) ring.push(null);
  const out: [string, string][][] = [];
  for (let r = 0; r < ring.length - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < ring.length / 2; i++) {
      const a = ring[i],
        b = ring[ring.length - 1 - i];
      if (a && b) pairs.push([a, b]);
    }
    out.push(pairs);
    ring.splice(1, 0, ring.pop()!);
  }
  return out;
}

/** k-regular opponent set: each player meets the k/2 neighbours on either side of a circle. */
function circulantPairs(ids: string[], k: number): [string, string][] {
  const n = ids.length,
    pairs: [string, string][] = [];
  for (let d = 1; d <= k / 2; d++)
    for (let i = 0; i < n; i++) pairs.push([ids[i], ids[(i + d) % n]]);
  return pairs;
}

/** Packs matches into rounds so nobody plays twice in one round (fewest rounds first-fit). */
function scheduleRounds(pairs: [string, string][], n: number) {
  const rounds: { pairs: [string, string][]; busy: Set<string> }[] = [];
  const remaining = [...pairs];
  while (remaining.length) {
    const round = { pairs: [] as [string, string][], busy: new Set<string>() };
    for (let i = 0; i < remaining.length && round.busy.size < n - 1;) {
      const [a, b] = remaining[i];
      if (!round.busy.has(a) && !round.busy.has(b)) {
        round.pairs.push([a, b]);
        round.busy.add(a).add(b);
        remaining.splice(i, 1);
      } else i++;
    }
    rounds.push(round);
  }
  return rounds.map((r) => r.pairs);
}

/**
 * For each edge (a, b), true when `a` should be home. Pairs odd-degree players with a
 * virtual node, then walks Euler circuits (Hierholzer) and orients edges along the walk:
 * every node is entered and left equally often, so |home − away| ≤ 1 for everyone.
 */
function balancedOrientation(ids: string[], pairs: [string, string][]) {
  const V = "\u0000virtual";
  const edges: [string, string][] = [...pairs];
  const degree = new Map(ids.map((id) => [id, 0]));
  for (const [a, b] of pairs) {
    degree.set(a, degree.get(a)! + 1);
    degree.set(b, degree.get(b)! + 1);
  }
  for (const id of ids) if (degree.get(id)! % 2) edges.push([id, V]);
  const adj = new Map<string, number[]>();
  edges.forEach(([a, b], i) => {
    adj.set(a, [...(adj.get(a) ?? []), i]);
    adj.set(b, [...(adj.get(b) ?? []), i]);
  });
  const used = new Array(edges.length).fill(false);
  const aHome = new Array(pairs.length).fill(true);
  const pointer = new Map<string, number>();
  for (const start of adj.keys()) {
    const stack: string[] = [start];
    while (stack.length) {
      const v = stack[stack.length - 1];
      const list = adj.get(v)!;
      let p = pointer.get(v) ?? 0;
      while (p < list.length && used[list[p]]) p++;
      pointer.set(v, p);
      if (p === list.length) {
        stack.pop();
        continue;
      }
      const e = list[p];
      used[e] = true;
      const [a, b] = edges[e];
      const next = a === v ? b : a;
      // Travel v → next: v hosts this match.
      if (e < pairs.length) aHome[e] = a === v;
      stack.push(next);
    }
  }
  return aHome;
}
