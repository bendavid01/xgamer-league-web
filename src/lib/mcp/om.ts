/**
 * Read-only OM data for Claude (MCP). Every function takes the organizer's live OM role
 * and applies the same rules as the OM screen:
 * - "workspace" access to see a tournament at all;
 * - "registrations" access to see WhatsApp numbers and eFootball IDs (decrypted here, logged).
 */
import { db } from "../db";
import { HttpError } from "../api";
import { allowed, type Actor } from "../access";
import { decrypt } from "../private-data";
import { playerCode } from "../codes";
import { standings, type Entrant } from "../tournament";
import { formatChoice, FORMAT_LABEL, tournamentLabel } from "../labels";

type Row = Record<string, unknown>;

function canSee(user: Actor, tournament: string) {
  if (!allowed(user, "workspace", tournament))
    throw new HttpError(403, "This tournament is not assigned to you.");
}
function canContact(user: Actor, tournament: string) {
  if (!allowed(user, "registrations", tournament))
    throw new HttpError(
      403,
      "Your OM role doesn't include registrations, so contact details are hidden.",
    );
}

async function tournamentRow(id: string) {
  const [t] =
    await db()`select * from tournament where id=${id} and deleted_at is null`;
  if (!t)
    throw new HttpError(
      404,
      "Tournament not found. Use list_tournaments to get the tournament id.",
    );
  return t;
}

const day = (v: unknown) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : ((v as string) ?? null);

const describe = (t: Row) => ({
  id: t.id as string,
  name: tournamentLabel(t as never),
  status: t.status as string,
  format: FORMAT_LABEL[formatChoice(t as never)],
  published: t.published as boolean,
});

/** Records every time Claude reveals private contact details, like any other OM action. */
async function logContactAccess(
  user: Actor,
  tournament: string,
  summary: string,
  count: number,
) {
  await db()`insert into audit_event(actor,actor_name,actor_role,action,entity,tournament_id,summary,affected,after_value)
    values(${user.id},${user.name ?? null},${user.role},'mcp.contacts',${tournament},${tournament},${summary},
    ${`${count} player${count === 1 ? "" : "s"}`},${db().json({ via: "Claude (MCP)", count })})`;
}

/* ─────────────────────────── Tools ─────────────────────────── */

export async function listTournaments(user: Actor) {
  const rows =
    await db()`select t.*, (select count(*)::int from application a where a.tournament_id=t.id and a.deleted_at is null) as registered,
      (select count(*)::int from application a where a.tournament_id=t.id and a.deleted_at is null and a.status='approved') as approved
      from tournament t where t.deleted_at is null order by t.created_at desc`;
  return rows
    .filter((t) => allowed(user, "workspace", t.id))
    .map((t) => ({
      ...describe(t),
      starts_on: day(t.starts_on),
      registered: t.registered,
      approved: t.approved,
    }));
}

export async function tournamentOverview(user: Actor, id: string) {
  canSee(user, id);
  const t = await tournamentRow(id),
    sql = db();
  const counts =
    await sql`select status, count(*)::int as n from application where tournament_id=${id} and deleted_at is null group by status`;
  const [fx] =
    await sql`select count(*)::int as total, count(home_score)::int as played from fixture where tournament_id=${id} and stage='league'`;
  const podium =
    await sql`select d.place, p.gaming_name, p.team_name from podium d join player p on p.id=d.player_id where d.tournament_id=${id} order by d.place`;
  const updates =
    await sql`select title, message, created_at from announcement where tournament_id=${id} and deleted_at is null order by created_at desc limit 5`;
  return {
    ...describe(t),
    starts_on: day(t.starts_on),
    registration_closes: t.registration_closes ?? null,
    entry_fee: t.entry_fee ?? null,
    prize: t.prize ?? null,
    description: t.description ?? null,
    legs: t.legs,
    knockout_qualifiers: t.knockout ? t.qualifiers : null,
    players: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    league_fixtures: { total: fx.total, played: fx.played },
    podium: podium.map((p) => ({
      place: p.place,
      player: p.gaming_name,
      team: p.team_name,
    })),
    latest_updates: updates,
  };
}

export type PlayerStatus = "pending" | "approved" | "rejected" | "waitlisted";

