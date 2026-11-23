import { z } from "zod";
import type { TransactionSql } from "postgres";
import { db } from "./db";
import { actor, HttpError } from "./api";
import type { Actor } from "./access";
import { encrypt, fingerprint } from "./private-data";
import { canonicalPhone, maskPhone } from "./phone";
import { playerCode } from "./codes";
import { lockContactNumber } from "./contact-lock";
import { contactEditingOn } from "./contact-change";
import { canReviewRegistration } from "./registration-review";
import { AUDIT_TEXT_ERROR, auditNote, auditText } from "./audit-text";

/**
 * Two main-admin corrections in the OM player drawer (no new tables):
 *
 * 1. Correct WhatsApp: replaces a number that was wrong from the start (for
 *    example a typo at registration). It is a correction, not a verification:
 *    the number goes back to "never organizer-attested", so the established-
 *    channel route can't later treat an unchecked number as proven. Any open
 *    number change for the player is cancelled. The audit holds no digits of
 *    any number, like every other contact action.
 * 2. Remove a rejected entry: hides a rejected tournament entry that never
 *    played a match (for example an old registration carried over to a
 *    reserved founding ID). The row is soft-deleted and keeps status
 *    "rejected"; the audit keeps the history.
 *
 * Both read only the Discord organizer session (never the player cookie) and
 * answer 403 to anyone who isn't a configured main admin, signed in or not.
 */

type Resolve = (operation: "players", tournament: string) => Promise<Actor>;
type Tx = TransactionSql;

const uuid = z.string().uuid();
const reason = auditNote(3, 200);

export const correctWhatsAppInput = z.strictObject({
  whatsapp: z.string().max(64),
  reason,
});
export const clearRejectedInput = z.strictObject({ reason });

const ONLY_MAIN_ADMIN = "Only a configured main admin can do this.";

async function mainAdmin(resolve: Resolve) {
  let user: Actor;
  try {
    user = await resolve("players", "*");
  } catch (error) {
    // No Discord organizer session (a player cookie or nothing): forbidden.
    if (error instanceof HttpError && error.status === 401)
      throw new HttpError(403, ONLY_MAIN_ADMIN);
    throw error;
  }
  if (!canReviewRegistration(user)) throw new HttpError(403, ONLY_MAIN_ADMIN);
  return user;
}

function badInput(error: z.ZodError, fallback: string) {
  return new HttpError(
    400,
    error.issues.some((i) => i.message === AUDIT_TEXT_ERROR)
      ? AUDIT_TEXT_ERROR
      : fallback,
  );
}

const REASON_HELP =
  "Give a reason of 3 to 200 characters (for example: Initial wrong number fix).";

/* ───────────────────────── Correct WhatsApp ───────────────────────── */

export async function correctWhatsApp(
  playerId: string,
  raw: unknown,
  resolve: Resolve = actor,
) {
  const user = await mainAdmin(resolve);
  if (!uuid.safeParse(playerId).success)
    throw new HttpError(404, "Player not found.");
  const parsed = correctWhatsAppInput.safeParse(raw);
  if (!parsed.success)
    throw badInput(
      parsed.error,
      parsed.error.issues.some((i) => i.path[0] === "reason")
        ? REASON_HELP
        : "Enter the new WhatsApp number.",
    );
  if (!contactEditingOn())
    throw new HttpError(403, "WhatsApp number editing is switched off.");
  const phone = canonicalPhone(parsed.data.whatsapp);
  if ("error" in phone) throw new HttpError(400, phone.error);
  const newHash = fingerprint("whatsapp:" + phone.phone);

  return db().begin("isolation level read committed", async (tx) => {
    // Lock order: player row → number (contact-lock.ts).
    const [player] = await tx<
      {
        public_no: number;
        contact_hash: string;
        contact_version: number;
        contact_verified_at: Date | null;
        deleted_at: Date | null;
      }[]
    >`select public_no,contact_hash,contact_version,contact_verified_at,deleted_at
      from player where id=${playerId} for update`;
    if (!player || player.deleted_at)
      throw new HttpError(404, "Player not found.");
    if (player.contact_hash === newHash)
      throw new HttpError(400, "That is already this player's number.");
    await lockContactNumber(tx, newHash);
    const [owner] = await tx<{ public_no: number; deleted_at: Date | null }[]>`
      select public_no,deleted_at from player where contact_hash=${newHash} and id<>${playerId}`;
    if (owner)
      throw new HttpError(
        409,
        `This number belongs to ${playerCode(owner.public_no)}${owner.deleted_at ? " (a removed player record)" : ""}.`,
      );
    // A live change for ANOTHER player reserves this number (same expiry rules
    // as contact-change.ts).
    const [reserved] = await tx<{ public_no: number }[]>`
      select p.public_no from contact_change c join player p on p.id=c.player_id
      where c.new_contact_hash=${newHash} and c.player_id<>${playerId}
        and ((c.status='pending_code' and c.expires_at > now())
          or (c.status='awaiting_second_admin' and c.approve_by > now()))
      limit 1`;
    if (reserved)
      throw new HttpError(
        409,
        `This number is reserved by an open WhatsApp change for ${playerCode(reserved.public_no)}.`,
      );

    const code = playerCode(player.public_no);
    const cancelled = await cancelOpenChanges(tx, user, playerId, code);
    // The allowlist again, immediately before writing (registration-review.ts).
    if (!canReviewRegistration(user)) throw new HttpError(403, ONLY_MAIN_ADMIN);
    const [done] = await tx<{ contact_version: number }[]>`
      update player set contact_hash=${newHash}, contact_cipher=${encrypt(phone.phone)},
        contact_version=contact_version+1, contact_verified_at=null, contact_verification_method=null
      where id=${playerId} and contact_version=${player.contact_version} and deleted_at is null
      returning contact_version`;
    if (!done)
      throw new HttpError(409, "Changed by someone else. Reload and try again.");
    await tx`insert into audit_event(actor,actor_name,actor_role,action,entity,summary,affected,before_value,after_value)
      values(${user.id},${auditText(user.name ?? null)},'admin','player.whatsapp_correct',${playerId},
        'Corrected WhatsApp number (main admin)',${code},
        ${tx.json({ contact_version: player.contact_version, attested: !!player.contact_verified_at })},
        ${tx.json({
          contact_version: done.contact_version,
          attested: false,
          cancelled_changes: cancelled,
          reason: auditText(parsed.data.reason),
        })})`;
    return {
      ok: true as const,
      xgId: code,
      masked: maskPhone(phone.phone),
      contactVersion: done.contact_version,
      cancelledChanges: cancelled,
    };
  });
}

