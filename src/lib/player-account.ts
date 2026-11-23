import type { TransactionSql } from "postgres";
import { z } from "zod";
import type { Actor } from "./access";
import { actor, HttpError } from "./api";
import { auditRegistrationTeam, auditText } from "./audit-text";
import { codeNumber, playerCode } from "./codes";
import { lockNickname } from "./contact-lock";
import { db } from "./db";
import { tournamentLabel } from "./labels";
import {
  burnPasswordCheck,
  CODE_HOURS,
  generateOneTimeCode,
  hashPassword,
  LOCK_AFTER_FAILURES,
  LOCK_MINUTES,
  nicknameInput,
  oneTimeCodeHash,
  oneTimeCodeInput,
  passwordInput,
  playerSessionFrom,
  sessionSecret,
  verifyPassword,
  verifySession,
  type CodePurpose,
  type PlayerSession,
} from "./player-auth";
import { nicknameTaken } from "./player-nickname";
import { decrypt, fingerprint } from "./private-data";
import { getProfile } from "./profile";
import { lockOpenRegistration, registrationInput } from "./registration";
import {
  recheckRegistrationReviewer,
  requireRegistrationReviewer,
} from "./registration-review";

/** Everything player sign-in needs. Without it the player endpoints answer 503. */
export function playerAuthConfigured(
  env: Record<string, string | undefined> = process.env,
) {
  try {
    sessionSecret(env);
  } catch {
    return false;
  }
  return (
    !!env.DATABASE_URL &&
    /^[a-f0-9]{64}$/i.test(env.PRIVATE_DATA_KEY ?? "") &&
    !!env.APP_ORIGIN
  );
}

export function requirePlayerAuthConfigured() {
  if (!playerAuthConfigured())
    throw new HttpError(503, "Player sign-in is not available yet.");
}

/**
 * A per-address limit on sign-in and code attempts, on top of the per-XG-ID
 * lockout: it slows one address trying many XG IDs.
 */
export const AUTH_ATTEMPTS_PER_WINDOW = 30;
export async function checkAuthLimit(ip: string) {
  const [rate] =
    await db()`insert into rate_limit(key,hits,expires_at) values(${fingerprint("player-auth-ip:" + ip)},1,now()+interval '15 minutes')
    on conflict(key) do update set hits=case when rate_limit.expires_at<now() then 1 else rate_limit.hits+1 end,
    expires_at=case when rate_limit.expires_at<now() then now()+interval '15 minutes' else rate_limit.expires_at end returning hits`;
  if (rate.hits > AUTH_ATTEMPTS_PER_WINDOW)
    throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
}

const xgIdInput = z
  .string()
  .trim()
  .max(16)
  .transform(codeNumber)
  .pipe(z.number().int().positive());

export const loginInput = z.strictObject({
  xgId: xgIdInput,
  // Any length is checked (and fails); the policy applies when a password is set.
  password: z.string().min(1).max(256),
});

export const redeemInput = z.strictObject({
  xgId: xgIdInput,
  code: oneTimeCodeInput,
  newPassword: passwordInput,
  displayNickname: nicknameInput.optional(),
});

const WRONG_LOGIN = "That XG ID and password don't match.";
const WRONG_CODE = "That code is not valid for this XG ID, or it has expired.";
const LOCKED = `Too many attempts. Try again in ${LOCK_MINUTES} minutes.`;

type Attempt =
  | { ok: true; playerId: string; xgId: string; iat: number }
  | { ok: false; locked: boolean };

/** A registered, active player by XG number, with their sign-in row locked (created if missing). */
async function lockAccount(tx: TransactionSql, publicNo: number) {
  const [player] = await tx<
    {
      id: string;
      public_no: number;
      gaming_name: string;
      display_nickname: string | null;
      nickname_locked: boolean;
    }[]
  >`select id,public_no,gaming_name,display_nickname,nickname_locked from player
    where public_no=${publicNo} and player_type='registered' and deleted_at is null for update`;
  if (!player) return null;
  await tx`insert into player_credential(player_id) values(${player.id}) on conflict(player_id) do nothing`;
  const [credential] = await tx<
    { password_hash: string | null; locked: boolean }[]
  >`select password_hash, coalesce(locked_until > now(), false) as locked
    from player_credential where player_id=${player.id} for update`;
  return { player, credential };
}

