import type { TransactionSql } from "postgres";
import { z } from "zod";
import { actor, HttpError } from "./api";
import type { Actor } from "./access";
import {
  AUDIT_TEXT_ERROR,
  auditRegistrationTeam,
  auditText,
} from "./audit-text";
import { codeNumber, playerCode } from "./codes";
import { db } from "./db";
import { canonicalPhone } from "./phone";
import { fingerprint } from "./private-data";
import {
  checkRegistrationLimit,
  lockOpenRegistration,
  registrationInput,
  requirePendingRoom,
} from "./registration";
import {
  canReviewRegistration,
  fingerprintsMatch,
  lockRegistrationReviewTournament,
  recheckRegistrationReviewer,
  registrationProofMatches,
  registrationReviewReason,
  registrationVerification,
  requireRegistrationReviewer,
} from "./registration-review";

const { tournament, teamName, consent, website } = registrationInput.shape;
const xgId = z
  .string()
  .trim()
  .max(16)
  .transform(codeNumber)
  .pipe(z.number().int().positive());
const phone = z
  .string()
  .max(32)
  .transform((raw, ctx) => {
    const parsed = canonicalPhone(raw);
    if ("phone" in parsed) return parsed.phone;
    ctx.addIssue({ code: "custom", message: parsed.error });
    return z.NEVER;
  });

export const returningRegistrationInput = z.strictObject({
  kind: z.literal("existing"),
  tournament,
  xgId,
  teamName,
  phone,
  consent,
  website,
});

// The proof is separate from player.contact_hash, scoped to this exact claim.
const contactProof = (t: string, no: number, team: string, number: string) =>
  fingerprint(
    "xg:returning-registration:v1:" + JSON.stringify([t, no, team, number]),
  );

export async function submitReturningRegistration(
  input: z.infer<typeof returningRegistrationInput>,
  ip: string,
) {
  await checkRegistrationLimit(ip);
  await db().begin(async (tx) => {
    const t = await lockOpenRegistration(tx, input.tournament);
    const proof = contactProof(t, input.xgId, input.teamName, input.phone);
    // All well-formed claims have the same result, including retries and unknown IDs.
    // This path never reads the player or application tables.
    const [retry] = await tx`select 1 from returning_registration_request
      where tournament_id=${t} and contact_proof=${proof} and status='pending'`;
    if (retry) return;
    // Bounded queue (M4), counted under the tournament lock taken above.
    await requirePendingRoom(tx, "returning", t);
    await tx`insert into returning_registration_request(tournament_id,claimed_public_no,team_name,contact_proof)
      values(${t},${input.xgId},${input.teamName},${proof})
      on conflict (tournament_id,contact_proof) where status='pending' do nothing`;
  });
}

export type PendingReturningRegistration = {
  id: string;
  code: string;
  team: string;
  createdAt: string;
};

export async function pendingReturningRegistrations(user: Actor, t: string) {
  if (!canReviewRegistration(user)) return undefined;
  const rows = await db()<
    {
      id: string;
      claimed_public_no: number;
      team_name: string;
      created_at: Date;
    }[]
  >`
    select id,claimed_public_no,team_name,created_at
    from returning_registration_request
    where tournament_id=${t} and status='pending' order by created_at,id`;
  return rows.map(
    ({
      id,
      claimed_public_no,
      team_name,
      created_at,
    }): PendingReturningRegistration => ({
      id,
      code: playerCode(claimed_public_no),
      team: team_name,
      createdAt: created_at.toISOString(),
    }),
  );
}

const requestId = z.string().uuid();
const command = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("returning.approve"),
    tournament,
    requestId,
    verifiedPhone: phone,
    ...registrationVerification,
  }),
  z.strictObject({
    action: z.literal("returning.reject"),
    tournament,
    requestId,
    reason: registrationReviewReason,
  }),
  z.strictObject({
    action: z.literal("returning.add"),
    tournament,
    xgId,
    teamName,
    // Manual additions are checked against the number on file too (H1).
    verifiedPhone: phone,
    ...registrationVerification,
  }),
]);

export function isReturningRegistrationAction(raw: unknown) {
  return (
    !!raw &&
    typeof raw === "object" &&
    "action" in raw &&
    (raw.action === "returning.approve" ||
      raw.action === "returning.reject" ||
      raw.action === "returning.add")
  );
}

