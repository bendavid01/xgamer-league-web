import { randomInt } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { actor, HttpError } from "./api";
import { decrypt, encrypt, fingerprint } from "./private-data";
import {
  advanceKnockout,
  firstFixtures,
  knockout,
  qualifyTopN,
  standings,
  type Entrant,
} from "./tournament";
import { allowed, adminIds } from "./access";
import { efootballIdInput } from "./registration";

const uuid = z.string().uuid();
const command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("review"),
    items: z
      .array(z.object({ id: uuid, revision: z.number().int() }))
      .min(1)
      .max(200),
    status: z.enum(["approved", "rejected", "pending"]),
    verified: z.boolean(),
  }),
  z.object({
    action: z.literal("efootball"),
    playerId: uuid,
    efootballId: efootballIdInput,
  }),
  z.object({
    action: z.literal("delete"),
    id: uuid,
    revision: z.number().int(),
  }),
  z.object({
    action: z.literal("configure"),
    revision: z.number().int(),
    name: z.string().trim().min(2).max(80),
    status: z.enum(["draft", "open", "locked"]),
    format: z.enum(["league", "knockout", "league_knockout"]),
    qualifiers: z.union([
      z.literal(2),
      z.literal(4),
      z.literal(8),
      z.literal(16),
      z.literal(32),
    ]),
    opponents: z.number().int().min(1).max(63).nullable(),
  }),
  z.object({ action: z.literal("generate"), shuffle: z.boolean() }),
  z.object({ action: z.literal("reset") }),
  z.object({
    action: z.literal("qualify"),
    playoffWinners: z.array(uuid).max(32).optional(),
    evidence: z.string().trim().min(10).max(2000).optional(),
  }),
  z.object({ action: z.literal("advance") }),
  z.object({ action: z.literal("complete") }),
  z.object({
    action: z.literal("score"),
    id: uuid,
    revision: z.number().int(),
    homeScore: z.number().int().min(0).max(99),
    awayScore: z.number().int().min(0).max(99),
    winner: uuid.optional(),
  }),
  z.object({
    action: z.literal("announce"),
    title: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(2000),
  }),
  z.object({
    action: z.literal("coordinator"),
    discordId: z.string().regex(/^\d{17,20}$/),
    operations: z.array(z.enum(["registrations", "results", "announcements"])),
    active: z.boolean(),
  }),
  z.object({
    action: z.literal("finals"),
    credentials: z.string().min(1).max(2000),
    released: z.boolean(),
  }),
]);
export type Command = z.infer<typeof command>;
export const parseCommand = (raw: unknown) => command.parse(raw);

const OPERATION: Record<Command["action"], Parameters<typeof actor>[0]> = {
  review: "registrations",
  efootball: "registrations",
  score: "results",
  announce: "announcements",
  coordinator: "roles",
  delete: "delete",
  finals: "finals",
  configure: "tournaments",
  generate: "tournaments",
  reset: "tournaments",
  qualify: "tournaments",
  advance: "tournaments",
  complete: "tournaments",
};

/** Fisher–Yates with a cryptographic RNG, for a fair random draw. */
export function shuffled<T>(items: T[]) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const slotOf = (id: string) => Number(id.split("-").at(-1));

