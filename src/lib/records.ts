import { cache } from "react";
import { db } from "./db";
import { playerCode } from "./codes";
import { tournamentLabel } from "./labels";

/**
 * All-time numbers for the Champions page, computed from real OM data only:
 * published tournaments, approved players, recorded league scores and
 * organizer-confirmed final positions. Public fields only.
 *
 * "Goals" are the goals a player's eFootball team scored in their matches.
 */

/** XGamer Ranking points. Tuned after testing; shown on the page. */
export const RANKING_POINTS = {
  champion: 10,
  runnerUp: 7,
  third: 5,
  knockout: 3,
  leagueWin: 1,
};
/** Percentages and averages need a fair sample. */
export const MIN_MATCHES = 5;

export type PlayerRecord = {
  id: string;
  code: string;
  name: string;
  team: string | null;
  tournaments: number;
  titles: number;
  runnerUps: number;
  thirds: number;
  podiums: number;
  knockouts: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  cleanSheets: number;
  winRate: number;
  pointsPerGame: number;
  concededPerGame: number;
  bestWinStreak: number;
  bestUnbeaten: number;
  form: ("W" | "D" | "L")[];
  formPoints: number;
  ranking: number;
};

export type MatchRecord = {
  tournament: string;
  tournamentId: string;
  round: number;
  winner: { code: string; name: string };
  loser: { code: string; name: string };
  winnerGoals: number;
  loserGoals: number;
  drawn: boolean;
};

export type HallEntry = {
  id: string;
  name: string;
  label: string;
  competition: string | null;
  season: number | null;
  photo: number | null;
  places: ({ code: string; name: string; team: string | null } | null)[];
};

export const getRecords = cache(async () => {
  if (!process.env.DATABASE_URL) return null;
  try {
    const sql = db();
    const tournaments = await sql<
      {
        id: string;
        name: string;
        competition: string | null;
        season: number | null;
        status: string;
        photo: number | null;
      }[]
    >`select t.id,t.name,t.competition,t.season,t.status,extract(epoch from p.updated_at)::int as photo
      from tournament t left join tournament_photo p on p.tournament_id=t.id
      where t.published and t.deleted_at is null order by t.created_at`;
    const ids = tournaments.map((t) => t.id);
    if (!ids.length) return empty();
    const [entries, fixtures, podium, qualified] = await Promise.all([
      sql<
        {
          tournament_id: string;
          id: string;
          no: number;
          name: string;
          team: string | null;
        }[]
      >`select a.tournament_id,p.id,p.public_no as no,p.gaming_name as name,p.team_name as team
        from application a join player p on p.id=a.player_id
        where a.tournament_id = any(${ids}) and a.status='approved' and a.deleted_at is null and p.deleted_at is null`,
      sql<
        {
          tournament_id: string;
          round: number;
          slot: number;
          home: string;
          away: string;
          home_score: number;
          away_score: number;
        }[]
      >`select tournament_id,round,slot,home,away,home_score,away_score from fixture
        where tournament_id = any(${ids}) and stage='league' and away is not null and home_score is not null`,
      sql<
        { tournament_id: string; place: number; player_id: string }[]
      >`select tournament_id,place,player_id from podium where tournament_id = any(${ids})`,
      sql<
        { tournament_id: string; player_id: string }[]
      >`select tournament_id,player_id from qualification where tournament_id = any(${ids})`,
    ]);
    return compute(tournaments, entries, fixtures, podium, qualified);
  } catch {
    console.error("Records unavailable");
    return null;
  }
});

function empty() {
  return {
    players: [] as PlayerRecord[],
    hall: [] as HallEntry[],
    biggestWins: [] as MatchRecord[],
    highestScoring: [] as MatchRecord[],
    totals: { tournaments: 0, matches: 0, goals: 0, players: 0 },
  };
}

