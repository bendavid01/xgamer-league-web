import { z } from "zod";
import type { Actor } from "./access";
import { actor, HttpError } from "./api";
import {
  AUDIT_TEXT_ERROR,
  auditRegistrationTeam,
  auditText,
} from "./audit-text";
import { playerCode } from "./codes";
import { db } from "./db";
import { encrypt, fingerprint } from "./private-data";
import { newPlayerContactProof, registrationInput } from "./registration";
import {
  canReviewRegistration,
  lockRegistrationReviewTournament,
  registrationProofMatches,
  registrationReviewReason,
  registrationVerification,
  requireRegistrationReviewer,
} from "./registration-review";

export type PendingNewPlayerRegistration = {
  reference: string;
  name: string;
  team: string;
  createdAt: string;
};

export async function pendingNewPlayerRegistrations(
  user: Actor,
  tournament: string,
) {
  if (!canReviewRegistration(user)) return undefined;
  const requests = await db()<
    {
      id: string;
      gaming_name: string;
      team_name: string;
      created_at: Date;
    }[]
  >`
    select id,gaming_name,team_name,created_at from new_player_registration_request
    where tournament_id=${tournament} and status='pending' order by created_at,id`;
  return requests.map((r): PendingNewPlayerRegistration => ({
    reference: r.id,
    name: r.gaming_name,
    team: r.team_name,
    createdAt: r.created_at.toISOString(),
  }));
}

const { tournament, phone } = registrationInput.shape;
const reference = z.string().uuid();
const contactConflict = () =>
  new HttpError(
    409,
    "This WhatsApp number is already reserved. Review the applicant's existing XG identity or reject this application.",
  );
const command = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("newPlayer.approve"),
    tournament,
    reference,
    verifiedPhone: phone,
    ...registrationVerification,
  }),
  z.strictObject({
    action: z.literal("newPlayer.reject"),
    tournament,
    reference,
    reason: registrationReviewReason,
  }),
]);

export function isNewPlayerRegistrationAction(raw: unknown) {
  return (
    !!raw &&
    typeof raw === "object" &&
    "action" in raw &&
    (raw.action === "newPlayer.approve" || raw.action === "newPlayer.reject")
  );
}

export async function executeNewPlayerRegistration(
  raw: unknown,
  resolve = actor,
) {
  const parsed = command.safeParse(raw);
  if (!parsed.success)
    throw new HttpError(
      400,
      parsed.error.issues.some((i) => i.message === AUDIT_TEXT_ERROR)
        ? AUDIT_TEXT_ERROR
        : "Check the application, verification confirmations and reason.",
    );
  const c = parsed.data;
  const t = c.tournament;
  const organizer = await resolve("players", t);
  requireRegistrationReviewer(organizer);
  return db().begin(async (tx) => {
    await lockRegistrationReviewTournament(
      tx,
      t,
      c.action === "newPlayer.approve",
    );
    const [request] = await tx<
      {
        id: string;
        gaming_name: string;
        team_name: string;
        contact_proof: string;
        created_at: Date;
        consent_version: string;
      }[]
    >`
      select id,gaming_name,team_name,contact_proof,created_at,consent_version
      from new_player_registration_request
      where id=${c.reference} and tournament_id=${t} and status='pending' for update`;
    if (!request)
      throw new HttpError(
        409,
        "This application is no longer pending in this tournament.",
      );
    requireRegistrationReviewer(organizer);
    if (c.action === "newPlayer.reject") {
      await tx`update new_player_registration_request set status='rejected',
        decided_at=now(),gaming_name=null,team_name=null,contact_proof=null where id=${request.id}`;
      await tx`insert into audit_event(actor,actor_name,actor_role,action,entity,tournament_id,summary,after_value)
        values(${organizer.id},${auditText(organizer.name ?? null)},'admin','newPlayer.reject',${request.id},${t},
          'Rejected new-player application',${tx.json({ reason: c.reason })})`;
      return { ok: true as const };
    }

    if (
      !registrationProofMatches(
        newPlayerContactProof(t, c.verifiedPhone),
        request.contact_proof,
      )
    )
      throw new HttpError(
        409,
        "The verified WhatsApp number does not match this application.",
      );
    const contactHash = fingerprint("whatsapp:" + c.verifiedPhone);
    // Retired identities also reserve their existing contact numbers.
    const [existing] =
      await tx`select 1 from player where contact_hash=${contactHash}`;
    if (existing) throw contactConflict();
    requireRegistrationReviewer(organizer);
    // The unique player contact also guards concurrent decisions in other
    // tournaments and races with the separate contact-change workflow.
    const [player] = await tx<{ id: string; public_no: number }[]>`
      insert into player(gaming_name,team_name,contact_hash,contact_cipher,consent_at,consent_version)
      values(${request.gaming_name},${request.team_name},${contactHash},${encrypt(c.verifiedPhone)},
        ${request.created_at},${request.consent_version})
      on conflict(contact_hash) do nothing returning id,public_no`;
    if (!player) throw contactConflict();
    const [entry] = await tx<{ id: string }[]>`
      insert into application(tournament_id,player_id,status,verified_at,team_name,team_name_source)
      values(${t},${player.id},'approved',now(),${request.team_name},'registration') returning id`;
    await tx`update new_player_registration_request set status='approved',
      decided_at=now(),application_id=${entry.id},gaming_name=null,team_name=null,contact_proof=null where id=${request.id}`;

    const code = playerCode(player.public_no);
    await tx`insert into audit_event(actor,actor_name,actor_role,action,entity,tournament_id,summary,affected,after_value)
      values(${organizer.id},${auditText(organizer.name ?? null)},'admin','application.create',${entry.id},${t},
        'Approved new-player application',${code},${tx.json({
          playerId: player.id,
          team: auditRegistrationTeam(request.team_name),
          status: "approved",
          method: "new_player_approval",
          new_player_request_id: request.id,
          identity_verified_by_organizer: true,
          contact_control_verified_by_organizer: true,
          reason: c.reason,
        })})`;
    return {
      ok: true as const,
      code,
      playerId: player.id,
      applicationId: entry.id,
    };
  });
}
