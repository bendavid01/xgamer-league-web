import { z } from "zod";
import { db } from "./db";
import { actor, HttpError } from "./api";
import { allowed, type Actor, type Operation } from "./access";
import { decrypt, encrypt, fingerprint } from "./private-data";
import { efootballIdInput, registrationInput } from "./registration";
import { playerCode } from "./codes";
import { tournamentLabel } from "./labels";
import { teamDisplay } from "./team-display";

/**
 * OM "Edit player details" (approved design, 13 Nov 2026).
 *
 * Every edit is one transaction:
 *   lock tournament → player → application, check the request ID, compare-and-set
 *   against the value the organizer saw, update, write one immutable audit row.
 *
 * Never editable here: XG ID, player UUID, fixtures, results, standings, entry
 * status, tournament assignment, the audit log, and WhatsApp numbers. The command
 * schemas are strict, so any other field is rejected rather than ignored.
 */

export const TEAM_SOURCES = [
  "registration",
  "registration_record",
  "organizer_attested",
  "organizer_corrected",
] as const;
export type TeamSource = (typeof TEAM_SOURCES)[number];

export const SOURCE_LABEL: Record<TeamSource, string> = {
  registration: "Stored at registration",
  registration_record: "Recovered from registration records",
  organizer_attested: "Attested by an organizer",
  organizer_corrected: "Corrected by an organizer",
};

const uuid = z.string().uuid();
const tid = z.string().regex(/^[a-z0-9-]{3,80}$/);
const reason = z.string().trim().min(5).max(300);
const requestId = z.string().uuid();
// Same rules as registration: 2–40 letters, digits, spaces and _ . ' & -
const playerName = registrationInput.shape.playerName;
const teamName = registrationInput.shape.teamName;

const editCommand = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("player.edit_name"),
    tournament: tid,
    playerId: uuid,
    expected: z.string().max(200),
    name: playerName,
    reason,
    requestId,
  }),
  z.strictObject({
    action: z.literal("player.edit_team"),
    tournament: tid,
    playerId: uuid,
    expected: z.string().max(200).nullable(),
    team: teamName,
    reason,
    requestId,
  }),
  z.strictObject({
    action: z.literal("application.team_attest"),
    tournament: tid,
    applicationId: uuid,
    expectedTeam: z.string().max(200),
    confirm: z.literal(true),
    reason,
    requestId,
  }),
  z.strictObject({
    action: z.literal("application.team_correct"),
    tournament: tid,
    applicationId: uuid,
    expectedTeam: z.string().max(200).nullable(),
    expectedSource: z.enum(TEAM_SOURCES).nullable(),
    team: teamName,
    reason,
    evidence: z.string().trim().min(5).max(300),
    confirmOverwrite: z.boolean(),
    requestId,
  }),
  z.strictObject({
    action: z.literal("player.edit_efootball"),
    tournament: tid,
    playerId: uuid,
    expectedHadId: z.boolean(),
    efootballId: efootballIdInput,
    reason,
    requestId,
  }),
]);
export type EditCommand = z.infer<typeof editCommand>;
export const EDIT_ACTIONS = editCommand.options.map(
  (o) => o.shape.action.value,
) as EditCommand["action"][];

/** The permission each field needs. Only the eFootball ID is open to coordinators. */
export const EDIT_OPERATION: Record<EditCommand["action"], Operation> = {
  "player.edit_name": "players",
  "player.edit_team": "players",
  "application.team_attest": "players",
  "application.team_correct": "players",
  "player.edit_efootball": "registrations",
};

export const isEditCommand = (raw: unknown) =>
  !!raw &&
  typeof raw === "object" &&
  (EDIT_ACTIONS as string[]).includes(
    String((raw as { action?: unknown }).action),
  );

type Resolve = (operation: Operation, tournament: string) => Promise<Actor>;
type Who = Pick<Actor, "id" | "role"> &
  Partial<Pick<Actor, "name" | "operations" | "tournaments">>;

const CHANGED = "Changed by someone else. Reload and try again.";

/** POST /api/admin with an edit action. `resolve` is the signed-in organizer check. */
export async function executeEdit(raw: unknown, resolve: Resolve = actor) {
  const parsed = editCommand.safeParse(raw);
  if (!parsed.success)
    throw new HttpError(400, "Check the details and try again.");
  const c = parsed.data;
  const user = await resolve(EDIT_OPERATION[c.action], c.tournament);
  return runEdit(user, c);
}

/** Server-side field check, repeated inside every command (defence in depth). */
function mayEdit(user: Who, c: EditCommand) {
  const full: Actor = {
    id: user.id,
    name: user.name,
    role: user.role,
    operations: user.operations ?? [],
    tournaments: user.tournaments ?? [],
  };
  return allowed(full, EDIT_OPERATION[c.action], c.tournament);
}

