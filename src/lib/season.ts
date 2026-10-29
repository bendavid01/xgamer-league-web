import { cache } from "react";
import {
  getTournament,
  listTournaments,
  type PublicTournament,
} from "./tournaments";
import { getLeague, type LeagueMatch, type LeagueTeam } from "./league";

/**
 * What the public Players / Fixtures / Standings pages show:
 * live OM tournaments (one tab each) once organizers have approved players,
 * otherwise the existing Sanity season. Same shape either way, so page designs stay unchanged.
 */
export type SeasonPlayer = LeagueTeam & {
  team: string | null;
  qualified?: boolean;
};
export type Season = {
  source: "om" | "sanity";
  available: boolean;
  tabs: { id: string; name: string }[];
  current: PublicTournament | null;
  players: SeasonPlayer[];
  matches: LeagueMatch[];
  qualifiers: number | null;
};

export const getSeason = cache(
  async (requested?: string | null): Promise<Season> => {
    const list = await listTournaments();
    const live = list?.active ?? [];
    const pool = requested && list ? [...live, ...list.past] : live;
    const chosen = pool.find((t) => t.id === requested) ?? live[0];
    const data = chosen ? await getTournament(chosen.id) : null;
    if (data && (data.players.length || requested)) {
      const byId = new Map(
        data.players.map((p) => [
          p.id,
          { _id: p.id, name: p.name, group: null },
        ]),
      );
      const qualified = new Set(data.qualified);
      return {
        source: "om",
        available: true,
        tabs: live.map(({ id, name }) => ({ id, name })),
        current: data.tournament,
        players: data.players.map((p) => ({
          _id: p.id,
          name: p.name,
          group: null,
          team: p.team,
          qualified: qualified.has(p.id),
        })),
        matches: data.fixtures.map((f) => ({
          _id: f.id,
          status: f.home_score === null ? "scheduled" : "completed",
          stage: `${data.tournament.name} · Round ${f.round}`,
          homeScore: f.home_score,
          awayScore: f.away_score,
          home: byId.get(f.home) ?? null,
          away: byId.get(f.away) ?? null,
        })),
        qualifiers:
          data.tournament.format === "league" && data.tournament.knockout
            ? data.tournament.qualifiers
            : null,
      };
    }
    const league = await getLeague();
    return {
      source: "sanity",
      available: league.available,
      tabs: [],
      current: null,
      players: league.teams.map((t) => ({ ...t, team: null })),
      matches: league.matches,
      qualifiers: null,
    };
  },
);

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
        (season.source === "om" || m.stage === "Group Stage"),
    )
    .map((m) => ({
      home: m.home!._id,
      away: m.away!._id,
      homeScore: m.homeScore!,
      awayScore: m.awayScore!,
    }));
}
