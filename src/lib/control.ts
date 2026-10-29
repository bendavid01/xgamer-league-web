import { randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { actor, HttpError } from "./api";
import { decrypt, encrypt, fingerprint } from "./private-data";
import {
  buildLeague,
  qualifyTopN,
  standings,
  type Entrant,
} from "./tournament";
import { allowed, adminIds, type Actor } from "./access";
import { efootballIdInput } from "./registration";

/* ─────────────────────────── Commands ─────────────────────────── */

const uuid = z.string().uuid();
const tid = z.string().regex(/^[a-z0-9-]{3,80}$/);
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable();
const command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(2).max(80),
    format: z.enum(["league", "knockout"]),
  }),
  z.object({
    action: z.literal("configure"),
    tournament: tid,
    revision: z.number().int(),
    name: z.string().trim().min(2).max(80),
    format: z.enum(["league", "knockout"]),
    knockout: z.boolean(),
    qualifiers: z.union([
      z.literal(2),
      z.literal(4),
      z.literal(8),
      z.literal(16),
      z.literal(32),
    ]),
    legs: z.union([z.literal(1), z.literal(2)]),
    perPlayer: z.number().int().min(1).max(127).nullable(),
    startsOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    registrationCloses: z.string().datetime({ offset: true }).nullable(),
    entryFee: z.number().int().min(0).max(1_000_000).nullable(),
    prize: text(80),
    description: text(400),
  }),
  z.object({
    action: z.literal("registration"),
    tournament: tid,
    open: z.boolean(),
  }),
  z.object({
    action: z.literal("review"),
    tournament: tid,
    items: z
      .array(z.object({ id: uuid, revision: z.number().int() }))
      .min(1)
      .max(200),
    status: z.enum(["approved", "rejected", "pending"]),
    verified: z.boolean(),
  }),
  z.object({
    action: z.literal("remove"),
    tournament: tid,
    id: uuid,
    revision: z.number().int(),
  }),
  z.object({
    action: z.literal("efootball"),
    tournament: tid,
    playerId: uuid,
    efootballId: efootballIdInput,
  }),
  z.object({
    action: z.literal("generate"),
    tournament: tid,
    shuffle: z.boolean(),
  }),
  z.object({ action: z.literal("reset"), tournament: tid }),
  z.object({
    action: z.literal("score"),
    tournament: tid,
    id: uuid,
    revision: z.number().int(),
    homeScore: z.number().int().min(0).max(99),
    awayScore: z.number().int().min(0).max(99),
  }),
  z.object({
    action: z.literal("qualify"),
    tournament: tid,
    playoffWinners: z.array(uuid).max(32).optional(),
    evidence: z.string().trim().min(10).max(2000).optional(),
  }),
  z.object({ action: z.literal("start"), tournament: tid }),
  z.object({ action: z.literal("complete"), tournament: tid }),
  z.object({
    action: z.literal("announce"),
    tournament: tid,
    title: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(2000),
  }),
  z.object({
    action: z.literal("coordinator"),
    discordId: z.string().regex(/^\d{17,20}$/),
    operations: z.array(z.enum(["registrations", "results", "announcements"])),
    active: z.boolean(),
  }),
]);
export type Command = z.infer<typeof command>;
export const parseCommand = (raw: unknown) => command.parse(raw);

const OPERATION: Record<Command["action"], Parameters<typeof actor>[0]> = {
  create: "tournaments",
  configure: "tournaments",
  registration: "tournaments",
  generate: "tournaments",
  reset: "tournaments",
  qualify: "tournaments",
  start: "tournaments",
  complete: "tournaments",
  review: "registrations",
  efootball: "registrations",
  remove: "delete",
  score: "results",
  announce: "announcements",
  coordinator: "roles",
};

export const playerCode = (n: number | null | undefined) =>
  n ? `XG-${String(n).padStart(4, "0")}` : "XG-????";

/** Fisher–Yates with a cryptographic RNG, for a fair random draw. */
export function shuffled<T>(items: T[]) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function slugFor(name: string) {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "tournament";
  return `${base}-${randomBytes(2).toString("hex")}`;
}

