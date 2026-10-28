import { z } from "zod";
import { db } from "./db";
import { encrypt, fingerprint } from "./private-data";
import { HttpError } from "./api";
/** Accepts common Indian formats ("98765 43210", "+91-98765-43210") and returns E.164. */
export function normalizeWhatsApp(value: string) {
  const compact = value.replace(/[\s().-]/g, "");
  if (/^[6-9]\d{9}$/.test(compact)) return `+91${compact}`;
  if (/^91[6-9]\d{9}$/.test(compact)) return `+${compact}`;
  if (/^00[1-9]\d{7,14}$/.test(compact)) return `+${compact.slice(2)}`;
  return compact;
}
export const registrationInput = z.object({
  gamingName: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[\p{L}\p{N} _.'-]+$/u),
  efootballId: z
    .string()
    .trim()
    .min(6)
    .max(32)
    .regex(/^[a-zA-Z0-9-]+$/)
    .transform((x) => x.toUpperCase()),
  whatsapp: z
    .string()
    .max(30)
    .transform(normalizeWhatsApp)
    .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/)),
  discord: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((x) => x?.replace(/^@/, "").toLowerCase() || undefined)
    .pipe(
      z
        .string()
        .regex(/^[a-z0-9_.]{2,32}$/)
        .optional(),
    ),
  consent: z.literal(true),
  website: z.string().max(0),
  tournament: z.literal("xgamer-2026-10"),
});
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
      throw new HttpError(409, "Applications are currently closed.");
    const ehash = fingerprint("ef:" + input.efootballId),
      chash = fingerprint("whatsapp:" + input.whatsapp),
      dhash = input.discord ? fingerprint("discord:" + input.discord) : null;
    const [existing] =
      await tx`select id from player where efootball_hash=${ehash} or contact_hash=${chash} or (${dhash}::text is not null and discord_handle_hash=${dhash})`;
    if (existing)
      throw new HttpError(
        409,
        "Unable to create this application. Contact an organizer to recover an existing registration.",
      );
    const [p] =
      await tx`insert into player(gaming_name,efootball_hash,efootball_cipher,contact_hash,contact_cipher,preference,discord_handle_hash,discord_handle_cipher,consent_version)
      values(${input.gamingName},${ehash},${encrypt(input.efootballId)},${chash},${encrypt(input.whatsapp)},'whatsapp',${dhash},${input.discord ? encrypt(input.discord) : null},'2026-11-v2') returning id`;
    const [count] =
      await tx`select count(*)::int as n from application where tournament_id=${t.id} and status in ('pending','approved') and deleted_at is null`;
    const status = count.n < t.capacity ? "pending" : "waitlisted";
    const [application] =
      await tx`insert into application(tournament_id,player_id,status) values(${t.id},${p.id},${status}) returning id,status`;
    await tx`insert into audit_event(actor,action,entity,after_value) values('guest','application.create',${application.id},${tx.json({ playerId: p.id, status })})`;
    return { playerId: p.id, applicationId: application.id, status };
  });
}
