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

export const canReviewRegistration = (user: Actor) =>
  user.role === "admin" && adminIds().includes(user.id);

export function requireRegistrationReviewer(user: Actor) {
  if (!canReviewRegistration(user))
    throw new HttpError(403, "Only main admins can review registrations.");
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