/* ─────────────────────────── Reads ─────────────────────────── */

/** OM home: every tournament (no player counts) plus shared areas for admins. */
export async function home() {
  const user = await actor("workspace", "*");
  const sql = db();
  const tournaments =
    await sql`select id,name,status,format,knockout,qualifiers,legs,created_at from tournament where deleted_at is null order by created_at desc`;
  const audit = user.role === "admin" ? await recentAudit() : [];
  const coordinators =
    user.role === "admin"
      ? await sql`select discord_id,operations,active from coordinator order by discord_id`
      : [];
  return { user: publicUser(user), tournaments, audit, coordinators };
}

export async function snapshot(tournament: string) {
  const user = await actor("workspace", tournament),
    sql = db();
  const [t] =
    await sql`select * from tournament where id=${tournament} and deleted_at is null`;
  if (!t) throw new HttpError(404, "Tournament not found.");
  const applications =
    await sql`select a.id,a.status,a.revision,a.created_at,p.id as player_id,p.public_no,p.gaming_name,p.team_name,p.contact_cipher,p.efootball_cipher
      from application a join player p on p.id=a.player_id
      where a.tournament_id=${tournament} and a.deleted_at is null order by a.created_at`;
  const fixtures =
    await sql`select id,stage,round,slot,home,away,home_score,away_score,revision from fixture where tournament_id=${tournament} and stage='league' order by round,slot`;
  const qualified =
    await sql`select player_id from qualification where tournament_id=${tournament} order by rank`;
  const entrants = applications
    .filter((a) => a.status === "approved")
    .map((p) => ({ id: p.player_id as string, name: p.gaming_name as string }));
  const results = fixtures
    .filter((f) => f.home_score !== null)
    .map((f) => ({
      home: f.home,
      away: f.away,
      homeScore: f.home_score,
      awayScore: f.away_score,
    }));
  const privateAccess = allowed(user, "registrations", tournament);
  return {
    user: publicUser(user),
    tournament: t,
    applications: applications.map((a) => ({
      id: a.id,
      player_id: a.player_id,
      code: playerCode(a.public_no),
      gaming_name: a.gaming_name,
      team_name: a.team_name,
      status: a.status,
      revision: a.revision,
      ...(privateAccess
        ? {
            phone: decrypt(a.contact_cipher),
            efootballId: a.efootball_cipher
              ? decrypt(a.efootball_cipher)
              : null,
          }
        : {}),
    })),
    fixtures,
    standings: standings(entrants, results),
    qualified: qualified.map((q) => q.player_id as string),
    announcements:
      await sql`select id,title,message from announcement where tournament_id=${tournament} and deleted_at is null order by id desc`,
  };
}

const publicUser = (u: Actor) => ({
  role: u.role,
  operations: u.operations,
  name: u.name ?? null,
});

function recentAudit() {
  return db()`select e.id,e.created_at,e.actor,e.actor_name,e.actor_role,e.action,e.summary,e.affected,t.name as tournament_name,e.before_value,e.after_value
    from audit_event e left join tournament t on t.id=coalesce(e.tournament_id,e.entity) order by e.id desc limit 300`;
}

/* ─────────────────────────── Writes ─────────────────────────── */

export async function execute(raw: unknown) {
  const parsed = command.safeParse(raw);
  if (!parsed.success)
    throw new HttpError(400, "Check the details and try again.");
  const c = parsed.data;
  const scope = "tournament" in c ? c.tournament : "*";
  const user = await actor(OPERATION[c.action], scope);
  return run(user, c);
}

type Who = Pick<Actor, "id" | "role"> & { name?: string };

