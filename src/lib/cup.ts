import { cache } from "react";
import { db } from "./db";
import { standings } from "./tournament";
import { TOURNAMENT_ID } from "./current";

/**
 * Public view of the OM tournament. Explicit columns only: never phone numbers,
 * eFootball IDs or organizer data.
 */
export const getCup = cache(async () => {
  if (!process.env.DATABASE_URL) return null;
  try {
    const sql = db();
    const [tournament] = await sql<
      { name: string; status: string; format: string; qualifiers: number }[]
    >`select name,status,format,qualifiers from tournament where id=${TOURNAMENT_ID} and deleted_at is null`;
    if (!tournament) return null;
    const players = await sql<
      { id: string; name: string; team: string | null }[]
    >`select p.id,p.gaming_name as name,p.team_name as team from player p join application a on a.player_id=p.id
      where a.tournament_id=${TOURNAMENT_ID} and a.status='approved' and a.deleted_at is null and p.deleted_at is null order by p.gaming_name`;
    const fixtures = await sql<
      {
        id: string;
        home: string;
        away: string | null;
        round: number;
        stage: "league" | "knockout";
        slot: number;
        home_score: number | null;
        away_score: number | null;
        winner: string | null;
      }[]
    >`select id,home,away,round,stage,slot,home_score,away_score,winner from fixture where tournament_id=${TOURNAMENT_ID} order by stage desc,round,slot`;
    const announcements = await sql<
      { id: string; title: string; message: string }[]
    >`select id,title,message from announcement where tournament_id=${TOURNAMENT_ID} and published=true and deleted_at is null order by id desc`;
    const results = fixtures
      .filter((f) => f.stage === "league" && f.away && f.home_score !== null)
      .map((f) => ({
        home: f.home,
        away: f.away!,
        homeScore: f.home_score!,
        awayScore: f.away_score!,
      }));
    return {
      tournament,
      players,
      fixtures,
      announcements,
      standings: standings(players, results),
    };
  } catch {
    console.error("Tournament data unavailable");
    return null;
  }
});
