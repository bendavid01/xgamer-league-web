import { timingSafeEqual } from "node:crypto";
import type { TransactionSql } from "postgres";
import { z } from "zod";
import { adminIds, type Actor } from "./access";
import { HttpError } from "./api";
import { auditNote } from "./audit-text";

export const registrationReviewReason = auditNote(10, 300);
export const registrationVerification = {
  identityVerified: z.literal(true),
  contactVerified: z.literal(true),
  reason: registrationReviewReason,
};

/** Main admins only, in every registration workflow (new, returning and legacy). */
export const canReviewRegistration = (user: Pick<Actor, "id" | "role">) =>
  user.role === "admin" && adminIds().includes(user.id);

export function requireRegistrationReviewer(user: Pick<Actor, "id" | "role">) {
  if (!canReviewRegistration(user))
    throw new HttpError(403, "Only main admins can review registrations.");
}

/**
 * The same check again, made once the decision's locks are held and immediately
 * before anything is written. The first check runs before the transaction, and a
 * lock wait can be long, so the allowlist is re-read at the moment of decision.
 *
 * Limitation: the allowlist is MAIN_ADMIN_DISCORD_IDS, which a running deployment
 * reads from its own environment. Removing an admin takes effect only for a new
 * deployment; existing deployments keep the old list. See "Revoking a main admin"
 * in docs/CONTROL-CENTER-RELEASE.md.
 */
export function recheckRegistrationReviewer(user: Pick<Actor, "id" | "role">) {
  requireRegistrationReviewer(user);
}

export async function lockRegistrationReviewTournament(
  tx: TransactionSql,
  tournament: string,
  approving: boolean,
) {
  const [cup] = await tx<{ status: string }[]>`
    select status from tournament where id=${tournament} and deleted_at is null for update`;
  if (!cup) throw new HttpError(404, "Tournament not found.");
  if (approving) {
    const [fixture] =
      await tx`select 1 from fixture where tournament_id=${tournament} limit 1`;
    if (fixture || !["draft", "open", "locked"].includes(cup.status))
      throw new HttpError(409, "Players are locked once fixtures exist.");
  }
}

// Both request tables constrain proofs to a 64-character hex digest.
export const registrationProofMatches = (verified: string, stored: string) =>
  timingSafeEqual(Buffer.from(verified, "hex"), Buffer.from(stored, "hex"));

/**
 * Compares two keyed hex fingerprints without leaking timing. Unlike a bare
 * timingSafeEqual, a missing or differently sized value is simply unequal.
 */
export const fingerprintsMatch = (a: string | null | undefined, b: string) =>
  typeof a === "string" &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