/** Both public requests and manual additions use the existing verified identity. */
export async function executeReturningRegistration(
  raw: unknown,
  resolve = actor,
) {
  const parsed = command.safeParse(raw);
  if (!parsed.success)
    throw new HttpError(
      400,
      parsed.error.issues.some((i) => i.message === AUDIT_TEXT_ERROR)
        ? AUDIT_TEXT_ERROR
        : "Check the details, verification confirmations and reason.",
    );
  const c = parsed.data;
  const t = c.tournament;
  // Linking a global player also makes their details available to this tournament's
  // staff. Keep that decision with the existing player-identity permission.
  const organizer = await resolve("players", t);
  requireRegistrationReviewer(organizer);
  return db().begin(async (tx) => {
    await lockRegistrationReviewTournament(tx, t, c.action !== "returning.reject");
    if (c.action === "returning.add")
      return addVerifiedEntry(tx, organizer, {
        tournamentId: t,
        publicNo: c.xgId,
        team: c.teamName,
        verifiedPhone: c.verifiedPhone,
        why: c.reason,
      });

    const [request] = await tx<
      {
        id: string;
        claimed_public_no: number;
        team_name: string;
        contact_proof: string;
      }[]
    >`
      select id,claimed_public_no,team_name,contact_proof
      from returning_registration_request
      where id=${c.requestId} and tournament_id=${t} and status='pending' for update`;
    if (!request)
      throw new HttpError(
        409,
        "This request is no longer pending in this tournament.",
      );
    if (c.action === "returning.reject") {
      recheckRegistrationReviewer(organizer);
      await tx`update returning_registration_request set
        status='rejected',decided_at=now(),team_name=null,contact_proof=null where id=${request.id}`;
      await tx`insert into audit_event(actor,actor_name,actor_role,action,entity,tournament_id,summary,after_value)
        values(${organizer.id},${auditText(organizer.name ?? null)},'admin','returning.reject',${request.id},${t},
          'Rejected returning-player request',
          ${tx.json({ claimed_xg_id: playerCode(request.claimed_public_no), reason: c.reason })})`;
      return { ok: true };
    }

    const verifiedProof = contactProof(
      t,
      request.claimed_public_no,
      request.team_name,
      c.verifiedPhone,
    );
    if (!registrationProofMatches(verifiedProof, request.contact_proof))
      throw new HttpError(
        409,
        "The verified WhatsApp number does not match this request.",
      );
    return addVerifiedEntry(tx, organizer, {
      tournamentId: t,
      publicNo: request.claimed_public_no,
      team: request.team_name,
      verifiedPhone: c.verifiedPhone,
      why: c.reason,
      claimId: request.id,
    });
  });
}

type VerifiedEntry = {
  tournamentId: string;
  publicNo: number;
  team: string;
  /** The number the organizer verified the person controls. */
  verifiedPhone: string;
  why: string;
  claimId?: string;
};

/**
 * Enters an existing player after a main admin verified them. The verified number
 * must be the player's WhatsApp number on file (H1): a different number is never
 * accepted here and goes through the audited number-change workflow first.
 *
 * Lock order: tournament (caller) → request (caller) → player → application,
 * the same order as contact-change.ts and player-details.ts.
 */
