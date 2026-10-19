import { z } from "zod";
import { db } from "./db";
import { actor, HttpError } from "./api";
import { decrypt, encrypt } from "./private-data";
import {
  leaguePhase,
  qualifyLeaguePhase,
  knockout,
  standings,
  advanceKnockout,
} from "./tournament";
import { allowed, adminIds } from "./access";
const command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("review"),
    id: z.string().uuid(),
    revision: z.number().int(),
    status: z.enum(["approved", "rejected", "pending"]),
    verified: z.boolean(),
    discordId: z
      .string()
      .regex(/^\d{17,20}$/)
      .optional(),
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().uuid(),
    revision: z.number().int(),
  }),
  z.object({
    action: z.literal("configure"),
    status: z.enum(["draft", "open", "locked"]),
    opponents: z.number().int().min(1).max(63),
    revision: z.number().int(),
  }),
  z.object({ action: z.literal("generate") }),
  z.object({
    action: z.literal("qualify"),
    playoffWinners: z.array(z.string().uuid()).max(8).optional(),
    evidence: z.string().trim().min(10).max(2000).optional(),
  }),
  z.object({ action: z.literal("advance") }),
  z.object({
    action: z.literal("score"),
    id: z.string().uuid(),
    revision: z.number().int(),
    homeScore: z.number().int().min(0).max(99),
    awayScore: z.number().int().min(0).max(99),
    winner: z.string().uuid().optional(),
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
export async function snapshot(tournament: string) {
  const user = await actor("workspace", tournament),
    sql = db();
  const [t] = await sql`select * from tournament where id=${tournament}`;
  const applications =
    await sql`select a.*,p.gaming_name,p.preference,p.contact_cipher,p.efootball_cipher,p.id as player_id from application a join player p on p.id=a.player_id where a.tournament_id=${tournament} and a.deleted_at is null order by a.created_at`;
  const fixtures =
    await sql`select * from fixture where tournament_id=${tournament} order by stage,round,slot`;
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
      ? await sql`select * from audit_event order by id desc limit 100`
      : [];
  const privateAccess = allowed(user, "registrations", tournament);
  return {
    user,
    tournament: t,
    applications: applications.map((a) =>
      privateAccess
        ? {
            ...a,
            contact: decrypt(a.contact_cipher),
            efootballId: decrypt(a.efootball_cipher),
            contact_cipher: undefined,
            efootball_cipher: undefined,
          }
        : {
            id: a.id,
            player_id: a.player_id,
            gaming_name: a.gaming_name,
            status: a.status,
          },
    ),
    fixtures,
    standings: standings(entrants, results),
    audit,
  };
}
export async function execute(tournament: string, raw: unknown) {
  const parsed = command.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "Invalid operation details.");
  const c = parsed.data;
  const operation =
    c.action === "review"
      ? "registrations"
      : c.action === "score"
        ? "results"
        : c.action === "announce"
          ? "announcements"
          : c.action === "coordinator"
            ? "roles"
            : c.action === "delete"
              ? "delete"
              : c.action === "finals"
                ? "finals"
                : "tournaments";
  const user = await actor(operation, tournament);
  return db().begin(async (tx) => {
    const [t] =
      await tx`select * from tournament where id=${tournament} and deleted_at is null for update`;
    if (!t) throw new HttpError(404, "Tournament not found.");
    let before: Record<string, unknown> = {},
      after: Record<string, unknown> = {};
    if (c.action === "review" || c.action === "delete") {
      const [a] =
        await tx`select * from application where id=${c.id} and tournament_id=${tournament} and deleted_at is null for update`;
      if (!a || a.revision !== c.revision)
        throw new HttpError(
          409,
          "This application changed. Refresh before editing.",
        );
      if (!["draft", "open", "locked"].includes(t.status))
        throw new HttpError(
          409,
          "The field is frozen after fixtures are generated.",
        );
      before = a;
      if (c.action === "delete") {
        [after] =
          await tx`update application set deleted_at=now(),status='withdrawn',revision=revision+1 where id=${c.id} returning *`;
      } else {
        if (c.status === "approved" && !c.verified)
          throw new HttpError(400, "Verify contact ownership before approval.");
        if (
          ["pending", "approved"].includes(c.status) &&
          !["pending", "approved"].includes(a.status)
        ) {
          const [n] =
            await tx`select count(*)::int as n from application where tournament_id=${tournament} and deleted_at is null and status in ('pending','approved')`;
          if (n.n >= 64) throw new HttpError(409, "All 64 slots are occupied.");
        }
        [after] =
          await tx`update application set status=${c.status},verified_at=${c.verified ? new Date() : null},revision=revision+1 where id=${c.id} returning *`;
        if (c.discordId) {
          const [p] =
            await tx`select discord_id from player where id=${a.player_id} for update`;
          if (p.discord_id && p.discord_id !== c.discordId)
            throw new HttpError(
              409,
              "An existing verified identity cannot be replaced here.",
            );
          if (!c.verified)
            throw new HttpError(400, "Verify the Discord identity first.");
          await tx`update player set discord_id=${c.discordId} where id=${a.player_id}`;
          after = { ...after, discordId: c.discordId };
          before = { ...before, discordId: p.discord_id };
        }
      }
    } else if (c.action === "configure") {
      if (
        !["draft", "open", "locked"].includes(t.status) ||
        t.revision !== c.revision
      )
        throw new HttpError(409, "Tournament has changed or already started.");
      before = t;
      [after] =
        await tx`update tournament set status=${c.status},opponents=${c.opponents},revision=revision+1 where id=${tournament} returning *`;
    } else if (c.action === "generate" || c.action === "qualify") {
      const entrants = await tx<
        { id: string; name: string }[]
      >`select p.id,p.gaming_name as name from application a join player p on p.id=a.player_id where a.tournament_id=${tournament} and a.status='approved' and a.deleted_at is null order by a.created_at,a.id`;
      if (entrants.length !== 64)
        throw new HttpError(409, "Exactly 64 approved players are required.");
      if (c.action === "generate") {
        if (t.status !== "locked")
          throw new HttpError(
            409,
            "Lock registration before generating fixtures.",
          );
        const fixtures = leaguePhase(entrants, t.opponents);
        for (const f of fixtures)
          await tx`insert into fixture(tournament_id,stage,round,slot,home,away) values(${tournament},'league',${f.round},${Number(f.id.split("-").at(-1))},${f.home!},${f.away!})`;
        await tx`update tournament set status='league',revision=revision+1 where id=${tournament}`;
        after = { fixtureCount: fixtures.length };
      } else {
        if (t.status !== "league")
          throw new HttpError(
            409,
            "Qualification is available after the league phase.",
          );
        const played =
          await tx`select * from fixture where tournament_id=${tournament} and stage='league' and home_score is not null`;
        let top;
        try {
          if (c.playoffWinners?.length && !c.evidence)
            throw new HttpError(
              400,
              "Record playoff evidence before resolving a qualification tie.",
            );
          top = qualifyLeaguePhase(
            entrants,
            played.map((f) => ({
              home: f.home,
              away: f.away,
              homeScore: f.home_score,
              awayScore: f.away_score,
            })),
            t.opponents,
            c.playoffWinners,
          );
        } catch (error) {
          throw new HttpError(409, (error as Error).message);
        }
        for (let i = 0; i < top.length; i++)
          await tx`insert into qualification(tournament_id,player_id,rank) values(${tournament},${top[i].id},${i + 1})`;
        for (const f of knockout(top))
          await tx`insert into fixture(tournament_id,stage,round,slot,home,away) values(${tournament},'knockout',${f.round},${Number(f.id.split("-").at(-1))},${f.home!},${f.away!})`;
        await tx`update tournament set status='knockout',revision=revision+1 where id=${tournament}`;
        after = {
          qualified: top.map((p) => p.id),
          playoffWinners: c.playoffWinners ?? [],
          evidence: c.evidence ?? null,
        };
      }
    } else if (c.action === "advance") {
      if (t.status !== "knockout")
        throw new HttpError(409, "No active knockout round.");
      const current =
        await tx`select * from fixture where tournament_id=${tournament} and stage='knockout' and round=(select max(round) from fixture where tournament_id=${tournament} and stage='knockout') order by slot`;
      if (current.some((f) => f.home_score === null || !f.winner))
        throw new HttpError(409, "Confirm every result and winner first.");
      const next = advanceKnockout(
        current.map((f) => ({
          id: f.id,
          home: f.home,
          away: f.away,
          round: f.round,
        })),
        Object.fromEntries(current.map((f) => [f.id, f.winner])),
      );
      for (const f of next)
        await tx`insert into fixture(tournament_id,stage,round,slot,home,away) values(${tournament},'knockout',${f.round},${Number(f.id.split("-").at(-1))},${f.home!},${f.away!})`;
      if (!next.length)
        await tx`update tournament set status='completed',revision=revision+1 where id=${tournament}`;
      after = {
        advanced: current.map((f) => f.winner),
        nextRound: next.length,
      };
    } else if (c.action === "score") {
      const [f] =
        await tx`select * from fixture where id=${c.id} and tournament_id=${tournament} for update`;
      if (!f || f.revision !== c.revision)
        throw new HttpError(409, "Fixture changed. Refresh before editing.");
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
              : c.winner;
        if (!winner || ![f.home, f.away].includes(winner))
          throw new HttpError(
            400,
            "Select the confirmed tiebreak winner for a drawn knockout match.",
          );
      }
      before = f;
      [after] =
        await tx`update fixture set home_score=${c.homeScore},away_score=${c.awayScore},winner=${winner},revision=revision+1 where id=${c.id} returning *`;
    } else if (c.action === "announce") {
      [after] =
        await tx`insert into announcement(tournament_id,title,message,published) values(${tournament},${c.title},${c.message},true) returning *`;
    } else if (c.action === "coordinator") {
      if (adminIds().includes(c.discordId))
        throw new HttpError(
          400,
          "Main admins always retain equal administrator permissions.",
        );
      const [old] =
        await tx`select * from coordinator where discord_id=${c.discordId}`;
      before = old ?? {};
      [after] =
        await tx`insert into coordinator(discord_id,operations,tournaments,active) values(${c.discordId},${c.operations},${[tournament]},${c.active}) on conflict(discord_id) do update set operations=excluded.operations,tournaments=excluded.tournaments,active=excluded.active returning *`;
    } else if (c.action === "finals") {
      const [old] =
        await tx`select released from finals_access where tournament_id=${tournament}`;
      before = old ?? {};
      await tx`insert into finals_access(tournament_id,credential_cipher,released) values(${tournament},${encrypt(c.credentials)},${c.released}) on conflict(tournament_id) do update set credential_cipher=excluded.credential_cipher,released=excluded.released`;
      after = { released: c.released, credentials: "[REDACTED]" };
    }
    await tx`insert into audit_event(actor,action,entity,before_value,after_value) values(${user.id},${c.action},${tournament},${tx.json(before as never)},${tx.json(after as never)})`;
    return { ok: true };
  });
}
