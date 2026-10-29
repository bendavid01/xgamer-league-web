import { cache } from "react";
import { getCup } from "./cup";
import { getLeague, type LeagueMatch, type LeagueTeam } from "./league";

/**
 * What the public pages show: the OM tournament once organizers have approved players,
 * otherwise the existing Sanity season. Both are returned in the same shape so the
 * current page designs stay unchanged.
 */
export type SeasonPlayer = LeagueTeam & { team: string | null };
export type Season = {
  source: "om" | "sanity";
  available: boolean;
  title: string | null;
  players: SeasonPlayer[];
  matches: LeagueMatch[];
  qualifiers: number | null;
};

const STAGE = { league: "League", knockout: "Knockout" } as const;

export const getSeason = cache(async (): Promise<Season> => {
  const cup = await getCup();
  if (cup && cup.players.length) {
    const byId = new Map(
      cup.players.map((p) => [p.id, { _id: p.id, name: p.name, group: null }]),
    );
    return {
      source: "om",
      available: true,
      title: cup.tournament.name,
      players: cup.players.map((p) => ({
        _id: p.id,
        name: p.name,
        group: null,
        team: p.team,
      })),
      // Byes are not matches, so they are not listed publicly.
      matches: cup.fixtures
        .filter((f) => f.away)
        .map((f) => ({
          _id: f.id,
          status: f.home_score === null ? "scheduled" : "completed",
          stage: `${STAGE[f.stage]} · Round ${f.round}`,
          homeScore: f.home_score,
          awayScore: f.away_score,
          home: byId.get(f.home) ?? null,
          away: byId.get(f.away!) ?? null,
        })),
      qualifiers:
        cup.tournament.format === "league_knockout"
          ? cup.tournament.qualifiers
          : null,
    };
  }
  const league = await getLeague();
  return {
    source: "sanity",
    available: league.available,
    title: null,
    players: league.teams.map((t) => ({ ...t, team: null })),
    matches: league.matches,
    qualifiers: null,
  };
});

/** League results for the standings table (both sources). */
export function seasonResults(season: Season) {
  return season.matches
    .filter(
      (m) =>
        m.status === "completed" &&
        m.home &&
        m.away &&
        Number.isInteger(m.homeScore) &&
        Number.isInteger(m.awayScore) &&
        (season.source === "om"
          ? m.stage?.startsWith("League")
          : m.stage === "Group Stage"),
    )
    .map((m) => ({
      home: m.home!._id,
      away: m.away!._id,
      homeScore: m.homeScore!,
      awayScore: m.awayScore!,
    }));
}
