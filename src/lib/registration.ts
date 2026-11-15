import { z } from "zod";
import type { TransactionSql } from "postgres";
import { db } from "./db";
import { fingerprint } from "./private-data";
import { HttpError } from "./api";

/**
 * Indian mobile numbers only. The form sends 10 digits; pasted "+91…" or "0…" forms are
 * tolerated. Stored as +91XXXXXXXXXX so WhatsApp links work.
 */
export function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : "";
}

const name = (max: number) =>
  z
    .string()
    .trim()
    .min(2)
    .max(max)
    .regex(/^[\p{L}\p{N} _.'&-]+$/u);

export const registrationInput = z.object({
  kind: z.literal("new").optional(),
  playerName: name(40),
  teamName: name(40),
  phone: z
    .string()
    .max(30)
    .transform(normalizePhone)
    .pipe(z.string().regex(/^\+91[6-9]\d{9}$/)),
  consent: z.literal(true),
  website: z.string().max(0),
  tournament: z.string().regex(/^[a-z0-9-]{3,80}$/),
});

export const efootballIdInput = z
  .string()
  .trim()
  .min(6)
  .max(32)
  .regex(/^[a-zA-Z0-9-]+$/)
  .transform((x) => x.toUpperCase());

/** Both public forms share the same attempt limit. */
export async function checkRegistrationLimit(ip: string) {
  const [rate] =
    await db()`insert into rate_limit(key,hits,expires_at) values(${fingerprint("ip:" + ip)},1,now()+interval '1 hour')
    on conflict(key) do update set hits=case when rate_limit.expires_at<now() then 1 else rate_limit.hits+1 end,
    expires_at=case when rate_limit.expires_at<now() then now()+interval '1 hour' else rate_limit.expires_at end returning hits`;
  if (rate.hits > 10)
    throw new HttpError(429, "Too many attempts. Try again in an hour.");
}

export async function lockOpenRegistration(tx: TransactionSql, tournament: string) {
  const [t] = await tx<{ id: string }[]>`
    select id from tournament
    where id=${tournament} and status='open' and published and deleted_at is null
    for update`;
  if (!t) throw new HttpError(409, "Registration for this tournament is closed.");
  return t.id;
}

/**
 * Queue limit (M4): pending requests per tournament, for each public queue.
 * REGISTRATION_PENDING_LIMIT overrides the default of 200 (1–5000).
 * There is deliberately no per-number or per-XG-ID limit: anyone can type someone
 * else's number or XG ID, so such a limit would let them block that person.
 */
export const DEFAULT_PENDING_LIMIT = 200;
export function pendingLimit(
  env: Record<string, string | undefined> = process.env,
) {
  const n = Number(env.REGISTRATION_PENDING_LIMIT);
  return Number.isInteger(n) && n >= 1 && n <= 5000 ? n : DEFAULT_PENDING_LIMIT;
}

/** Call with the tournament row already locked, so the count cannot race. */
export async function requirePendingRoom(
  tx: TransactionSql,
  queue: "new" | "returning",
  tournament: string,
) {
  const [row] =
    queue === "new"
      ? await tx<{ c: number }[]>`select count(*)::int as c from new_player_registration_request
          where tournament_id=${tournament} and status='pending'`
      : await tx<{ c: number }[]>`select count(*)::int as c from returning_registration_request
          where tournament_id=${tournament} and status='pending'`;
  if (row.c >= pendingLimit())
    throw new HttpError(
      429,
      "This tournament has too many applications waiting for review. Please try again later or contact an organizer on Discord.",
    );
}

export const newPlayerContactProof = (tournament: string, phone: string) =>
  fingerprint("xg:new-player-registration:v1:" + JSON.stringify([tournament, phone]));

export async function register(
  input: z.infer<typeof registrationInput>,
  ip: string,
) {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new HttpError(400, "Check the mobile number and try again.");
  await checkRegistrationLimit(ip);
  return db().begin(async (tx) => {
    const tournament = await lockOpenRegistration(tx, input.tournament);
    // Intake records a claim without revealing whether the number is on file.
    const proof = newPlayerContactProof(tournament, phone);
    // An exact retry gets its existing reference, even when the queue is full.
    const [pending] = await tx<{ id: string }[]>`
      select id from new_player_registration_request
      where tournament_id=${tournament} and contact_proof=${proof} and gaming_name=${input.playerName}
        and team_name=${input.teamName} and status='pending'`;
    if (pending) return { reference: pending.id };
    await requirePendingRoom(tx, "new", tournament);
    const [created] = await tx<{ id: string }[]>`
      insert into new_player_registration_request(tournament_id,gaming_name,team_name,contact_proof,consent_version)
      values(${tournament},${input.playerName},${input.teamName},${proof},'2026-10-v3')
      on conflict(tournament_id,contact_proof,gaming_name,team_name) where status='pending'
      do nothing returning id`;
    if (!created)
      throw new HttpError(409, "This application is already waiting for review.");
    return { reference: created.id };
  });
}

export type OpenTournament = {
  competition: string | null;
  season: number | null;
  id: string;
  name: string;
  format: string;
  knockout: boolean;
  qualifiers: number;
  legs: number;
  starts_on: string | null;
  registration_closes: string | null;
  entry_fee: number | null;
  prize: string | null;
  description: string | null;
};

/** Tournaments accepting registrations right now (only when private storage is configured). */
export async function openTournaments(): Promise<OpenTournament[]> {
  if (!registrationConfigured()) return [];
  try {
    return await db()<
      OpenTournament[]
    >`select id,name,competition,season,format,knockout,qualifiers,legs,to_char(starts_on,'YYYY-MM-DD') as starts_on,
        registration_closes::text as registration_closes,entry_fee,prize,description
      from tournament where status='open' and published and deleted_at is null order by created_at desc`;
  } catch {
    return [];
  }
}

export function registrationConfigured(
  env: Record<string, string | undefined> = process.env,
) {
  return (
    env.REGISTRATION_ENABLED === "true" &&
    !!env.DATABASE_URL &&
    /^[a-f0-9]{64}$/i.test(env.PRIVATE_DATA_KEY ?? "") &&
    !!env.APP_ORIGIN &&
    /^https?:\/\/[^/]+$/.test(env.APP_ORIGIN)
  );
}