/** Applies an already-authorized command. Exported for integration tests. */
export async function run(user: Who, c: Command) {
  return db().begin(async (tx) => {
    let summary = "",
      affected: string | null = null,
      before: Record<string, unknown> = {},
      after: Record<string, unknown> = {};
    const tournamentId = "tournament" in c ? c.tournament : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let T: Record<string, any> = {};
    if (tournamentId) {
      const [row] =
        await tx`select * from tournament where id=${tournamentId} and deleted_at is null for update`;
      if (!row) throw new HttpError(404, "Tournament not found.");
      T = row;
    }
    const fieldOpen = ["draft", "open", "locked"].includes(T.status);
    const names = async (playerIds: string[]) => {
      if (!playerIds.length) return "";
      const rows =
        await tx`select gaming_name from player where id = any(${playerIds}) order by gaming_name`;
      return rows.map((r) => r.gaming_name).join(", ");
    };
    const approved = () =>
      tx<
        Entrant[]
      >`select p.id,p.gaming_name as name from application a join player p on p.id=a.player_id
        where a.tournament_id=${tournamentId} and a.status='approved' and a.deleted_at is null and p.deleted_at is null order by a.created_at,a.id`;

    if (c.action === "create") {
      const id = slugFor(c.name);
      await tx`insert into tournament(id,name,format,knockout,qualifiers,legs,status) values(${id},${c.name},${c.format},false,8,1,'draft')`;
      summary = `Created tournament (${c.format === "league" ? "League" : "Knockout only"})`;
      await log(
        tx,
        user,
        c.action,
        id,
        id,
        summary,
        c.name,
        {},
        { id, name: c.name, format: c.format },
      );
      return { ok: true, id };
    } else if (c.action === "configure") {
      if (T.revision !== c.revision)
        throw new HttpError(
          409,
          "Someone else changed this tournament. Refresh and try again.",
        );
      const knockout = c.format === "league" && c.knockout;
      const structural =
        c.format !== T.format ||
        knockout !== T.knockout ||
        c.legs !== T.legs ||
        (c.perPlayer ?? null) !== (T.opponents ?? null) ||
        c.qualifiers !== T.qualifiers;
      if (structural && !fieldOpen)
        throw new HttpError(
          409,
          "Format settings are locked once fixtures exist. Reset fixtures to change them.",
        );
      before = {
        name: T.name,
        format: T.format,
        knockout: T.knockout,
        qualifiers: T.qualifiers,
        legs: T.legs,
        perPlayer: T.opponents,
      };
      [after] =
        await tx`update tournament set name=${c.name},format=${c.format},knockout=${knockout},qualifiers=${c.qualifiers},legs=${c.legs},opponents=${c.perPlayer},
          starts_on=${c.startsOn},registration_closes=${c.registrationCloses},entry_fee=${c.entryFee},prize=${c.prize},description=${c.description},revision=revision+1
          where id=${tournamentId} returning name,format,knockout,qualifiers,legs,opponents as "perPlayer"`;
      summary = "Updated tournament settings";
    } else if (c.action === "registration") {
      if (!fieldOpen)
        throw new HttpError(
          409,
          "Registration can't change after fixtures exist.",
        );
      const status = c.open ? "open" : "locked";
      await tx`update tournament set status=${status},revision=revision+1 where id=${tournamentId}`;
      before = { status: T.status };
      after = { status };
      summary = c.open ? "Opened registration" : "Closed registration";
    } else if (c.action === "review") {
      if (!fieldOpen)
        throw new HttpError(
          409,
          "Players are locked once fixtures exist. Reset fixtures first.",
        );
      if (c.status === "approved" && !c.verified)
        throw new HttpError(
          400,
          "Confirm you verified these players on WhatsApp first.",
        );
      const changed: string[] = [];
      for (const item of c.items) {
        const [a] =
          await tx`select * from application where id=${item.id} and tournament_id=${tournamentId} and deleted_at is null for update`;
        if (!a || a.revision !== item.revision)
          throw new HttpError(
            409,
            "A player changed meanwhile. Refresh and try again.",
          );
        await tx`update application set status=${c.status},verified_at=${c.status === "approved" ? new Date() : null},revision=revision+1 where id=${item.id}`;
        changed.push(a.player_id);
      }
      affected = await names(changed);
      summary = {
        approved: "Approved",
        rejected: "Rejected",
        pending: "Moved back to pending",
      }[c.status];
      after = { status: c.status, players: changed };
    } else if (c.action === "remove") {
      if (!fieldOpen)
        throw new HttpError(
          409,
          "Players can't be removed once fixtures exist. Reset fixtures first.",
        );
      const [a] =
        await tx`select * from application where id=${c.id} and tournament_id=${tournamentId} and deleted_at is null for update`;
      if (!a || a.revision !== c.revision)
        throw new HttpError(409, "This player changed. Refresh and try again.");
      await tx`update application set deleted_at=now(),status='withdrawn',revision=revision+1 where id=${c.id}`;
      affected = await names([a.player_id]);
      before = { status: a.status };
      after = { status: "removed" };
      summary = "Removed player from tournament";
    } else if (c.action === "efootball") {
      const [p] =
        await tx`select p.id,p.efootball_cipher from player p join application a on a.player_id=p.id
          where p.id=${c.playerId} and a.tournament_id=${tournamentId} and a.status='approved' and a.deleted_at is null for update of p`;
      if (!p)
        throw new HttpError(
          404,
          "Approve the player before adding an eFootball ID.",
        );
      const hash = fingerprint("ef:" + c.efootballId);
      const [taken] =
        await tx`select id from player where efootball_hash=${hash} and id<>${c.playerId}`;
      if (taken)
        throw new HttpError(
          409,
          "That eFootball ID belongs to another player.",
        );
      await tx`update player set efootball_hash=${hash},efootball_cipher=${encrypt(c.efootballId)} where id=${c.playerId}`;
      affected = await names([c.playerId]);
      before = { hadId: !!p.efootball_cipher };
      after = { efootballId: "[REDACTED]" };
      summary = p.efootball_cipher
        ? "Changed eFootball ID"
        : "Added eFootball ID";
    } else if (c.action === "generate") {
      if (T.format !== "league")
        throw new HttpError(
          409,
          "Knockout-only tournaments are played in the eFootball app; there are no league fixtures.",
        );
      if (T.status !== "locked")
        throw new HttpError(
          409,
          "Close registration before generating fixtures.",
        );
      const players = await approved();
      if (players.length < 2)
        throw new HttpError(409, "Approve at least two players first.");
      if (T.knockout && T.qualifiers >= players.length)
        throw new HttpError(
          409,
          `Top ${T.qualifiers} needs more than ${T.qualifiers} approved players.`,
        );
      const order = c.shuffle ? shuffled(players) : players;
      let fixtures;
      try {
        fixtures = buildLeague(order, T.legs, T.opponents);
      } catch (error) {
        throw new HttpError(409, (error as Error).message);
      }
      for (const f of fixtures)
        await tx`insert into fixture(tournament_id,stage,round,slot,home,away) values(${tournamentId},'league',${f.round},${Number(f.id.split("-").at(-1))},${f.home},${f.away})`;
      await tx`update tournament set status='league',revision=revision+1 where id=${tournamentId}`;
      summary = `Generated ${fixtures.length} league fixtures${c.shuffle ? " (random draw)" : ""}`;
      after = {
        fixtures: fixtures.length,
        legs: T.legs,
        perPlayer: T.opponents,
      };
    } else if (c.action === "reset") {
      if (T.status !== "league")
        throw new HttpError(409, "There are no fixtures to reset.");
      const [scored] =
        await tx`select count(*)::int as n from fixture where tournament_id=${tournamentId} and home_score is not null`;
      if (scored.n > 0)
        throw new HttpError(
          409,
          "Scores are already recorded, so fixtures can no longer be reset.",
        );
      await tx`delete from fixture where tournament_id=${tournamentId}`;
      await tx`update tournament set status='locked',revision=revision+1 where id=${tournamentId}`;
      summary = "Reset fixtures";
    } else if (c.action === "score") {
      const [f] =
        await tx`select * from fixture where id=${c.id} and tournament_id=${tournamentId} for update`;
      if (!f || f.revision !== c.revision)
        throw new HttpError(409, "This match changed. Refresh and try again.");
      if (T.status !== "league")
        throw new HttpError(
          409,
          "League scores are frozen after the league ends.",
        );
      before = { home: f.home_score, away: f.away_score };
      await tx`update fixture set home_score=${c.homeScore},away_score=${c.awayScore},revision=revision+1 where id=${c.id}`;
      after = { home: c.homeScore, away: c.awayScore };
      const [h, a] = await Promise.all([names([f.home]), names([f.away])]);
      affected = `${h} ${c.homeScore}–${c.awayScore} ${a}`;
      summary = f.home_score === null ? "Entered score" : "Corrected score";
    } else if (c.action === "qualify") {
      if (T.format !== "league" || !T.knockout || T.status !== "league")
        throw new HttpError(
          409,
          "Qualifiers are confirmed after the league, when knockout is switched on.",
        );
      const league =
        await tx`select * from fixture where tournament_id=${tournamentId} and stage='league'`;
      if (league.some((f) => f.home_score === null))
        throw new HttpError(409, "Enter every league score first.");
      if (c.playoffWinners?.length && !c.evidence)
        throw new HttpError(400, "Note how the playoff was decided.");
      let top;
      try {
        top = qualifyTopN(
          await approved(),
          league.map((f) => ({
            home: f.home,
            away: f.away,
            homeScore: f.home_score,
            awayScore: f.away_score,
          })),
          T.qualifiers,
          c.playoffWinners,
        );
      } catch (error) {
        throw new HttpError(409, (error as Error).message);
      }
      for (let i = 0; i < top.length; i++)
        await tx`insert into qualification(tournament_id,player_id,rank) values(${tournamentId},${top[i].id},${i + 1})`;
      await tx`update tournament set status='knockout',revision=revision+1 where id=${tournamentId}`;
      affected = top.map((p) => p.name).join(", ");
      summary = `Confirmed Top ${T.qualifiers} for the knockout (eFootball app)`;
      after = { qualified: top.map((p) => p.id), evidence: c.evidence ?? null };
    } else if (c.action === "start") {
      if (T.format !== "knockout" || T.status !== "locked")
        throw new HttpError(
          409,
          "Close registration first. This is for knockout-only tournaments.",
        );
      await tx`update tournament set status='knockout',revision=revision+1 where id=${tournamentId}`;
      summary = "Started knockout (eFootball app)";
    } else if (c.action === "complete") {
      if (T.status === "league") {
        if (T.knockout)
          throw new HttpError(409, "Confirm the qualifiers first.");
        const [open] =
          await tx`select count(*)::int as n from fixture where tournament_id=${tournamentId} and home_score is null`;
        if (open.n > 0)
          throw new HttpError(
            409,
            "Enter every score before finishing the league.",
          );
      } else if (T.status !== "knockout")
        throw new HttpError(409, "Nothing to finish yet.");
      await tx`update tournament set status='completed',revision=revision+1 where id=${tournamentId}`;
      summary = "Marked tournament completed";
    } else if (c.action === "announce") {
      const [row] =
        await tx`insert into announcement(tournament_id,title,message,published) values(${tournamentId},${c.title},${c.message},true) returning id`;
      summary = "Published announcement";
      affected = c.title;
      after = { id: row.id };
    } else if (c.action === "coordinator") {
      if (adminIds().includes(c.discordId))
        throw new HttpError(400, "Main admins always keep full access.");
      const [old] =
        await tx`select operations,active from coordinator where discord_id=${c.discordId}`;
      before = old ?? {};
      await tx`insert into coordinator(discord_id,operations,tournaments,active) values(${c.discordId},${c.operations},${["*"]},${c.active})
        on conflict(discord_id) do update set operations=excluded.operations,tournaments=excluded.tournaments,active=excluded.active`;
      after = { operations: c.operations, active: c.active };
      summary = c.active
        ? "Saved coordinator access"
        : "Removed coordinator access";
      affected = c.discordId;
    }
    await log(
      tx,
      user,
      c.action,
      tournamentId ?? "*",
      tournamentId,
      summary,
      affected,
      before,
      after,
    );
    return { ok: true };
  });
}

async function log(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  user: Who,
  action: string,
  entity: string,
  tournament: string | null,
  summary: string,
  affected: string | null,
  before: unknown,
  after: unknown,
) {
  await tx`insert into audit_event(actor,actor_name,actor_role,action,entity,tournament_id,summary,affected,before_value,after_value)
    values(${user.id},${user.name ?? null},${user.role},${action},${entity},${tournament},${summary},${affected},${tx.json(before)},${tx.json(after)})`;
}
