import { cache } from "react";
import { client } from "./sanity/client";
export type LeagueTeam = { _id: string; name: string; group: string | null };
export type LeagueMatch = {
  _id: string;
  status: string;
  stage: string | null;
  homeScore: number | null;
  awayScore: number | null;
  home: LeagueTeam | null;
  away: LeagueTeam | null;
};
export const getLeague = cache(
  async (): Promise<{
    teams: LeagueTeam[];
    matches: LeagueMatch[];
    available: boolean;
  }> => {
    try {
      const data = await client.fetch<{
        teams: LeagueTeam[];
        matches: LeagueMatch[];
      }>(
        `{
      "teams": *[_type == "team" && !(_id in path("drafts.**"))] | order(name asc) {_id,name,group},
      "matches": *[_type == "match" && deleted != true && !(_id in path("drafts.**"))] | order(_createdAt asc) {_id,status,stage,homeScore,awayScore,"home":homeTeam->{_id,name,group},"away":awayTeam->{_id,name,group}}
    }`,
        {},
        { next: { revalidate: 30 }, timeout: 10000 },
      );
      return {
        teams: data.teams ?? [],
        matches: data.matches ?? [],
        available: true,
      };
    } catch {
      console.error("League content unavailable");
      return { teams: [], matches: [], available: false };
    }
  },
);
export function validCompleted(matches: LeagueMatch[]) {
  return matches.filter(
    (m) =>
      m.status === "completed" &&
      m.home &&
      m.away &&
      Number.isInteger(m.homeScore) &&
      Number.isInteger(m.awayScore) &&
      m.homeScore! >= 0 &&
      m.awayScore! >= 0 &&
      m.homeScore! <= 99 &&
      m.awayScore! <= 99 &&
      m.home._id !== m.away._id,
  );
}
