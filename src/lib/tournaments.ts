import { cache } from "react";
import { db } from "./db";
import { standings } from "./tournament";

/**
 * Public view of OM tournaments. Explicit columns only — never phone numbers,
 * eFootball IDs or organizer data.
 */
export type PublicTournament = {
  id: string;
  name: string;
  status: "open" | "locked" | "league" | "knockout" | "completed";
  format: "league" | "knockout";
  knockout: boolean;
  qualifiers: number;
  legs: number;
  starts_on: string | null;
  description: string | null;
};

const ACTIVE = ["open", "locked", "league", "knockout"];

export const listTournaments = cache(
  async (): Promise<{
    active: PublicTournament[];
    past: PublicTournament[];
  } | null> => {
    if (!process.env.DATABASE_URL) return null;
    try {
      const rows = await db()<
        PublicTournament[]
      >`select id,name,status,format,knockout,qualifiers,legs,
          to_char(starts_on,'YYYY-MM-DD') as starts_on,description
        from tournament where deleted_at is null and status <> 'draft' order by created_at desc`;
      return {
        active: rows.filter((t) => ACTIVE.includes(t.status)),
        past: rows.filter((t) => t.status === "completed"),
      };
    } catch {
      console.error("Tournament list unavailable");
      return null;
    }
  },
);

export const getTournament = cache(async (id: string) => {
  if (!process.env.DATABASE_URL) return null;
  try {
    const sql = db();
    const [tournament] = await sql<
      PublicTournament[]
    >`select id,name,status,format,knockout,qualifiers,legs,
        to_char(starts_on,'YYYY-MM-DD') as starts_on,description
      from tournament where id=${id} and deleted_at is null and status <> 'draft'`;
    if (!tournament) return null;
    const players = await sql<
      { id: string; name: string; team: string | null }[]
    >`
      select p.id,p.gaming_name as name,p.team_name as team from player p join application a on a.player_id=p.id
      where a.tournament_id=${id} and a.status='approved' and a.deleted_at is null and p.deleted_at is null order by p.gaming_name`;
    const fixtures = await sql<
      {
        id: string;
        home: string;
        away: string;
        round: number;
        home_score: number | null;
        away_score: number | null;
      }[]
    >`select id,home,away,round,home_score,away_score from fixture where tournament_id=${id} and stage='league' and away is not null order by round,slot`;
    const qualified = (
      await sql<
        { player_id: string }[]
      >`select player_id from qualification where tournament_id=${id} order by rank`
    ).map((q) => q.player_id);
    const results = fixtures
      .filter((f) => f.home_score !== null)
      .map((f) => ({
        home: f.home,
        away: f.away,
        homeScore: f.home_score!,
        awayScore: f.away_score!,
      }));
    return {
      tournament,
      players,
      fixtures,
      qualified,
      standings: standings(players, results),
    };
  } catch {
    console.error("Tournament data unavailable");
    return null;
  }
});