export async function listPlayers(
  user: Actor,
  id: string,
  opts: { status?: PlayerStatus; includeContact?: boolean },
) {
  canSee(user, id);
  if (opts.includeContact) canContact(user, id);
  await tournamentRow(id);
  const rows =
    await db()`select a.status, a.created_at, a.verified_at, p.public_no, p.gaming_name, p.team_name, p.contact_cipher, p.efootball_cipher
      from application a join player p on p.id=a.player_id
      where a.tournament_id=${id} and a.deleted_at is null and p.deleted_at is null
      ${opts.status ? db()`and a.status=${opts.status}` : db()``}
      order by a.created_at`;
  const players = rows.map((r) => ({
    code: playerCode(r.public_no),
    player: r.gaming_name,
    team: r.team_name,
    status: r.status,
    registered_at: r.created_at,
    has_efootball_id: !!r.efootball_cipher,
    ...(opts.includeContact
      ? {
          whatsapp: decrypt(r.contact_cipher),
          efootball_id: r.efootball_cipher ? decrypt(r.efootball_cipher) : null,
        }
      : {}),
  }));
  if (opts.includeContact && players.length)
    await logContactAccess(
      user,
      id,
      "Viewed contact details via Claude",
      players.length,
    );
  return { count: players.length, players };
}

/** Things an organizer should check before closing registration or starting fixtures. */
export async function findIssues(user: Actor, id: string) {
  canSee(user, id);
  await tournamentRow(id);
  const rows =
    await db()`select a.status, p.public_no, p.gaming_name, p.team_name, p.efootball_cipher is not null as has_id
      from application a join player p on p.id=a.player_id
      where a.tournament_id=${id} and a.deleted_at is null and p.deleted_at is null and a.status in ('pending','approved')`;
  const group = (key: (r: Row) => string) => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const k = key(r);
      if (k) map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.values()]
      .filter((g) => g.length > 1)
      .map((g) =>
        g.map((r) => ({
          code: playerCode(r.public_no as number),
          player: r.gaming_name,
          team: r.team_name,
          status: r.status,
        })),
      );
  };
  const norm = (v: unknown) =>
    String(v ?? "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, "");
  return {
    same_player_name: group((r) => norm(r.gaming_name)),
    same_team_name: group((r) => norm(r.team_name)),
    approved_without_efootball_id: rows
      .filter((r) => r.status === "approved" && !r.has_id)
      .map((r) => ({
        code: playerCode(r.public_no as number),
        player: r.gaming_name,
      })),
    pending_review: rows.filter((r) => r.status === "pending").length,
    note: "Each phone number can register only once per tournament, so duplicates here are by name. Check them on WhatsApp before approving.",
  };
}

async function namedFixtures(id: string, round?: number) {
  return db()`select f.round, f.slot, f.home_score, f.away_score,
      h.gaming_name as home, h.team_name as home_team, h.public_no as home_no, h.contact_cipher as home_contact,
      w.gaming_name as away, w.team_name as away_team, w.public_no as away_no, w.contact_cipher as away_contact
    from fixture f join player h on h.id=f.home left join player w on w.id=f.away
    where f.tournament_id=${id} and f.stage='league' ${round ? db()`and f.round=${round}` : db()``}
    order by f.round, f.slot`;
}

export async function listFixtures(
  user: Actor,
  id: string,
  opts: { round?: number; unplayedOnly?: boolean },
) {
  canSee(user, id);
  await tournamentRow(id);
  const rows = (await namedFixtures(id, opts.round)).filter(
    (f) => !opts.unplayedOnly || f.home_score === null,
  );
  return {
    count: rows.length,
    fixtures: rows.map((f) => ({
      round: f.round,
      home: `${f.home} (${f.home_team})`,
      away: f.away ? `${f.away} (${f.away_team})` : "bye",
      score: f.home_score === null ? null : `${f.home_score}-${f.away_score}`,
    })),
  };
}