/** One more failure; the fifth in a row locks the XG ID for LOCK_MINUTES and restarts the count. */
async function recordFailure(tx: TransactionSql, playerId: string) {
  const [row] = await tx<{ locked: boolean }[]>`
    update player_credential set
      locked_until = case when failed_attempts + 1 >= ${LOCK_AFTER_FAILURES}
        then now() + make_interval(mins => ${LOCK_MINUTES}) else locked_until end,
      failed_attempts = case when failed_attempts + 1 >= ${LOCK_AFTER_FAILURES}
        then 0 else failed_attempts + 1 end,
      updated_at = now()
    where player_id=${playerId}
    returning coalesce(locked_until > now(), false) as locked`;
  return { ok: false as const, locked: row.locked };
}

/** The database clock, so a new session is never older than the password it follows. */
async function databaseSecond(tx: TransactionSql) {
  const [{ now }] = await tx<
    { now: number }[]
  >`select floor(extract(epoch from now()))::bigint::int as now`;
  return now;
}

function attemptResult(result: Attempt, wrong: string) {
  if (result.ok) return result;
  throw new HttpError(
    result.locked ? 429 : 401,
    result.locked ? LOCKED : wrong,
  );
}

/**
 * XG ID + password. Failures are counted and committed even though the request
 * fails, which is why the transaction returns a result instead of throwing.
 */
export async function login(input: z.infer<typeof loginInput>, ip: string) {
  requirePlayerAuthConfigured();
  await checkAuthLimit(ip);
  const result = await db().begin(async (tx): Promise<Attempt> => {
    const account = await lockAccount(tx, input.xgId);
    // Unknown IDs and guests take as long as a real check.
    if (!account) {
      await burnPasswordCheck(input.password);
      return { ok: false, locked: false };
    }
    const { player, credential } = account;
    if (credential.locked) return { ok: false, locked: true };
    if (!(await verifyPassword(input.password, credential.password_hash)))
      return recordFailure(tx, player.id);
    await tx`update player_credential set failed_attempts=0,locked_until=null,
      last_login_at=now(),updated_at=now() where player_id=${player.id}`;
    return {
      ok: true,
      playerId: player.id,
      xgId: playerCode(player.public_no),
      iat: await databaseSecond(tx),
    };
  });
  return attemptResult(result, WRONG_LOGIN);
}

/**
 * Redeems an organizer's claim or reset code: sets the password, and on a claim
 * the nickname (once). Wrong codes count toward the same lockout as sign-in.
 */