/** Pure calculation, exported for tests. */
export function compute(
  tournaments: {
    id: string;
    name: string;
    competition: string | null;
    season: number | null;
    status: string;
    photo: number | null;
  }[],
  entries: {
    tournament_id: string;
    id: string;
    no: number;
    name: string;
    team: string | null;
  }[],
  fixtures: {
    tournament_id: string;
    round: number;
    slot: number;
    home: string;
    away: string;
    home_score: number;
    away_score: number;
  }[],
  podium: { tournament_id: string; place: number; player_id: string }[],
  qualified: { tournament_id: string; player_id: string }[],
) {
  const order = new Map(tournaments.map((t, i) => [t.id, i]));
  const label = new Map(tournaments.map((t) => [t.id, tournamentLabel(t)]));
  const people = new Map<
    string,
    { code: string; name: string; team: string | null; in: Set<string> }
  >();
  for (const e of entries) {
    const p = people.get(e.id) ?? {
      code: playerCode(e.no),
      name: e.name,
      team: e.team,
      in: new Set<string>(),
    };
    p.in.add(e.tournament_id);
    people.set(e.id, p);
  }
  const who = (id: string) => {
    const p = people.get(id);
    return { code: p?.code ?? "", name: p?.name ?? "Player" };
  };
  const games = [...fixtures].sort(
    (a, b) =>
      order.get(a.tournament_id)! - order.get(b.tournament_id)! ||
      a.round - b.round ||
      a.slot - b.slot,
  );

  const players: PlayerRecord[] = [...people].map(([id, p]) => {
    let won = 0,
      drawn = 0,
      lost = 0,
      gf = 0,
      ga = 0,
      clean = 0,
      win = 0,
      unbeaten = 0,
      bestWin = 0,
      bestUnbeaten = 0;
    const results: ("W" | "D" | "L")[] = [];
    for (const g of games) {
      if (g.home !== id && g.away !== id) continue;
      const mine = g.home === id ? g.home_score : g.away_score;
      const theirs = g.home === id ? g.away_score : g.home_score;
      gf += mine;
      ga += theirs;
      if (theirs === 0) clean++;
      const r = mine > theirs ? "W" : mine < theirs ? "L" : "D";
      results.push(r);
      if (r === "W") won++;
      else if (r === "D") drawn++;
      else lost++;
      win = r === "W" ? win + 1 : 0;
      unbeaten = r === "L" ? 0 : unbeaten + 1;
      bestWin = Math.max(bestWin, win);
      bestUnbeaten = Math.max(bestUnbeaten, unbeaten);
    }
    const mine = podium.filter((x) => x.player_id === id);
    const titles = mine.filter((x) => x.place === 1).length;
    const runnerUps = mine.filter((x) => x.place === 2).length;
    const thirds = mine.filter((x) => x.place === 3).length;
    const knockouts = qualified.filter((q) => q.player_id === id).length;
    const played = won + drawn + lost;
    const form = results.slice(-5);
    return {
      id,
      code: p.code,
      name: p.name,
      team: p.team,
      tournaments: p.in.size,
      titles,
      runnerUps,
      thirds,
      podiums: titles + runnerUps + thirds,
      knockouts,
      played,
      won,
      drawn,
      lost,
      gf,
      ga,
      gd: gf - ga,
      cleanSheets: clean,
      winRate: played ? Math.round((won / played) * 100) : 0,
      pointsPerGame: played
        ? Math.round(((won * 3 + drawn) / played) * 100) / 100
        : 0,
      concededPerGame: played ? Math.round((ga / played) * 100) / 100 : 0,
      bestWinStreak: bestWin,
      bestUnbeaten,
      form,
      formPoints: form.reduce(
        (s, r) => s + (r === "W" ? 3 : r === "D" ? 1 : 0),
        0,
      ),
      ranking:
        titles * RANKING_POINTS.champion +
        runnerUps * RANKING_POINTS.runnerUp +
        thirds * RANKING_POINTS.third +
        knockouts * RANKING_POINTS.knockout +
        won * RANKING_POINTS.leagueWin,
    };
  });
  players.sort(
    (a, b) =>
      b.ranking - a.ranking ||
      b.titles - a.titles ||
      b.won - a.won ||
      b.gd - a.gd ||
      a.name.localeCompare(b.name),
  );

  const matches: MatchRecord[] = games.map((g) => {
    const homeWins = g.home_score >= g.away_score;
    return {
      tournament: label.get(g.tournament_id)!,
      tournamentId: g.tournament_id,
      round: g.round,
      winner: who(homeWins ? g.home : g.away),
      loser: who(homeWins ? g.away : g.home),
      winnerGoals: Math.max(g.home_score, g.away_score),
      loserGoals: Math.min(g.home_score, g.away_score),
      drawn: g.home_score === g.away_score,
    };
  });
  const biggestWins = matches
    .filter((m) => !m.drawn)
    .sort(
      (a, b) =>
        b.winnerGoals - b.loserGoals - (a.winnerGoals - a.loserGoals) ||
        b.winnerGoals - a.winnerGoals,
    )
    .slice(0, 5);
  const highestScoring = [...matches]
    .sort(
      (a, b) =>
        b.winnerGoals + b.loserGoals - (a.winnerGoals + a.loserGoals) ||
        b.winnerGoals - a.winnerGoals,
    )
    .filter((m) => m.winnerGoals + m.loserGoals > 0)
    .slice(0, 5);

  const hall: HallEntry[] = tournaments
    .filter(
      (t) =>
        t.status === "completed" &&
        podium.some((p) => p.tournament_id === t.id && p.place === 1),
    )
    .reverse()
    .map((t) => ({
      id: t.id,
      name: t.name,
      label: label.get(t.id)!,
      competition: t.competition,
      season: t.season,
      photo: t.photo,
      places: [1, 2, 3].map((n) => {
        const id = podium.find(
          (p) => p.tournament_id === t.id && p.place === n,
        )?.player_id;
        const p = id ? people.get(id) : null;
        return p ? { code: p.code, name: p.name, team: p.team } : null;
      }),
    }));

  return {
    players,
    hall,
    biggestWins,
    highestScoring,
    totals: {
      tournaments: tournaments.length,
      matches: games.length,
      goals: games.reduce((s, g) => s + g.home_score + g.away_score, 0),
      players: people.size,
    },
  };
}

export type Records = NonNullable<Awaited<ReturnType<typeof getRecords>>>;

/**
 * Current champion of each competition (latest finished season), and of each
 * one-off cup. For the homepage.
 */
export function currentChampions(hall: HallEntry[]) {
  const seen = new Set<string>();
  return hall.filter((h) => {
    const key = h.competition?.toLowerCase() ?? `cup:${h.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
