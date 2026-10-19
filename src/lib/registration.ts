import { z } from "zod";
import { db } from "./db";
import { encrypt, fingerprint } from "./private-data";
import { HttpError } from "./api";
export const registrationInput = z
  .object({
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
    preference: z.enum(["whatsapp", "discord"]),
    contact: z.string().trim().max(80),
    consent: z.literal(true),
    website: z.string().max(0),
    tournament: z.literal("xgamer-2026-10"),
  })
  .superRefine((v, ctx) => {
    if (
      !(
        v.preference === "whatsapp" ? /^\+[1-9]\d{7,14}$/ : /^[a-z0-9_.]{2,32}$/
      ).test(v.contact)
    )
      ctx.addIssue({
        code: "custom",
        path: ["contact"],
        message: "Use an international phone number or a Discord username.",
      });
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
      chash = fingerprint(input.preference + ":" + input.contact.toLowerCase());
    const [existing] =
      await tx`select id from player where efootball_hash=${ehash} or contact_hash=${chash}`;
    if (existing)
      throw new HttpError(
        409,
        "Unable to create this application. Contact an organizer to recover an existing registration.",
      );
    const [p] =
      await tx`insert into player(gaming_name,efootball_hash,efootball_cipher,contact_hash,contact_cipher,preference,consent_version)
      values(${input.gamingName},${ehash},${encrypt(input.efootballId)},${chash},${encrypt(input.contact)},${input.preference},'2026-10-v1') returning id`;
    const [count] =
      await tx`select count(*)::int as n from application where tournament_id=${t.id} and status in ('pending','approved') and deleted_at is null`;
    const status = count.n < t.capacity ? "pending" : "waitlisted";
    const [application] =
      await tx`insert into application(tournament_id,player_id,status) values(${t.id},${p.id},${status}) returning id,status`;
    await tx`insert into audit_event(actor,action,entity,after_value) values('guest','application.create',${application.id},${tx.json({ playerId: p.id, status })})`;
    return { playerId: p.id, applicationId: application.id, status };
  });
}