export async function redeemOneTimeCode(
  input: z.infer<typeof redeemInput>,
  ip: string,
) {
  requirePlayerAuthConfigured();
  await checkAuthLimit(ip);
  // Hashed before any lock is taken; used only if the code turns out valid.
  const passwordHash = await hashPassword(input.newPassword);
  const result = await db().begin(async (tx): Promise<Attempt> => {
    const account = await lockAccount(tx, input.xgId);
    if (!account) return { ok: false, locked: false };
    const { player, credential } = account;
    if (credential.locked) return { ok: false, locked: true };
    const hashes = (["claim", "reset"] as const).map((purpose) =>
      oneTimeCodeHash(player.id, purpose, input.code),
    );
    const [code] = await tx<{ id: string; purpose: CodePurpose }[]>`
      select id,purpose from player_one_time_code
      where player_id=${player.id} and used_at is null and revoked_at is null
        and expires_at > now() and code_hash = any(${hashes})
      for update`;
    if (!code) return recordFailure(tx, player.id);

    // The code is right. Nickname problems below roll back without using it.
    let nickname: string | null = null;
    if (input.displayNickname !== undefined) {
      const wanted = input.displayNickname;
      if (player.nickname_locked || code.purpose !== "claim") {
        if (wanted.toLowerCase() !== player.display_nickname?.toLowerCase())
          throw new HttpError(
            409,
            "Your nickname is set once, when you claim your account, and can't be changed here.",
          );
      } else {
        await lockNickname(tx, wanted);
        if (await nicknameTaken(tx, wanted, player.id))
          throw new HttpError(409, "That nickname is taken. Choose another.");
        nickname = wanted;
      }
    }

    const [used] = await tx`update player_one_time_code set used_at=now()
      where id=${code.id} and used_at is null and revoked_at is null returning id`;
    if (!used) return { ok: false, locked: false };
    // One redemption ends every other outstanding code for this player.
    await tx`update player_one_time_code set revoked_at=now()
      where player_id=${player.id} and used_at is null and revoked_at is null`;
    await tx`update player_credential set password_hash=${passwordHash},password_changed_at=now(),
      failed_attempts=0,locked_until=null,last_login_at=now(),updated_at=now()
      where player_id=${player.id}`;
    if (nickname)
      await tx`update player set display_nickname=${nickname},nickname_locked=true where id=${player.id}`;
    const xgId = playerCode(player.public_no);
    await tx`insert into audit_event(actor,actor_name,actor_role,action,entity,summary,affected,after_value)
      values(${"player:" + player.id},${auditText(nickname ?? player.display_nickname ?? player.gaming_name)},'player',
        ${code.purpose === "claim" ? "player.account.claim" : "player.password.reset"},${player.id},
        ${code.purpose === "claim" ? "Claimed XG account with organizer code" : "Reset password with organizer code"},
        ${xgId},${tx.json({ purpose: code.purpose, nickname_set: !!nickname })})`;
    return {
      ok: true,
      playerId: player.id,
      xgId,
      iat: await databaseSecond(tx),
    };
  });
  return attemptResult(result, WRONG_CODE);
}

/**
 * The session's player, re-checked against the database on every request: still a
 * registered, active player with that XG ID, and the session is not older than
 * their current password (a reset signs out other devices).
 */
export type HubPlayer = {
  id: string;
  public_no: number;
  gaming_name: string;
  team_name: string | null;
  display_nickname: string | null;
  nickname_locked: boolean;
  efootball_cipher: string | null;
};

async function playerForSession(session: PlayerSession) {
  const no = codeNumber(session.xgId);
  const [player] = await db()<HubPlayer[]>`select p.id,p.public_no,p.gaming_name,p.team_name,p.display_nickname,p.nickname_locked,p.efootball_cipher
    from player p join player_credential c on c.player_id=p.id
    where p.id=${session.playerId} and p.public_no=${no} and p.player_type='registered'
      and p.deleted_at is null and c.password_hash is not null
      and floor(extract(epoch from c.password_changed_at)) <= ${session.iat}`;
  return player ?? null;
}

export async function sessionPlayer(request: Request) {
  requirePlayerAuthConfigured();
  const session = playerSessionFrom(request);
  const player = await playerForSession(session);
  if (!player) throw new HttpError(401, "Sign in with your XG ID.");
  return { session, player };
}

/**
 * For server pages: the player a raw xg_player_session value belongs to, after
 * the same checks as the API, or null (signed out, invalid, or not configured).
 */
export async function playerFromCookie(token: string | undefined) {
  if (!playerAuthConfigured()) return null;
  const session = verifySession(token);
  return session ? playerForSession(session) : null;
}

/** GET /api/player/me: the signed-in player's own hub data. */
export async function playerHub(request: Request) {
  const { player } = await sessionPlayer(request);
  return hubData(player);
}

export type PlayerHubData = Awaited<ReturnType<typeof hubData>>;

