import { db } from "./db";
import { standings } from "./tournament";
export async function getCup() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const sql = db(),
      id = "xgamer-2026-10";
    const [tournament] =
      await sql`select name,status,opponents from tournament where id=${id} and deleted_at is null`;
    if (!tournament) return null;
    const players = await sql<
      { id: string; name: string }[]
    >`select p.id,p.gaming_name as name from player p join application a on a.player_id=p.id where a.tournament_id=${id} and a.status='approved' and a.deleted_at is null and p.deleted_at is null order by a.created_at,a.id`;
    const fixtures =
      await sql`select id,home,away,round,stage,slot,home_score,away_score from fixture where tournament_id=${id} order by stage,round,slot`;
    const announcements = await sql<
      { id: string; title: string; message: string }[]
    >`select id,title,message from announcement where tournament_id=${id} and published=true and deleted_at is null order by id desc`;
    const results = fixtures
      .filter((f) => f.stage === "league" && f.home_score !== null)
      .map((f) => ({
        home: f.home as string,
        away: f.away as string,
        homeScore: f.home_score as number,
        awayScore: f.away_score as number,
      }));
    return {
      tournament,
      players,
      fixtures,
      announcements,
      standings: standings(players, results),
    };
  } catch {
    return null;
  }
}
