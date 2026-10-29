import { cache } from "react";
import { db } from "./db";
import { standings } from "./tournament";
import { codeNumber, playerCode } from "./codes";
import { formatChoice, tournamentLabel, type FormatChoice } from "./labels";

/**
 * A player's whole X-Gamer career, by permanent ID (XG-0007).
 * Public fields only: name, team, ID, results. Never phone numbers or eFootball IDs.
 */
export type CareerMatch = {
  id: string;
  tournament: string;
  tournamentLabel: string;
  round: number;
  opponent: { code: string; name: string };
  home: boolean;
  gf: number | null;
  ga: number | null;
  outcome: "W" | "D" | "L" | null;
};
export type CareerEntry = {
  id: string;
  label: string;
  format: FormatChoice;
  status: string;
  finished: boolean;
  /** Podium place (1–3), or table position for a finished league. */
  position: number | null;
  podium: number | null;
  qualified: boolean;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  pts: number;
  field: number;
};

export const getProfile = cache(async (code: string) => {
  const no = codeNumber(code);
  if (!no || !process.env.DATABASE_URL) return null;
  const sql = db();
  const [player] = await sql<
    {
      id: string;
      name: string;
      team: string | null;
      since: string;
    }[]
  >`select id,gaming_name as name,team_name as team,to_char(consent_at,'YYYY-MM-DD') as since
    from player where public_no=${no} and deleted_at is null`;
  if (!player) return null;

  const tournaments = await sql<
    {
      id: string;
      name: string;
      competition: string | null;
      season: number | null;
      format: string;
      knockout: boolean;
      status: string;
    }[]
  >`select t.id,t.name,t.competition,t.season,t.format,t.knockout,t.status
    from tournament t join application a on a.tournament_id=t.id
    where a.player_id=${player.id} and a.status='approved' and a.deleted_at is null
      and t.published and t.deleted_at is null
    order by t.created_at`;
  const ids = tournaments.map((t) => t.id);
  const [entrants, fixtures, podium, qualified] = ids.length
    ? await Promise.all([
        sql<
          { tournament_id: string; id: string; name: string; no: number }[]
        >`select a.tournament_id,p.id,p.gaming_name as name,p.public_no as no from application a join player p on p.id=a.player_id
          where a.tournament_id = any(${ids}) and a.status='approved' and a.deleted_at is null`,
        sql<
          {
            id: string;
            tournament_id: string;
            round: number;
            slot: number;
            home: string;
            away: string;
            home_score: number | null;
            away_score: number | null;
          }[]
        >`select id,tournament_id,round,slot,home,away,home_score,away_score from fixture
          where tournament_id = any(${ids}) and stage='league' and away is not null`,
        sql<
          { tournament_id: string; place: number }[]
        >`select tournament_id,place from podium where tournament_id = any(${ids}) and player_id=${player.id}`,
        sql<
          { tournament_id: string }[]
        >`select tournament_id from qualification where tournament_id = any(${ids}) and player_id=${player.id}`,
      ])
    : [[], [], [], []];

  const people = new Map(
    entrants.map((e) => [e.id, { code: playerCode(e.no), name: e.name }]),
  );
  const order = new Map(ids.map((id, i) => [id, i]));
  const labels = new Map(tournaments.map((t) => [t.id, tournamentLabel(t)]));

  const career: CareerEntry[] = tournaments.map((t) => {
    const field = entrants.filter((e) => e.tournament_id === t.id);
    const results = fixtures
      .filter((f) => f.tournament_id === t.id && f.home_score !== null)
      .map((f) => ({
        home: f.home,
        away: f.away,
        homeScore: f.home_score!,
        awayScore: f.away_score!,
      }));
    const table = standings(field, results);
    const index = table.findIndex((r) => r.id === player.id);
    const row = table[index];
    const place = podium.find((p) => p.tournament_id === t.id)?.place ?? null;
    const finished = t.status === "completed";
    const format = formatChoice(t);
    return {
      id: t.id,
      label: labels.get(t.id)!,
      format,
      status: t.status,
      finished,
      podium: place,
      position:
        place ??
        (format !== "knockout" && results.length && index >= 0
          ? index + 1
          : null),
      qualified: qualified.some((q) => q.tournament_id === t.id),
      played: row?.played ?? 0,
      won: row?.won ?? 0,
      drawn: row?.drawn ?? 0,
      lost: row?.lost ?? 0,
      gf: row?.gf ?? 0,
      ga: row?.ga ?? 0,
      pts: row?.pts ?? 0,
      field: field.length,
    };
  });

  const mine = fixtures
    .filter((f) => f.home === player.id || f.away === player.id)
    .sort(
      (a, b) =>
        order.get(a.tournament_id)! - order.get(b.tournament_id)! ||
        a.round - b.round ||
        a.slot - b.slot,
    )
    .map((f): CareerMatch => {
      const home = f.home === player.id;
      const gf = home ? f.home_score : f.away_score,
        ga = home ? f.away_score : f.home_score;
      const opp = people.get(home ? f.away : f.home) ?? {
        code: "XG-????",
        name: "Player",
      };
      return {
        id: f.id,
        tournament: f.tournament_id,
        tournamentLabel: labels.get(f.tournament_id)!,
        round: f.round,
        opponent: opp,
        home,
        gf,
        ga,
        outcome:
          gf === null || ga === null
            ? null
            : gf > ga
              ? "W"
              : gf < ga
                ? "L"
                : "D",
      };
    });
  const playedMatches = mine.filter((m) => m.outcome);
  const live = new Set(
    tournaments.filter((t) => t.status === "league").map((t) => t.id),
  );
  const count = (o: string) =>
    playedMatches.filter((m) => m.outcome === o).length;
  const gf = playedMatches.reduce((s, m) => s + m.gf!, 0),
    ga = playedMatches.reduce((s, m) => s + m.ga!, 0);
  const finishes = career
    .filter((c) => c.finished && c.position)
    .map((c) => c.position!);

  const h2h = new Map<
    string,
    {
      code: string;
      name: string;
      p: number;
      w: number;
      d: number;
      l: number;
      gf: number;
      ga: number;
    }
  >();
  for (const m of playedMatches) {
    const r = h2h.get(m.opponent.code) ?? {
      ...m.opponent,
      p: 0,
      w: 0,
      d: 0,
      l: 0,
      gf: 0,
      ga: 0,
    };
    r.p++;
    r.gf += m.gf!;
    r.ga += m.ga!;
    if (m.outcome === "W") r.w++;
    else if (m.outcome === "D") r.d++;
    else r.l++;
    h2h.set(m.opponent.code, r);
  }

  return {
    player: { ...player, code: playerCode(no) },
    trophies: {
      gold: career.filter((c) => c.podium === 1).length,
      silver: career.filter((c) => c.podium === 2).length,
      bronze: career.filter((c) => c.podium === 3).length,
    },
    totals: {
      tournaments: career.length,
      matches: playedMatches.length,
      won: count("W"),
      drawn: count("D"),
      lost: count("L"),
      winRate: playedMatches.length
        ? Math.round((count("W") / playedMatches.length) * 100)
        : 0,
      gf,
      ga,
      gd: gf - ga,
      best: finishes.length ? Math.min(...finishes) : null,
      knockouts: career.filter((c) => c.qualified).length,
    },
    career: [...career].reverse(),
    form: playedMatches.slice(-5).map((m) => m.outcome!),
    history: [...playedMatches].reverse(),
    next: mine.filter((m) => !m.outcome && live.has(m.tournament)).slice(0, 5),
    headToHead: [...h2h.values()].sort(
      (a, b) => b.p - a.p || a.name.localeCompare(b.name),
    ),
  };
});

export type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;
