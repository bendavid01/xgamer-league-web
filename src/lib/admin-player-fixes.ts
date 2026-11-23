import { z } from "zod";
import { db } from "./db";
import { actor, HttpError } from "./api";
import type { Actor } from "./access";
import { canonicalPhone } from "./phone";
import { playerCode } from "./codes";
import { contactEditingOn, correctContactAsMainAdmin } from "./contact-change";
import { canReviewRegistration } from "./registration-review";
import { AUDIT_TEXT_ERROR, auditNote, auditText } from "./audit-text";

/**
 * Two main-admin corrections in the OM player drawer (no new tables):
 *
 * 1. Correct WhatsApp: replaces a number that was wrong from the start (for
 *    example a typo at registration). This module checks who is asking and the
 *    input; the database work is correctContactAsMainAdmin in contact-change.ts,
 *    the only module that touches the attestation fields. It is a correction,
 *    not a verification: the number goes back to "never organizer-attested",
 *    and any open number change for the player is cancelled.
 * 2. Remove a rejected entry: hides a rejected tournament entry that never
 *    played a match (for example an old registration carried over to a
 *    reserved founding ID). The row is soft-deleted (application.deleted_at,
 *    a column since 001) and keeps status "rejected"; the audit keeps the
 *    history. Every reader already skips deleted entries: the Player Hub, the
 *    OM snapshots and directory, and the public profile (participantIds, which
 *    never listed rejected entries). The OM drawer hides rejected ones that are
 *    deleted. "No matches" means no fixture, qualification or podium row.
 *
 * Both read only the Discord organizer session (never the player cookie) and
 * answer 403 to anyone who isn't a configured main admin, signed in or not.
 */

type Resolve = (operation: "players", tournament: string) => Promise<Actor>;

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
  return correctContactAsMainAdmin(
    user,
    playerId,
    phone.phone,
    parsed.data.reason,
  );
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
                and player_id=${playerId})
            -- A podium place also puts the tournament on the public profile.
            + (select count(*) from podium where tournament_id=${ref.tournament_id}
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