/** The hub for an already verified player (sessionPlayer or playerFromCookie). */
export async function hubData(player: HubPlayer) {
  const sql = db();
  const code = playerCode(player.public_no);
  const entries = await sql<
    {
      tournament_id: string;
      name: string;
      competition: string | null;
      season: number | null;
      tournament_status: string;
      status: string;
      team_name: string | null;
      created_at: Date;
    }[]
  >`select a.tournament_id,t.name,t.competition,t.season,t.status as tournament_status,a.status,a.team_name,a.created_at
    from application a join tournament t on t.id=a.tournament_id
    where a.player_id=${player.id} and a.deleted_at is null and t.deleted_at is null
    order by a.created_at desc`;
  // Only what the public site already shows for these tournaments.
  const ids = entries.map((e) => e.tournament_id);
  const announcements = ids.length
    ? await sql<
        {
          id: string;
          tournament_id: string;
          title: string;
          message: string;
          created_at: Date;
        }[]
      >`select n.id,n.tournament_id,n.title,n.message,n.created_at from announcement n
        join tournament t on t.id=n.tournament_id
        where n.tournament_id=any(${ids}) and n.published and n.deleted_at is null
          and t.published and t.deleted_at is null
        order by n.created_at desc limit 20`
    : [];
  const profile = await getProfile(code);
  return {
    player: {
      xgId: code,
      gamingName: player.gaming_name,
      displayNickname: player.display_nickname,
      nicknameLocked: player.nickname_locked,
      club: player.team_name,
      // The player's own eFootball ID; never shown to anyone else.
      efootballId: player.efootball_cipher
        ? decrypt(player.efootball_cipher)
        : null,
    },
    entries: entries.map((e) => ({
      tournamentId: e.tournament_id,
      tournament: tournamentLabel(e),
      tournamentStatus: e.tournament_status,
      status: e.status,
      team: e.team_name,
      enteredAt: e.created_at.toISOString(),
    })),
    upcomingMatches: profile?.next ?? [],
    pastMatches: profile?.history ?? [],
    career: profile
      ? {
          totals: profile.totals,
          trophies: profile.trophies,
          form: profile.form,
        }
      : null,
    announcements: announcements.map((n) => ({
      id: n.id,
      tournamentId: n.tournament_id,
      title: n.title,
      message: n.message,
      createdAt: n.created_at.toISOString(),
    })),
  };
}

export const joinInput = z.strictObject({
  teamName: registrationInput.shape.teamName,
});

/**
 * One-click entry for a signed-in XG player. The entry waits for an organizer's
 * decision like any other pending entry. Same safeguards as returning players:
 * open, published tournament; one entry per player; a removed entry is restored
 * only by an organizer.
 */
export async function joinTournament(
  request: Request,
  tournamentId: string,
  input: z.infer<typeof joinInput>,
) {
  const { player } = await sessionPlayer(request);
  if (!/^[a-z0-9-]{3,80}$/.test(tournamentId))
    throw new HttpError(404, "Tournament not found.");
  return db().begin(async (tx) => {
    const t = await lockOpenRegistration(tx, tournamentId);
    const [current] =
      await tx`select 1 from player where id=${player.id} and player_type='registered' and deleted_at is null for update`;
    if (!current) throw new HttpError(401, "Sign in with your XG ID.");
    const [existing] = await tx<{ status: string; deleted_at: Date | null }[]>`
      select status,deleted_at from application where tournament_id=${t} and player_id=${player.id} for update`;
    if (existing && !existing.deleted_at)
      throw new HttpError(
        409,
        `You already have an entry for this tournament (${existing.status}).`,
      );
    if (existing)
      throw new HttpError(
        409,
        "Your earlier entry in this tournament was removed. Contact an organizer to restore it.",
      );
    const [entry] = await tx<{ id: string; status: string }[]>`
      insert into application(tournament_id,player_id,status,team_name,team_name_source)
      values(${t},${player.id},'pending',${input.teamName},'registration')
      on conflict (tournament_id,player_id) do nothing returning id,status`;
    if (!entry)
      throw new HttpError(
        409,
        "You already have an entry for this tournament.",
      );
    const code = playerCode(player.public_no);
    await tx`insert into audit_event(actor,actor_name,actor_role,action,entity,tournament_id,summary,affected,after_value)
      values(${"player:" + player.id},${auditText(player.display_nickname ?? player.gaming_name)},'player','application.create',
        ${entry.id},${t},'Entered from the XG player portal',${code},${tx.json({
          playerId: player.id,
          team: auditRegistrationTeam(input.teamName),
          status: entry.status,
          method: "player_portal",
        })})`;
    // The capacity trigger may have waitlisted it.
    return { ok: true as const, status: entry.status };
  });
}

