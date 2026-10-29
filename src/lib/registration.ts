import { z } from "zod";
import { db } from "./db";
import { encrypt, fingerprint } from "./private-data";
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
      await tx`select * from tournament where id=${input.tournament} and deleted_at is null for update`;
    if (!t || t.status !== "open")
      throw new HttpError(409, "Registration for this tournament is closed.");
    const phoneHash = fingerprint("whatsapp:" + input.phone);
    let [player] =
      await tx`select id,public_no from player where contact_hash=${phoneHash} and deleted_at is null for update`;
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
        values(${input.playerName},${input.teamName},${phoneHash},${encrypt(input.phone)},'whatsapp','2026-10-v3') returning id,public_no`;
    }
    const [application] =
      await tx`insert into application(tournament_id,player_id,status) values(${t.id},${player.id},'pending') returning id,status`;
    const code = `XG-${String(player.public_no).padStart(4, "0")}`;
    await tx`insert into audit_event(actor,actor_name,actor_role,action,entity,tournament_id,summary,affected,after_value)
      values(${"player:" + player.id},${input.playerName},'player','application.create',${application.id},${t.id},'Registered',${code},${tx.json({ playerId: player.id, team: input.teamName, status: application.status })})`;
    return {
      playerId: player.id as string,
      code,
      status: application.status as string,
    };
  });
}

export type OpenTournament = {
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
    >`select id,name,format,knockout,qualifiers,legs,to_char(starts_on,'YYYY-MM-DD') as starts_on,
        registration_closes::text as registration_closes,entry_fee,prize,description
      from tournament where status='open' and deleted_at is null order by created_at desc`;
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
