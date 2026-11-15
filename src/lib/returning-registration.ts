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
} from "./registration";
import {
  canReviewRegistration,
  lockRegistrationReviewTournament,
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
      return addVerifiedEntry(tx, organizer, t, c.xgId, c.teamName, c.reason);

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
    requireRegistrationReviewer(organizer);
    if (c.action === "returning.reject") {
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
    return addVerifiedEntry(
      tx,
      organizer,
      t,
      request.claimed_public_no,
      request.team_name,
      c.reason,
      request.id,
    );
  });
}

async function addVerifiedEntry(
  tx: TransactionSql,
  organizer: Actor,
  tournamentId: string,
  publicNo: number,
  team: string,
  why: string,
  claimId?: string,
) {
  const [player] = await tx<{ id: string }[]>`
    select id from player where public_no=${publicNo} and deleted_at is null for update`;
  if (!player) throw new HttpError(404, "No active player has that XG ID.");
  requireRegistrationReviewer(organizer);
  // Keep the existing unique pair, including withdrawn and rejected history.
  const [application] = await tx<{ id: string }[]>`
    insert into application(tournament_id,player_id,status,verified_at,team_name,team_name_source)
    values(${tournamentId},${player.id},'approved',now(),${team},'registration')
    on conflict (tournament_id,player_id) do nothing returning id`;
  if (!application)
    throw new HttpError(
      409,
      "This player already has an entry for this tournament.",
    );

  if (claimId) {
    await tx`update returning_registration_request set status='approved',
      decided_at=now(),application_id=${application.id},team_name=null,contact_proof=null
      where id=${claimId}`;
  }
  const summary = claimId
    ? "Approved returning-player request"
    : "Added verified existing player";
  await tx`insert into audit_event(actor,actor_name,actor_role,action,entity,tournament_id,summary,affected,after_value)
    values(${organizer.id},${auditText(organizer.name ?? null)},'admin','application.create',${application.id},${tournamentId},
      ${summary},${playerCode(publicNo)},${tx.json({
        playerId: player.id,
        team: auditRegistrationTeam(team),
        status: "approved",
        method: claimId ? "returning_request" : "manual_existing_player",
        returning_request_id: claimId ?? null,
        identity_verified_by_organizer: true,
        contact_control_verified_by_organizer: true,
        reason: why,
      })})`;
  return { ok: true };
}