/* ───────────────────────── Organizer side ───────────────────────── */

export const issueCodeInput = z.strictObject({
  purpose: z.enum(["claim", "reset"]),
});

/**
 * POST /api/admin/players/[id]/one-time-code. Main admins only. Replaces any open
 * code of the same purpose and returns the new code once; only its keyed hash is
 * stored, and the audit log records the purpose, never the code.
 */
export async function issueOneTimeCode(
  playerId: string,
  raw: unknown,
  resolve: (op: "players", t: string) => Promise<Actor> = actor,
) {
  const parsed = issueCodeInput.safeParse(raw);
  if (!parsed.success || !z.string().uuid().safeParse(playerId).success)
    throw new HttpError(400, "Choose a claim or reset code for a player.");
  const { purpose } = parsed.data;
  const organizer = await resolve("players", "*");
  requireRegistrationReviewer(organizer);
  // The hash needs PRIVATE_DATA_KEY; fail before writing anything without it.
  if (!/^[a-f0-9]{64}$/i.test(process.env.PRIVATE_DATA_KEY ?? ""))
    throw new HttpError(503, "Player sign-in is not available yet.");
  return db().begin(async (tx) => {
    const [player] = await tx<
      { id: string; public_no: number; player_type: string }[]
    >`select id,public_no,player_type from player where id=${playerId} and deleted_at is null for update`;
    if (!player) throw new HttpError(404, "Player not found.");
    if (player.player_type !== "registered")
      throw new HttpError(
        409,
        "Guests have no XG account. Only registered players can sign in.",
      );
    const [credential] = await tx<{ password_hash: string | null }[]>`
      select password_hash from player_credential where player_id=${player.id} for update`;
    const claimed = !!credential?.password_hash;
    if (purpose === "claim" && claimed)
      throw new HttpError(
        409,
        "This account is already claimed. Issue a reset code instead.",
      );
    if (purpose === "reset" && !claimed)
      throw new HttpError(
        409,
        "This account hasn't been claimed yet. Issue a claim code instead.",
      );

    recheckRegistrationReviewer(organizer);
    await tx`update player_one_time_code set revoked_at=now()
      where player_id=${player.id} and purpose=${purpose} and used_at is null and revoked_at is null`;
    const code = generateOneTimeCode();
    const [row] = await tx<{ expires_at: Date }[]>`
      insert into player_one_time_code(player_id,purpose,code_hash,expires_at,created_by_admin)
      values(${player.id},${purpose},${oneTimeCodeHash(player.id, purpose, code)},
        now() + make_interval(hours => ${CODE_HOURS}),${organizer.id})
      returning expires_at`;
    const xgId = playerCode(player.public_no);
    await tx`insert into audit_event(actor,actor_name,actor_role,action,entity,summary,affected,after_value)
      values(${organizer.id},${auditText(organizer.name ?? null)},'admin','player.code.issue',${player.id},
        ${purpose === "claim" ? "Issued account claim code" : "Issued password reset code"},${xgId},
        ${tx.json({ purpose, expires_at: row.expires_at.toISOString() })})`;
    return {
      ok: true as const,
      xgId,
      purpose,
      // Shown once, for the organizer to send on WhatsApp. Not stored.
      code,
      expiresAt: row.expires_at.toISOString(),
    };
  });
}