/** Ends the player's open number changes; their new-number data is erased. */
async function cancelOpenChanges(
  tx: Tx,
  user: Actor,
  playerId: string,
  code: string,
) {
  const open = await tx<{ id: string; tournament_id: string; status: string }[]>`
    select id,tournament_id,status from contact_change
    where player_id=${playerId} and status in ('pending_code','awaiting_second_admin') for update`;
  for (const ch of open) {
    await tx`update contact_change set status='cancelled', finished_at=now(),
        code_hash=null, challenge_hash=null, new_contact_hash=${"erased:" + ch.id}, new_contact_cipher='erased'
      where id=${ch.id}`;
    await tx`insert into audit_event(actor,actor_name,actor_role,action,entity,tournament_id,summary,affected,before_value,after_value)
      values(${user.id},${auditText(user.name ?? null)},'admin','contact.change_cancel',${ch.id},${ch.tournament_id},
        'Cancelled WhatsApp number change (replaced by a main-admin correction)',${code},
        ${tx.json({ status: ch.status })},${tx.json({ change_id: ch.id, superseded_by: "player.whatsapp_correct" })})`;
  }
  return open.length;
}

/* ───────────────────────── Remove a rejected entry ───────────────────────── */

export async function clearRejectedEntry(
  playerId: string,
  entryId: string,
  raw: unknown,
  resolve: Resolve = actor,
) {
  const user = await mainAdmin(resolve);
  if (!uuid.safeParse(playerId).success || !uuid.safeParse(entryId).success)
    throw new HttpError(404, "Entry not found for this player.");
  const parsed = clearRejectedInput.safeParse(raw);
  if (!parsed.success) throw badInput(parsed.error, REASON_HELP);

  return db().begin(async (tx) => {
    const [ref] = await tx<{ tournament_id: string; player_id: string }[]>`
      select tournament_id,player_id from application where id=${entryId}`;
    if (!ref || ref.player_id !== playerId)
      throw new HttpError(404, "Entry not found for this player.");
    // Lock order: tournament → player → application (player-details.ts).
    const [t] = await tx<{ name: string }[]>`
      select name from tournament where id=${ref.tournament_id} for update`;
    const [player] = await tx<{ public_no: number }[]>`
      select public_no from player where id=${playerId} for update`;
    const [entry] = await tx<
      {
        status: string;
        deleted_at: Date | null;
        player_id: string;
        tournament_id: string;
      }[]
    >`select status,deleted_at,player_id,tournament_id from application where id=${entryId} for update`;
    if (
      !t ||
      !player ||
      !entry ||
      entry.player_id !== playerId ||
      entry.tournament_id !== ref.tournament_id
    )
      throw new HttpError(404, "Entry not found for this player.");
    if (entry.deleted_at)
      throw new HttpError(409, "This entry was already removed.");
    if (entry.status !== "rejected")
      throw new HttpError(
        409,
        `Only a rejected entry can be removed here. This one is ${entry.status}.`,
      );
    const [played] = await tx<{ matches: number }[]>`
      select ((select count(*) from fixture where tournament_id=${ref.tournament_id}
                and (home=${playerId} or away=${playerId}))
            + (select count(*) from qualification where tournament_id=${ref.tournament_id}
                and player_id=${playerId}))::int as matches`;
    if (played.matches > 0)
      throw new HttpError(
        409,
        "This player has matches in that tournament, so the entry stays.",
      );
    if (!canReviewRegistration(user)) throw new HttpError(403, ONLY_MAIN_ADMIN);
    await tx`update application set deleted_at=now(), revision=revision+1 where id=${entryId}`;
    const code = playerCode(player.public_no);
    await tx`insert into audit_event(actor,actor_name,actor_role,action,entity,tournament_id,summary,affected,before_value,after_value)
      values(${user.id},${auditText(user.name ?? null)},'admin','application.clear_rejected',${entryId},${ref.tournament_id},
        'Removed rejected entry (no matches played)',${code},
        ${tx.json({ status: "rejected", matches: 0 })},
        ${tx.json({ status: "rejected", removed: true, player_id: playerId, reason: auditText(parsed.data.reason) })})`;
    return { ok: true as const, xgId: code, tournament: ref.tournament_id };
  });
}