/** Applies an edit for an already-signed-in organizer. Exported for integration tests. */
export async function runEdit(user: Who, c: EditCommand) {
  if (!mayEdit(user, c))
    throw new HttpError(
      403,
      EDIT_OPERATION[c.action] === "players"
        ? "Only main admins can change this."
        : "This operation is not assigned to you.",
    );
  try {
    return await db().begin((tx) => apply(tx, user, c));
  } catch (error) {
    // Two players can't share an eFootball ID (unique index): a race ends here.
    if ((error as { code?: string }).code === "23505")
      throw new HttpError(409, "That eFootball ID belongs to another player.");
    throw error;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

async function apply(tx: Tx, user: Who, c: EditCommand) {
  // 1. Locks, always in this order: tournament → player → application.
  const [t] =
    await tx`select id,name,competition,season from tournament where id=${c.tournament} and deleted_at is null for update`;
  if (!t) throw new HttpError(404, "Tournament not found.");
  let playerId: string;
  if ("applicationId" in c) {
    const [ref] =
      await tx`select player_id from application where id=${c.applicationId} and tournament_id=${c.tournament}`;
    if (!ref) throw new HttpError(404, "Entry not found in this tournament.");
    playerId = ref.player_id;
  } else playerId = c.playerId;
  const [player] =
    await tx`select id,public_no,gaming_name,team_name,efootball_hash,efootball_cipher,deleted_at from player where id=${playerId} for update`;
  if (!player) throw new HttpError(404, "Player not found.");
  let app: Record<string, unknown> | null = null;
  if ("applicationId" in c) {
    [app] =
      await tx`select id,tournament_id,player_id,status,team_name,team_name_source,deleted_at from application where id=${c.applicationId} for update`;
    if (
      !app ||
      app.player_id !== playerId ||
      app.tournament_id !== c.tournament
    )
      throw new HttpError(409, CHANGED);
    if (app.deleted_at)
      throw new HttpError(409, "This entry was removed from the tournament.");
  } else {
    const [entry] =
      await tx`select id from application where player_id=${playerId} and tournament_id=${c.tournament} and deleted_at is null`;
    if (!entry)
      throw new HttpError(404, "This player isn't in this tournament.");
  }
  if (player.deleted_at)
    throw new HttpError(409, "This player record was removed.");

  // 2. Idempotency: a retried request returns its first outcome and writes nothing.
  const entity = "applicationId" in c ? c.applicationId : playerId;
  const [prior] =
    await tx`select action,entity from audit_event where after_value->>'request_id' = ${c.requestId} limit 1`;
  if (prior) {
    if (prior.action === c.action && prior.entity === entity)
      return { ok: true, repeated: true };
    throw new HttpError(
      409,
      "This request was already used for another change.",
    );
  }

  const code = playerCode(player.public_no);
  let summary: string;
  let before: Record<string, unknown>;
  let after: Record<string, unknown>;

  // 3. Compare-and-set, then 4. update.
  if (c.action === "player.edit_name") {
    if (player.gaming_name !== c.expected) throw new HttpError(409, CHANGED);
    if (c.name === player.gaming_name)
      throw new HttpError(400, "That is already the gaming name.");
    await tx`update player set gaming_name=${c.name} where id=${playerId}`;
    summary = "Changed gaming name";
    before = { gaming_name: player.gaming_name };
    after = { gaming_name: c.name };
  } else if (c.action === "player.edit_team") {
    if ((player.team_name ?? null) !== c.expected)
      throw new HttpError(409, CHANGED);
    if (c.team === player.team_name)
      throw new HttpError(400, "That is already the current team.");
    // The CURRENT team only. Tournament teams are never touched here.
    await tx`update player set team_name=${c.team} where id=${playerId}`;
    summary = "Changed current team";
    before = { team_name: player.team_name ?? null };
    after = { team_name: c.team };
  } else if (c.action === "application.team_attest") {
    if (app!.team_name !== null || app!.team_name_source !== null)
      throw new HttpError(409, "This entry already has a tournament team.");
    const ev = await evidence(tx, playerId, c.applicationId);
    const blocked = ineligible(ev, player);
    if (blocked.length)
      throw new HttpError(
        409,
        `Can't attest: ${blocked.join("; ")}. Use "Correct with evidence" instead.`,
      );
    if ((player.team_name ?? null) !== c.expectedTeam)
      throw new HttpError(409, CHANGED);
    await tx`update application set team_name=${player.team_name},team_name_source='organizer_attested' where id=${c.applicationId}`;
    summary = "Attested tournament team";
    before = { team_name: null, team_name_source: null };
    after = {
      team_name: player.team_name,
      team_name_source: "organizer_attested",
      evidence: {
        entries: ev.entries,
        registration_records: ev.registration_records,
        registration_audit_id: ev.registration_audit_id,
        record_has_team_field: ev.record_has_team,
        current_team_edits: ev.team_edits,
        current_team_at_attestation: player.team_name,
      },
    };
  } else if (c.action === "application.team_correct") {
    if (
      (app!.team_name ?? null) !== c.expectedTeam ||
      (app!.team_name_source ?? null) !== c.expectedSource
    )
      throw new HttpError(409, CHANGED);
    if (c.team === app!.team_name)
      throw new HttpError(400, "That is already the tournament team.");
    if (app!.team_name !== null && !c.confirmOverwrite)
      throw new HttpError(
        409,
        `This entry already has "${app!.team_name}" (${SOURCE_LABEL[app!.team_name_source as TeamSource] ?? app!.team_name_source}). Confirm you're replacing it.`,
      );
    await tx`update application set team_name=${c.team},team_name_source='organizer_corrected' where id=${c.applicationId}`;
    summary = app!.team_name
      ? "Corrected tournament team"
      : "Set tournament team";
    before = {
      team_name: app!.team_name ?? null,
      team_name_source: app!.team_name_source ?? null,
    };
    after = {
      team_name: c.team,
      team_name_source: "organizer_corrected",
      evidence: c.evidence,
    };
  } else {
    if (!!player.efootball_cipher !== c.expectedHadId)
      throw new HttpError(409, CHANGED);
    const hash = fingerprint("ef:" + c.efootballId);
    if (hash === player.efootball_hash)
      throw new HttpError(400, "That is already the eFootball ID.");
    const [taken] =
      await tx`select id from player where efootball_hash=${hash} and id<>${playerId}`;
    if (taken)
      throw new HttpError(409, "That eFootball ID belongs to another player.");
    await tx`update player set efootball_hash=${hash},efootball_cipher=${encrypt(c.efootballId)} where id=${playerId}`;
    summary = player.efootball_cipher
      ? "Changed eFootball ID"
      : "Added eFootball ID";
    before = { hadId: !!player.efootball_cipher };
    after = { efootballId: "[REDACTED]" };
  }

  // 5. One immutable audit row, with the reason and the request ID.
  await tx`insert into audit_event(actor,actor_name,actor_role,action,entity,tournament_id,summary,affected,before_value,after_value)
    values(${user.id},${user.name ?? null},${user.role},${c.action},${entity},${c.tournament},${summary},${code},
      ${tx.json(before)},${tx.json({ ...after, reason: c.reason, request_id: c.requestId })})`;
  return { ok: true };
}

/* ─────────────────────────── Evidence ─────────────────────────── */

export type Evidence = {
  entries: number;
  registration_records: number;
  records_for_entry: number;
  registration_audit_id: number | null;
  registration_at: string | null;
  record_has_team: boolean;
  team_edits: number;
};

/** Computed live from the database; never typed by anyone. */
async function evidence(
  tx: Tx,
  playerId: string,
  applicationId: string,
): Promise<Evidence> {
  const [e] = await tx`select
      (select count(*) from application where player_id=${playerId})::int as entries,
      (select count(*) from audit_event where action='application.create' and after_value->>'playerId'=${playerId})::int as registration_records,
      (select count(*) from audit_event where action='application.create' and entity=${applicationId})::int as records_for_entry,
      (select min(id) from audit_event where action='application.create' and entity=${applicationId}) as registration_audit_id,
      (select min(created_at) from audit_event where action='application.create' and entity=${applicationId}) as registration_at,
      coalesce((select bool_or(after_value ? 'team') from audit_event where action='application.create' and after_value->>'playerId'=${playerId}), false) as record_has_team,
      (select count(*) from audit_event where action='player.edit_team' and entity=${playerId})::int as team_edits`;
  return {
    ...e,
    registration_audit_id:
      e.registration_audit_id === null ? null : Number(e.registration_audit_id),
    registration_at: e.registration_at
      ? new Date(e.registration_at).toISOString()
      : null,
  };
}

/** Why an entry can't be attested (empty = eligible). */
function ineligible(
  ev: Evidence,
  player: { team_name: string | null; deleted_at: unknown },
) {
  const out: string[] = [];
  if (ev.entries !== 1)
    out.push(`the player has ${ev.entries} tournament entries, not 1`);
  if (ev.registration_records !== 1)
    out.push(`${ev.registration_records} registration records, not 1`);
  if (ev.records_for_entry !== 1)
    out.push("no single registration record for this entry");
  if (ev.record_has_team)
    out.push("a registration record holds a team, so it must be reviewed");
  if (ev.team_edits)
    out.push("the current team was edited in OM since registration");
  if (!player.team_name) out.push("the player has no current team");
  if (player.deleted_at) out.push("the player record was removed");
  return out;
}

/* ─────────────────────────── Reads ─────────────────────────── */

const label = (t: {
  name: string;
  competition: string | null;
  season: number | null;
}) => tournamentLabel(t);

/** GET /api/admin?t=<tournament>&player=<id>: the Edit player details panel. */
export async function playerDetails(
  tournament: string,
  playerId: string,
  resolve: Resolve = actor,
) {
  if (!tid.safeParse(tournament).success || !uuid.safeParse(playerId).success)
    throw new HttpError(400, "Choose a player.");
  const user = await resolve("workspace", tournament);
  const admin = user.role === "admin";
  const registrations = allowed(user, "registrations", tournament);
  if (!admin && !registrations)
    throw new HttpError(403, "This operation is not assigned to you.");
  const sql = db();
  const [p] =
    await sql`select p.id,p.public_no,p.gaming_name,p.team_name,p.efootball_cipher,p.deleted_at
      from player p join application a on a.player_id=p.id
      where p.id=${playerId} and a.tournament_id=${tournament} and a.deleted_at is null`;
  if (!p) throw new HttpError(404, "This player isn't in this tournament.");
  const entries = admin
    ? await sql`select a.id,a.status,a.deleted_at is not null as removed,a.team_name,a.team_name_source,
          t.id as tournament_id,t.name,t.competition,t.season,t.deleted_at is not null as tournament_deleted
        from application a join tournament t on t.id=a.tournament_id
        where a.player_id=${playerId} order by a.created_at`
    : [];
  const history = admin
    ? await sql`select id,created_at,actor_name,action,summary,before_value,after_value
        from audit_event where entity=${playerId} or entity = any(${entries.map((e) => e.id as string)})
        order by id desc limit 50`
    : [];
  return {
    role: user.role,
    canEdit: {
      name: admin && !p.deleted_at,
      team: admin && !p.deleted_at,
      tournamentTeams: admin,
      efootball: (admin || registrations) && !p.deleted_at,
      whatsapp: false,
    },
    player: {
      id: p.id as string,
      code: playerCode(p.public_no),
      gaming_name: p.gaming_name as string,
      team_name: (p.team_name as string | null) ?? null,
      hasEfootballId: !!p.efootball_cipher,
      ...(admin || registrations
        ? {
            efootballId: p.efootball_cipher
              ? decrypt(p.efootball_cipher)
              : null,
          }
        : {}),
      removed: !!p.deleted_at,
    },
    entries: entries.map((e) => ({
      id: e.id as string,
      tournament: e.tournament_id as string,
      label: label(e as never),
      status: e.status as string,
      removed: e.removed as boolean,
      tournamentDeleted: e.tournament_deleted as boolean,
      team_name: (e.team_name as string | null) ?? null,
      team_name_source: (e.team_name_source as TeamSource | null) ?? null,
    })),
    history: history.map((h) => ({
      id: Number(h.id),
      created_at: h.created_at,
      actor_name: h.actor_name,
      action: h.action,
      summary: h.summary,
      before: h.before_value,
      after: h.after_value,
    })),
  };
}

/**
 * GET /api/admin?teams=1: main admins only. Every entry without a tournament team,
 * with the evidence computed live and whether it may be attested.
 */
export async function teamReview(resolve: Resolve = actor) {
  await resolve("players", "*");
  return teamReviewReport();
}

export async function teamReviewReport() {
  const sql = db();
  const rows =
    await sql`select a.id,a.status,a.player_id,a.tournament_id,t.name,t.competition,t.season,
        t.deleted_at is not null as tournament_deleted,p.public_no,p.gaming_name,p.team_name,p.deleted_at as player_deleted
      from application a join player p on p.id=a.player_id join tournament t on t.id=a.tournament_id
      where a.deleted_at is null and a.team_name is null
      order by p.public_no, a.created_at`;
  const out = [];
  for (const r of rows) {
    const ev = await evidence(sql, r.player_id, r.id);
    const blocked = ineligible(ev, {
      team_name: r.team_name,
      deleted_at: r.player_deleted,
    });
    if (r.tournament_deleted) blocked.push("the tournament is deleted");
    out.push({
      applicationId: r.id as string,
      tournament: r.tournament_id as string,
      label: label(r as never),
      status: r.status as string,
      code: playerCode(r.public_no),
      gaming_name: r.gaming_name as string,
      currentTeam: (r.team_name as string | null) ?? null,
      evidence: ev,
      eligible: blocked.length === 0,
      reasons: blocked,
    });
  }
  return { display: teamDisplay(), entries: out };
}