export async function leagueTable(user: Actor, id: string) {
  canSee(user, id);
  const t = await tournamentRow(id),
    sql = db();
  const entrants = await sql<
    Entrant[]
  >`select p.id, p.gaming_name as name from application a join player p on p.id=a.player_id
    where a.tournament_id=${id} and a.status='approved' and a.deleted_at is null and p.deleted_at is null`;
  const results = (
    await sql`select home, away, home_score, away_score from fixture
      where tournament_id=${id} and stage='league' and home_score is not null and away is not null`
  ).map((f) => ({
    home: f.home as string,
    away: f.away as string,
    homeScore: f.home_score as number,
    awayScore: f.away_score as number,
  }));
  return {
    tournament: tournamentLabel(t as never),
    knockout_qualifiers: t.knockout ? t.qualifiers : null,
    table: standings(entrants, results).map((r, i) => ({
      position: i + 1,
      player: r.name,
      played: r.played,
      won: r.won,
      drawn: r.drawn,
      lost: r.lost,
      goals_for: r.gf,
      goals_against: r.ga,
      goal_difference: r.gd,
      points: r.pts,
    })),
  };
}

/* ─────────────────────────── WhatsApp reminders ─────────────────────────── */

export const DEFAULT_REMINDER =
  "Hi {name}! Reminder from XGamer Pro League about {tournament}.{match} Please be online on time. Good luck! – XGamer";

/** Fills {name} {team} {code} {tournament} {round} {opponent} {opponent_team} {match}; nothing else is interpreted. */
export function fillTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{([a-z_]+)\}/g, (all, key: string) =>
    Object.hasOwn(values, key) ? values[key] : all,
  );
}

export const waLink = (phone: string, text: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

/**
 * Builds wa.me links with the message already typed. Nothing is sent:
 * the organizer opens each link and presses send in WhatsApp.
 */
export async function draftReminders(
  user: Actor,
  id: string,
  opts: {
    audience: "approved" | "pending" | "round";
    round?: number;
    message?: string;
  },
) {
  canSee(user, id);
  canContact(user, id);
  const t = await tournamentRow(id);
  const tournament = tournamentLabel(t as never);
  const template = opts.message?.trim() || DEFAULT_REMINDER;
  type Target = Record<string, string> & { phone: string };
  const targets: Target[] = [];
  if (opts.audience === "round") {
    if (!opts.round)
      throw new HttpError(400, "Give the round number for match reminders.");
    for (const f of await namedFixtures(id, opts.round)) {
      if (f.home_score !== null) continue;
      const sides = [
        [f.home, f.home_team, f.home_no, f.home_contact, f.away, f.away_team],
        [f.away, f.away_team, f.away_no, f.away_contact, f.home, f.home_team],
      ] as const;
      for (const [name, team, no, contact, opp, oppTeam] of sides) {
        if (!name || !contact) continue;
        targets.push({
          phone: decrypt(contact as string),
          name: name as string,
          team: team as string,
          code: playerCode(no as number),
          tournament,
          round: String(opts.round),
          opponent: (opp as string) ?? "a bye",
          opponent_team: (oppTeam as string) ?? "",
          match: opp
            ? ` Your Round ${opts.round} match is against ${opp} (${oppTeam}).`
            : ` You have a bye in Round ${opts.round}.`,
        });
      }
    }
  } else {
    const rows =
      await db()`select p.public_no, p.gaming_name, p.team_name, p.contact_cipher
        from application a join player p on p.id=a.player_id
        where a.tournament_id=${id} and a.status=${opts.audience} and a.deleted_at is null and p.deleted_at is null
        order by a.created_at`;
    for (const r of rows)
      targets.push({
        phone: decrypt(r.contact_cipher),
        name: r.gaming_name,
        team: r.team_name ?? "",
        code: playerCode(r.public_no),
        tournament,
        round: "",
        opponent: "",
        opponent_team: "",
        match: "",
      });
  }
  if (targets.length > 200)
    throw new HttpError(
      400,
      "Too many players at once (max 200). Narrow it down.",
    );
  if (targets.length)
    await logContactAccess(
      user,
      id,
      "Drafted WhatsApp reminders via Claude",
      targets.length,
    );
  return {
    count: targets.length,
    note: "Nothing has been sent. Open each link to review the message in WhatsApp and press send.",
    reminders: targets.map((x) => {
      const message = fillTemplate(template, x);
      return {
        player: x.name,
        team: x.team,
        code: x.code,
        whatsapp: x.phone,
        message,
        link: waLink(x.phone, message),
      };
    }),
  };
}
