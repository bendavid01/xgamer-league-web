import { cache } from "react";
import { db } from "./db";
import { standings, type Result } from "./tournament";
import { playerCode } from "./codes";
import { tournamentLabel } from "./labels";

/**
 * Public view of OM tournaments. Explicit columns only — never phone numbers,
 * eFootball IDs or organizer data. Only tournaments switched to "Publish on website".
 */
export type PublicTournament = {
  id: string;
  name: string;
  competition: string | null;
  season: number | null;
  label: string;
  status: "draft" | "open" | "locked" | "league" | "knockout" | "completed";
  format: "league" | "knockout";
  knockout: boolean;
  qualifiers: number;
  legs: number;
  starts_on: string | null;
  description: string | null;
  prize: string | null;
  photo: number | null;
};

export const STATUS_LABEL: Record<PublicTournament["status"], string> = {
  draft: "To be announced",
  open: "Registration open",
  locked: "Registration closed",
  league: "League in progress",
  knockout: "Knockout in eFootball app",
  completed: "Completed",
};

const LIVE = ["open", "locked", "league", "knockout"];

async function rows(where: "all" | string) {
  const sql = db();
  const list = await sql<Omit<PublicTournament, "label">[]>`
    select t.id,t.name,t.competition,t.season,t.status,t.format,t.knockout,t.qualifiers,t.legs,
      to_char(t.starts_on,'YYYY-MM-DD') as starts_on,t.description,t.prize,
      extract(epoch from p.updated_at)::int as photo
    from tournament t left join tournament_photo p on p.tournament_id=t.id
    where t.deleted_at is null and t.published ${where === "all" ? sql`` : sql`and t.id=${where}`}
    order by t.created_at desc`;
  return list.map((t) => ({ ...t, label: tournamentLabel(t) }));
}

/** Live first, then upcoming, then past — the order of the public selector. */
export const listTournaments = cache(
  async (): Promise<{
    live: PublicTournament[];
    upcoming: PublicTournament[];
    past: PublicTournament[];
  } | null> => {
    if (!process.env.DATABASE_URL) return null;
    try {
      const all = await rows("all");
      return {
        // Matches being played first, then registration.
        live: all
          .filter((t) => LIVE.includes(t.status))
          .sort((a, b) => LIVE.indexOf(b.status) - LIVE.indexOf(a.status)),
        upcoming: all
          .filter((t) => t.status === "draft")
          .sort((a, b) =>
            (a.starts_on ?? "9999").localeCompare(b.starts_on ?? "9999"),
          ),
        past: all.filter((t) => t.status === "completed"),
      };
    } catch {
      console.error("Tournament list unavailable");
      return null;
    }
  },
);

export type PublicPlayer = {
  id: string;
  code: string;
  name: string;
  team: string | null;
};
export type PublicFixture = {
  id: string;
  round: number;
  home: string;
  away: string;
  home_score: number | null;
  away_score: number | null;
};

export const getTournament = cache(async (id: string) => {
  if (!process.env.DATABASE_URL) return null;
  try {
    const sql = db();
    const [tournament] = await rows(id);
    if (!tournament) return null;
    const players = (
      await sql<
        { id: string; no: number; name: string; team: string | null }[]
      >`select p.id,p.public_no as no,p.gaming_name as name,p.team_name as team from player p join application a on a.player_id=p.id
        where a.tournament_id=${id} and a.status='approved' and a.deleted_at is null and p.deleted_at is null order by p.gaming_name`
    ).map(({ no, ...p }) => ({ ...p, code: playerCode(no) }));
    const fixtures = await sql<
      PublicFixture[]
    >`select id,round,home,away,home_score,away_score from fixture where tournament_id=${id} and stage='league' and away is not null order by round,slot`;
    const qualified = (
      await sql<
        { player_id: string }[]
      >`select player_id from qualification where tournament_id=${id} order by rank`
    ).map((q) => q.player_id);
    const podiumRows = await sql<
      { place: number; player_id: string }[]
    >`select place,player_id from podium where tournament_id=${id}`;
    const podium = [1, 2, 3].map(
      (n) => podiumRows.find((r) => r.place === n)?.player_id ?? null,
    );
    const updates = await sql<
      { id: string; title: string; message: string; created_at: string }[]
    >`select id,title,message,created_at::text as created_at from announcement
      where tournament_id=${id} and published and deleted_at is null order by created_at desc limit 50`;
    return {
      tournament,
      updates,
      players,
      fixtures,
      qualified,
      podium,
      standings: standings(players, played(fixtures)),
    };
  } catch {
    console.error("Tournament data unavailable");
    return null;
  }
});

export const played = (fixtures: PublicFixture[]): Result[] =>
  fixtures
    .filter((f) => f.home_score !== null && f.away_score !== null)
    .map((f) => ({
      home: f.home,
      away: f.away,
      homeScore: f.home_score!,
      awayScore: f.away_score!,
    }));

/** Champions shelf: every finished, published tournament with a recorded winner. */
export const getChampions = cache(async () => {
  if (!process.env.DATABASE_URL) return [];
  try {
    const list = await db()<
      (Omit<
        PublicTournament,
        | "label"
        | "status"
        | "starts_on"
        | "description"
        | "prize"
        | "qualifiers"
        | "legs"
        | "knockout"
        | "format"
      > & {
        place: number;
        no: number;
        player: string;
        team: string | null;
      })[]
    >`select t.id,t.name,t.competition,t.season,extract(epoch from ph.updated_at)::int as photo,
        po.place,p.public_no as no,p.gaming_name as player,p.team_name as team
      from tournament t join podium po on po.tournament_id=t.id join player p on p.id=po.player_id
      left join tournament_photo ph on ph.tournament_id=t.id
      where t.published and t.deleted_at is null and t.status='completed'
      order by t.created_at desc, po.place`;
    const out = new Map<
      string,
      {
        id: string;
        label: string;
        name: string;
        competition: string | null;
        season: number | null;
        photo: number | null;
        places: {
          place: number;
          code: string;
          name: string;
          team: string | null;
        }[];
      }
    >();
    for (const r of list) {
      const entry = out.get(r.id) ?? {
        id: r.id,
        label: tournamentLabel(r),
        name: r.name,
        competition: r.competition,
        season: r.season,
        photo: r.photo,
        places: [],
      };
      entry.places.push({
        place: r.place,
        code: playerCode(r.no),
        name: r.player,
        team: r.team,
      });
      out.set(r.id, entry);
    }
    return [...out.values()].filter((e) => e.places.some((p) => p.place === 1));
  } catch {
    console.error("Champions unavailable");
    return [];
  }
});