async function addVerifiedEntry(
  tx: TransactionSql,
  organizer: Actor,
  entry: VerifiedEntry,
) {
  const { tournamentId, publicNo, team, verifiedPhone, why, claimId } = entry;
  const code = playerCode(publicNo);
  const [player] = await tx<
    { id: string; contact_hash: string }[]
  >`
    select id,contact_hash from player
    where public_no=${publicNo} and player_type='registered' and deleted_at is null for update`;
  if (!player) throw new HttpError(404, "No active player has that XG ID.");
  if (
    !fingerprintsMatch(
      player.contact_hash,
      fingerprint("whatsapp:" + verifiedPhone),
    )
  ) {
    // Contact changes start from a tournament where the player has an entry.
    const places = await tx<{ name: string }[]>`
      select t.name from application a join tournament t on t.id=a.tournament_id
      where a.player_id=${player.id} and a.deleted_at is null and t.deleted_at is null
      order by a.created_at desc limit 3`;
    throw new HttpError(
      409,
      places.length
        ? `The verified number is not the WhatsApp number on file for ${code}. If the player changed numbers, first complete a WhatsApp number change in Edit player details (open ${code} in ${places.map((p) => p.name).join(" or ")}), then approve. Otherwise reject this request.`
        : `The verified number is not the WhatsApp number on file for ${code}, and ${code} has no tournament entry where a number change can be started. Reject this request and contact the system owner.`,
    );
  }

  const [existing] = await tx<
    {
      id: string;
      status: string;
      deleted_at: Date | null;
      team_name: string | null;
      team_name_source: string | null;
      revision: number;
    }[]
  >`
    select id,status,deleted_at,team_name,team_name_source,revision from application
    where tournament_id=${tournamentId} and player_id=${player.id} for update`;
  if (existing && !existing.deleted_at)
    throw new HttpError(
      409,
      `This player already has an entry for this tournament (${existing.status}).`,
    );
  // One restoration path only: the manual addition below. A request's approval
  // would have to link the old entry, which an earlier request may already own.
  if (existing && claimId)
    throw new HttpError(
      409,
      `${code} was removed from this tournament earlier. Restore that entry with "Add a verified existing player" (it keeps the recorded team), then reject this request as a duplicate.`,
    );

  const verification = {
    playerId: player.id,
    status: "approved",
    method: claimId ? "returning_request" : "manual_existing_player",
    returning_request_id: claimId ?? null,
    identity_verified_by_organizer: true,
    contact_control_verified_by_organizer: true,
    // The server compared the verified number with the number on file (H1).
    contact_matches_number_on_file: true,
    reason: why,
  };

  // Every lock is held: confirm the reviewer is still a main admin before writing.
  recheckRegistrationReviewer(organizer);
  let applicationId: string;
  if (existing) {
    // M2: the entry was removed earlier. The unique (tournament, player) row is
    // reinstated rather than duplicated, and its recorded team and provenance stay
    // as they were; a different team is corrected later in Edit player details.
    const [restored] = await tx<{ id: string }[]>`
      update application set deleted_at=null,status='approved',verified_at=now(),revision=revision+1
      where id=${existing.id} and deleted_at is not null returning id`;
    // Unreachable while the row lock above is held; kept as a guard.
    if (!restored)
      throw new HttpError(409, "This entry changed meanwhile. Refresh and try again.");
    applicationId = restored.id;
    await tx`insert into audit_event(actor,actor_name,actor_role,action,entity,tournament_id,summary,affected,before_value,after_value)
      values(${organizer.id},${auditText(organizer.name ?? null)},'admin','application.restore',${applicationId},${tournamentId},
        'Restored removed entry',${code},${tx.json({
          status: existing.status,
          removed_at: existing.deleted_at!.toISOString(),
          team: auditRegistrationTeam(existing.team_name ?? ""),
          team_name_source: existing.team_name_source,
          revision: existing.revision,
        })},${tx.json({
          ...verification,
          method: "restore_removed_entry",
          team: auditRegistrationTeam(existing.team_name ?? ""),
          requested_team: auditRegistrationTeam(team),
          revision: existing.revision + 1,
        })})`;
  } else {
    const [created] = await tx<{ id: string }[]>`
      insert into application(tournament_id,player_id,status,verified_at,team_name,team_name_source)
      values(${tournamentId},${player.id},'approved',now(),${team},'registration')
      on conflict (tournament_id,player_id) do nothing returning id`;
    if (!created)
      throw new HttpError(
        409,
        "This player already has an entry for this tournament.",
      );
    applicationId = created.id;
    await tx`insert into audit_event(actor,actor_name,actor_role,action,entity,tournament_id,summary,affected,after_value)
      values(${organizer.id},${auditText(organizer.name ?? null)},'admin','application.create',${applicationId},${tournamentId},
        ${claimId ? "Approved returning-player request" : "Added verified existing player"},${code},${tx.json({
          ...verification,
          team: auditRegistrationTeam(team),
        })})`;
  }

  if (claimId) {
    await tx`update returning_registration_request set status='approved',
      decided_at=now(),application_id=${applicationId},team_name=null,contact_proof=null
      where id=${claimId}`;
  }
  return existing
    ? { ok: true as const, restored: true as const, team: existing.team_name }
    : { ok: true as const };
}
