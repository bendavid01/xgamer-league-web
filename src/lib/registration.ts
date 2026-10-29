import { z } from "zod";
import { db } from "./db";
import { encrypt, fingerprint } from "./private-data";
import { HttpError } from "./api";
import { TOURNAMENT_ID } from "./current";

/** Accepts common Indian formats ("98765 43210", "+91-98765-43210") and returns E.164. */
export function normalizePhone(value: string) {
  const compact = value.replace(/[\s().-]/g, "");
  if (/^[6-9]\d{9}$/.test(compact)) return `+91${compact}`;
  if (/^0[6-9]\d{9}$/.test(compact)) return `+91${compact.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(compact)) return `+${compact}`;
  if (/^00[1-9]\d{7,14}$/.test(compact)) return `+${compact.slice(2)}`;
  return compact;
}

const name = (max: number) =>
  z
    .string()
    .trim()
    .min(2)
    .max(max)
    .regex(/^[\p{L}\p{N} _.'&-]+$/u);

export const registrationInput = z.object({
  playerName: name(40),
  teamName: name(40),
  phone: z
    .string()
    .max(30)
    .transform(normalizePhone)
    .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/)),
  consent: z.literal(true),
  website: z.string().max(0),
});

export const efootballIdInput = z
  .string()
  .trim()
  .min(6)
  .max(32)
  .regex(/^[a-zA-Z0-9-]+$/)
  .transform((x) => x.toUpperCase());

export async function register(
  input: z.infer<typeof registrationInput>,
  ip: string,
) {
  const sql = db();
  const [rate] =
    await sql`insert into rate_limit(key,hits,expires_at) values(${fingerprint("ip:" + ip)},1,now()+interval '1 hour')
    on conflict(key) do update set hits=case when rate_limit.expires_at<now() then 1 else rate_limit.hits+1 end,
    expires_at=case when rate_limit.expires_at<now() then now()+interval '1 hour' else rate_limit.expires_at end returning hits`;
  if (rate.hits > 10)
    throw new HttpError(429, "Too many attempts. Try again in an hour.");
  return sql.begin(async (tx) => {
    const [t] =
      await tx`select * from tournament where id=${TOURNAMENT_ID} and deleted_at is null for update`;
    if (!t || t.status !== "open")
      throw new HttpError(409, "Registration is closed right now.");
    const phoneHash = fingerprint("whatsapp:" + input.phone);
    let [player] =
      await tx`select id from player where contact_hash=${phoneHash} and deleted_at is null for update`;
    if (player) {
      const [existing] =
        await tx`select id from application where tournament_id=${t.id} and player_id=${player.id} and deleted_at is null`;
      if (existing)
        throw new HttpError(
          409,
          "This phone number is already registered for this tournament.",
        );
      // Returning player keeps their permanent player ID; refresh the public name and team.
      await tx`update player set gaming_name=${input.playerName},team_name=${input.teamName} where id=${player.id}`;
    } else {
      [player] =
        await tx`insert into player(gaming_name,team_name,contact_hash,contact_cipher,preference,consent_version)
        values(${input.playerName},${input.teamName},${phoneHash},${encrypt(input.phone)},'whatsapp','2026-10-v3') returning id`;
    }
    const [application] =
      await tx`insert into application(tournament_id,player_id,status) values(${t.id},${player.id},'pending') returning id,status`;
    await tx`insert into audit_event(actor,action,entity,after_value) values('guest','application.create',${application.id},${tx.json({ playerId: player.id, status: application.status })})`;
    return {
      playerId: player.id as string,
      status: application.status as string,
    };
  });
}

/** Registration accepts entries only when private storage is configured AND OM has opened it. */
export async function registrationOpen() {
  if (!registrationConfigured()) return false;
  try {
    const [t] =
      await db()`select status from tournament where id=${TOURNAMENT_ID} and deleted_at is null`;
    return t?.status === "open";
  } catch {
    return false;
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
