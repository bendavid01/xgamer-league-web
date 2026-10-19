import { db } from "./db";
/** Explicit public projection: never return registration or organizer data. */
export async function getPublicAnnouncements() {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await db()<
      { id: string; title: string; message: string }[]
    >`select id,title,message from announcement where tournament_id='xgamer-2026-10' and published=true and deleted_at is null order by id desc limit 20`;
  } catch {
    return null;
  }
}