export async function snapshot(tournament: string) {
  const user = await actor("workspace", tournament),
    sql = db();
  const [t] = await sql`select * from tournament where id=${tournament}`;
  const applications =
    await sql`select a.id,a.status,a.revision,a.verified_at,a.created_at,p.id as player_id,p.gaming_name,p.team_name,p.contact_cipher,p.efootball_cipher
      from application a join player p on p.id=a.player_id
      where a.tournament_id=${tournament} and a.deleted_at is null order by a.created_at`;
  const fixtures =
    await sql`select * from fixture where tournament_id=${tournament} order by stage desc,round,slot`;
  const entrants = applications
    .filter((a) => a.status === "approved")
    .map((p) => ({ id: p.player_id as string, name: p.gaming_name as string }));
  const results = fixtures
    .filter((f) => f.stage === "league" && f.home_score !== null)
    .map((f) => ({
      home: f.home as string,
      away: f.away as string,
      homeScore: f.home_score as number,
      awayScore: f.away_score as number,
    }));
  const audit =
    user.role === "admin"
      ? await sql`select * from audit_event order by id desc limit 200`
      : [];
  const privateAccess = allowed(user, "registrations", tournament);
  return {
    user,
    tournament: t,
    applications: applications.map((a) => ({
      id: a.id,
      player_id: a.player_id,
      gaming_name: a.gaming_name,
      team_name: a.team_name,
      status: a.status,
      revision: a.revision,
      verified_at: a.verified_at,
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
    audit,
  };
}

export async function execute(tournament: string, raw: unknown) {
  const parsed = command.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "Invalid operation details.");
  const user = await actor(OPERATION[parsed.data.action], tournament);
  return run(user.id, tournament, parsed.data);
}

/** Applies an already-authorized command. Exported for integration tests only. */
export async function run(actorId: string, tournament: string, c: Command) {
  const user = { id: actorId };
  return db().begin(async (tx) => {
    const [t] =
      await tx`select * from tournament where id=${tournament} and deleted_at is null for update`;
    if (!t) throw new HttpError(404, "Tournament not found.");
    let before: Record<string, unknown> = {},
      after: Record<string, unknown> = {};
    const fieldOpen = ["draft", "open", "locked"].includes(t.status);

    const approved = () =>
      tx<
        (Entrant & { has_id: boolean })[]
      >`select p.id,p.gaming_name as name,(p.efootball_cipher is not null) as has_id from application a join player p on p.id=a.player_id
        where a.tournament_id=${tournament} and a.status='approved' and a.deleted_at is null and p.deleted_at is null order by a.created_at,a.id`;
    const insertFixtures = async (
      stage: "league" | "knockout",
      list: {
        id: string;
        round: number;
        home: string | null;
        away: string | null;
      }[],
    ) => {
      for (const f of list) {
        // A first-round knockout bye: the present player advances automatically.
        const home = f.home ?? f.away!,
          away = f.home ? f.away : null;
        await tx`insert into fixture(tournament_id,stage,round,slot,home,away,winner) values(${tournament},${stage},${f.round},${slotOf(f.id)},${home},${away},${away ? null : home})`;
      }
    };

    if (c.action === "review") {
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
      const changed: unknown[] = [];
      for (const item of c.items) {
        const [a] =
          await tx`select * from application where id=${item.id} and tournament_id=${tournament} and deleted_at is null for update`;
        if (!a || a.revision !== item.revision)
          throw new HttpError(
            409,
            "A player changed meanwhile. Refresh and try again.",
          );
        const [row] =
          await tx`update application set status=${c.status},verified_at=${c.status === "approved" ? new Date() : null},revision=revision+1 where id=${item.id} returning id,status`;
        changed.push({ id: a.id, from: a.status, to: row.status });
      }
      after = { changed };
    } else if (c.action === "efootball") {
      const [p] =
        await tx`select p.id,p.efootball_cipher from player p join application a on a.player_id=p.id
          where p.id=${c.playerId} and a.tournament_id=${tournament} and a.status='approved' and a.deleted_at is null for update of p`;
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
      before = { hadId: !!p.efootball_cipher };
      after = { playerId: c.playerId, efootballId: "[REDACTED]" };
    } else if (c.action === "delete") {
      const [a] =
        await tx`select * from application where id=${c.id} and tournament_id=${tournament} and deleted_at is null for update`;
      if (!a || a.revision !== c.revision)
        throw new HttpError(
          409,
          "This player changed. Refresh before editing.",
        );
      if (!fieldOpen)
        throw new HttpError(409, "Players are locked once fixtures exist.");
      before = { status: a.status };
      [after] =
        await tx`update application set deleted_at=now(),status='withdrawn',revision=revision+1 where id=${c.id} returning id,status`;
    } else if (c.action === "configure") {
      if (!fieldOpen || t.revision !== c.revision)
        throw new HttpError(
          409,
          "Tournament changed or already started. Refresh first.",
        );
      before = {
        name: t.name,
        status: t.status,
        format: t.format,
        qualifiers: t.qualifiers,
        opponents: t.opponents,
      };
      [after] =
        await tx`update tournament set name=${c.name},status=${c.status},format=${c.format},qualifiers=${c.qualifiers},opponents=${c.opponents},revision=revision+1
          where id=${tournament} returning name,status,format,qualifiers,opponents`;
    } else if (c.action === "generate") {
      if (t.status !== "locked")
        throw new HttpError(
          409,
          "Close registration before generating fixtures.",
        );
      const players = await approved();
      if (players.length < 2)
        throw new HttpError(409, "Approve at least two players first.");
      const missing = players.filter((p) => !p.has_id).map((p) => p.name);
      if (missing.length)
        throw new HttpError(
          409,
          `Add eFootball IDs first for: ${missing.join(", ")}.`,
        );
      if (t.format === "league_knockout" && t.qualifiers >= players.length)
        throw new HttpError(
          409,
          `Top ${t.qualifiers} needs more than ${t.qualifiers} approved players.`,
        );
      const order = c.shuffle ? shuffled(players) : players;
      const entrants = order.map(({ id, name }) => ({ id, name }));
      let plan;
      try {
        plan = firstFixtures(t.format, entrants, t.opponents);
      } catch (error) {
        throw new HttpError(409, (error as Error).message);
      }
      await insertFixtures(plan.stage, plan.fixtures);
      await tx`update tournament set status=${plan.stage},revision=revision+1 where id=${tournament}`;
      after = {
        format: t.format,
        seeding: entrants.map((e) => e.id),
        fixtureCount: plan.fixtures.length,
      };
    } else if (c.action === "reset") {
      if (!["league", "knockout"].includes(t.status))
        throw new HttpError(409, "There are no fixtures to reset.");
      const [scored] =
        await tx`select count(*)::int as n from fixture where tournament_id=${tournament} and home_score is not null`;
      if (scored.n > 0)
        throw new HttpError(
          409,
          "Scores are already recorded. Fixtures can no longer be reset.",
        );
      const [removed] =
        await tx`with d as (delete from fixture where tournament_id=${tournament} returning 1) select count(*)::int as n from d`;
      await tx`delete from qualification where tournament_id=${tournament}`;
      await tx`update tournament set status='locked',revision=revision+1 where id=${tournament}`;
      after = { removedFixtures: removed.n };
    } else if (c.action === "qualify") {
      if (t.status !== "league" || t.format !== "league_knockout")
        throw new HttpError(
          409,
          "Qualification follows the league phase of a League + Knockout.",
        );
      const league =
        await tx`select * from fixture where tournament_id=${tournament} and stage='league'`;
      if (league.some((f) => f.home_score === null))
        throw new HttpError(
          409,
          "Enter every league score before qualification.",
        );
      if (c.playoffWinners?.length && !c.evidence)
        throw new HttpError(
          400,
          "Note how the playoff was decided before choosing winners.",
        );
      const players = (await approved()).map(({ id, name }) => ({ id, name }));
      let top;
      try {
        top = qualifyTopN(
          players,
          league.map((f) => ({
            home: f.home,
            away: f.away,
            homeScore: f.home_score,
            awayScore: f.away_score,
          })),
          t.qualifiers,
          c.playoffWinners,
        );
      } catch (error) {
        throw new HttpError(409, (error as Error).message);
      }
      for (let i = 0; i < top.length; i++)
        await tx`insert into qualification(tournament_id,player_id,rank) values(${tournament},${top[i].id},${i + 1})`;
      await insertFixtures("knockout", knockout(top));
      await tx`update tournament set status='knockout',revision=revision+1 where id=${tournament}`;
      after = {
        qualified: top.map((p) => p.id),
        playoffWinners: c.playoffWinners ?? [],
        evidence: c.evidence ?? null,
      };
    } else if (c.action === "advance") {
      if (t.status !== "knockout")
        throw new HttpError(409, "No knockout round is in progress.");
      const current =
        await tx`select * from fixture where tournament_id=${tournament} and stage='knockout' and round=(select max(round) from fixture where tournament_id=${tournament} and stage='knockout') order by slot`;
      if (current.some((f) => (f.away && f.home_score === null) || !f.winner))
        throw new HttpError(409, "Enter every score in this round first.");
      const next = advanceKnockout(
        current.map((f) => ({
          id: `ko-${f.round}-${f.slot}`,
          home: f.home,
          away: f.away,
          round: f.round,
        })),
        Object.fromEntries(
          current.map((f) => [`ko-${f.round}-${f.slot}`, f.winner]),
        ),
      );
      await insertFixtures("knockout", next);
      if (!next.length)
        await tx`update tournament set status='completed',revision=revision+1 where id=${tournament}`;
      after = {
        advanced: current.map((f) => f.winner),
        nextRoundMatches: next.length,
        champion: next.length ? null : current[0].winner,
      };
    } else if (c.action === "complete") {
      if (t.status !== "league" || t.format !== "league")
        throw new HttpError(
          409,
          "Only a league-format tournament finishes this way.",
        );
      const [open] =
        await tx`select count(*)::int as n from fixture where tournament_id=${tournament} and home_score is null`;
      if (open.n > 0)
        throw new HttpError(
          409,
          "Enter every score before finishing the league.",
        );
      await tx`update tournament set status='completed',revision=revision+1 where id=${tournament}`;
      after = { status: "completed" };
    } else if (c.action === "score") {
      const [f] =
        await tx`select * from fixture where id=${c.id} and tournament_id=${tournament} for update`;
      if (!f || f.revision !== c.revision)
        throw new HttpError(409, "This match changed. Refresh before editing.");
      if (!f.away) throw new HttpError(400, "A bye has no score.");
      if (f.stage === "league" && t.status !== "league")
        throw new HttpError(
          409,
          "League scores are frozen after qualification.",
        );
      let winner: string | null = null;
      if (f.stage === "knockout") {
        const [latest] =
          await tx`select max(round) as round from fixture where tournament_id=${tournament} and stage='knockout'`;
        if (t.status !== "knockout" || f.round !== latest.round)
          throw new HttpError(409, "This round has already advanced.");
        winner =
          c.homeScore > c.awayScore
            ? f.home
            : c.awayScore > c.homeScore
              ? f.away
              : (c.winner ?? null);
        if (!winner || ![f.home, f.away].includes(winner))
          throw new HttpError(
            400,
            "A drawn knockout match needs the penalty/tiebreak winner.",
          );
      }
      before = {
        home_score: f.home_score,
        away_score: f.away_score,
        winner: f.winner,
      };
      [after] =
        await tx`update fixture set home_score=${c.homeScore},away_score=${c.awayScore},winner=${winner},revision=revision+1 where id=${c.id} returning id,home_score,away_score,winner`;
    } else if (c.action === "announce") {
      [after] =
        await tx`insert into announcement(tournament_id,title,message,published) values(${tournament},${c.title},${c.message},true) returning id,title`;
    } else if (c.action === "coordinator") {
      if (adminIds().includes(c.discordId))
        throw new HttpError(400, "Main admins always keep full access.");
      const [old] =
        await tx`select * from coordinator where discord_id=${c.discordId}`;
      before = old ?? {};
      [after] =
        await tx`insert into coordinator(discord_id,operations,tournaments,active) values(${c.discordId},${c.operations},${[tournament]},${c.active})
          on conflict(discord_id) do update set operations=excluded.operations,tournaments=excluded.tournaments,active=excluded.active returning *`;
    } else if (c.action === "finals") {
      const [old] =
        await tx`select released from finals_access where tournament_id=${tournament}`;
      before = old ?? {};
      await tx`insert into finals_access(tournament_id,credential_cipher,released) values(${tournament},${encrypt(c.credentials)},${c.released})
        on conflict(tournament_id) do update set credential_cipher=excluded.credential_cipher,released=excluded.released`;
      after = { released: c.released, credentials: "[REDACTED]" };
    }
    await tx`insert into audit_event(actor,action,entity,before_value,after_value) values(${user.id},${c.action},${tournament},${tx.json(before as never)},${tx.json(after as never)})`;
    return { ok: true };
  });
}
