import type { TransactionSql } from "postgres";
import { z } from "zod";
import type { Actor } from "./access";
import { actor, HttpError } from "./api";
import {
  AUDIT_TEXT_ERROR,
  auditRegistrationTeam,
  auditText,
} from "./audit-text";
import { playerCode } from "./codes";
import {
  contactReservedByOpenChange,
  lockContactNumber,
  lockPlayerName,
} from "./contact-lock";
import { db } from "./db";
import { encrypt, fingerprint } from "./private-data";
import { newPlayerContactProof, registrationInput } from "./registration";
import {
  canReviewRegistration,
  lockRegistrationReviewTournament,
  recheckRegistrationReviewer,
  registrationProofMatches,
  registrationReviewReason,
  registrationVerification,
  requireRegistrationReviewer,
} from "./registration-review";

/** An existing player record that might be the same person (M3). Never merged. */
export type PossibleMatch = {
  code: string;
  name: string;
  team: string | null;
  retired: boolean;
  sameName: boolean;
  sameTeam: boolean;
};

export type PendingNewPlayerRegistration = {
  reference: string;
  name: string;
  team: string;
  createdAt: string;
  /** Every same-name record (each must be confirmed), then up to 5 same-team ones. */
  possibleMatches: PossibleMatch[];
  /** Same-team records not listed. Team names are often real clubs, so informational. */
  moreMatches: number;
};

const SHOWN_TEAM_MATCHES = 5;

type Sql = ReturnType<typeof db> | TransactionSql;

type Matches = {
  /** Every same-name record, then at most SHOWN_TEAM_MATCHES same-team ones. */
  list: PossibleMatch[];
  /** All same-team-only records, including those not listed. */
  teamOnlyTotal: number;
};

/**
 * Existing players (retired ones included) whose gaming name, current team or any
 * tournament team equals the pending application's, compared after NFKC
 * normalization, case folding and collapsing whitespace. A hint for the reviewer
 * only: names and teams are not identity proof, and nothing is ever merged.
 *
 * Equality joins (hash joins, no cross product), and the database returns every
 * same-name record but only the first few same-team ones per application, so a
 * common club name cannot multiply the result.
 */
async function possibleMatches(
  sql: Sql,
  tournament: string,
  reference?: string,
) {
  const rows = await sql<
    {
      request_id: string;
      public_no: number;
      gaming_name: string;
      team_name: string | null;
      retired: boolean;
      same_name: boolean;
      same_team: boolean;
      team_only_total: number;
    }[]
  >`
    with r as (
      select id,
        btrim(regexp_replace(lower(normalize(gaming_name, NFKC)), '[[:space:]]+', ' ', 'g')) as n,
        btrim(regexp_replace(lower(normalize(team_name, NFKC)), '[[:space:]]+', ' ', 'g')) as tm
      from new_player_registration_request
      where tournament_id=${tournament} and status='pending'
        and (${reference ?? null}::uuid is null or id=${reference ?? null}::uuid)
    ), p as (
      select id,
        btrim(regexp_replace(lower(normalize(gaming_name, NFKC)), '[[:space:]]+', ' ', 'g')) as n,
        btrim(regexp_replace(lower(normalize(coalesce(team_name, ''), NFKC)), '[[:space:]]+', ' ', 'g')) as tm
      from player
    ), teams as (
      select distinct player_id,
        btrim(regexp_replace(lower(normalize(team_name, NFKC)), '[[:space:]]+', ' ', 'g')) as tm
      from application where team_name is not null
    ), by_name as (
      select r.id as request_id, p.id as player_id from r join p on p.n = r.n
    ), by_team as (
      select r.id as request_id, p.id as player_id from r join p on p.tm = r.tm where r.tm <> ''
      union
      select r.id, x.player_id from r join teams x on x.tm = r.tm where r.tm <> ''
    ), m as (
      select coalesce(n.request_id, t.request_id) as request_id,
        coalesce(n.player_id, t.player_id) as player_id,
        n.player_id is not null as same_name,
        t.player_id is not null as same_team
      from by_name n full join by_team t
        on t.request_id = n.request_id and t.player_id = n.player_id
    ), ranked as (
      select m.*, pl.public_no, pl.gaming_name, pl.team_name, pl.deleted_at is not null as retired,
        row_number() over (partition by m.request_id, m.same_name order by pl.public_no) as rank_in_kind,
        (count(*) filter (where not m.same_name) over (partition by m.request_id))::int as team_only_total
      from m join player pl on pl.id = m.player_id
    )
    select request_id, public_no, gaming_name, team_name, retired, same_name, same_team, team_only_total
    from ranked where same_name or rank_in_kind <= ${SHOWN_TEAM_MATCHES}
    order by request_id, same_name desc, same_team desc, public_no`;
  const byRequest = new Map<string, Matches>();
  for (const row of rows) {
    const entry = byRequest.get(row.request_id) ?? {
      list: [],
      teamOnlyTotal: row.team_only_total,
    };
    entry.list.push({
      code: playerCode(row.public_no),
      name: row.gaming_name,
      team: row.team_name,
      retired: row.retired,
      sameName: row.same_name,
      sameTeam: row.same_team,
    });
    byRequest.set(row.request_id, entry);
  }
  return byRequest;
}

export async function pendingNewPlayerRegistrations(
  user: Actor,
  tournament: string,
) {
  if (!canReviewRegistration(user)) return undefined;
  const sql = db();
  const requests = await sql<
    {
      id: string;
      gaming_name: string;
      team_name: string;
      created_at: Date;
    }[]
  >`
    select id,gaming_name,team_name,created_at from new_player_registration_request
    where tournament_id=${tournament} and status='pending' order by created_at,id`;
  const matches = requests.length
    ? await possibleMatches(sql, tournament)
    : new Map<string, Matches>();
  return requests.map((r): PendingNewPlayerRegistration => {
    const found = matches.get(r.id) ?? { list: [], teamOnlyTotal: 0 };
    const shownTeamOnly = found.list.filter((m) => !m.sameName).length;
    return {
      reference: r.id,
      name: r.gaming_name,
      team: r.team_name,
      createdAt: r.created_at.toISOString(),
      possibleMatches: found.list,
      moreMatches: Math.max(found.teamOnlyTotal - shownTeamOnly, 0),
    };
  });
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
    /**
     * The XG IDs with the applicant's name that the reviewer checked and found to be
     * different people (M3). It must cover every same-name record at approval time,
     * so a record that appears after the page was loaded is never confirmed blindly.
     */
    confirmedDistinctFrom: z
      .array(z.string().regex(/^XG-\d{4,10}$/))
      .max(1000)
      .optional(),
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

const describe = (m: PossibleMatch) =>
  `${m.code}${m.retired ? " (removed record)" : ""}`;

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
    if (c.action === "newPlayer.reject") {
      recheckRegistrationReviewer(organizer);
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
    // Serializes with number changes and other approvals of this number (L1).
    await lockContactNumber(tx, contactHash);
    // Retired identities also reserve their existing contact numbers.
    const [existing] =
      await tx`select 1 from player where contact_hash=${contactHash}`;
    if (existing) throw contactConflict();
    if (await contactReservedByOpenChange(tx, contactHash))
      throw new HttpError(
        409,
        "This WhatsApp number is reserved by an open number change for an existing player. Finish or cancel that change first, or review whether the applicant already has an XG ID.",
      );

    // Approvals in other tournaments with the same name wait here, so each one
    // sees the records the others created before it looks for matches.
    await lockPlayerName(tx, request.gaming_name);
    // Possible existing identities, recomputed here rather than trusted from the page (M3).
    const matches =
      (await possibleMatches(tx, t, request.id)).get(request.id)?.list ?? [];
    const sameName = matches.filter((m) => m.sameName);
    const confirmed = new Set(c.confirmedDistinctFrom ?? []);
    const unconfirmed = sameName.filter((m) => !confirmed.has(m.code));
    if (unconfirmed.length)
      throw new HttpError(
        409,
        `Possible existing identity with the same name: ${unconfirmed
          .map(describe)
          .join(", ")}. If the applicant already has an XG ID, reject this application and add them under Returning players. If each is a different person, confirm that and approve again.`,
      );

    // Every lock is held: confirm the reviewer is still a main admin before writing.
    recheckRegistrationReviewer(organizer);
    // The unique player contact still guards anything the lock does not cover.
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
          same_name_records_confirmed_distinct: sameName.map((m) => m.code),
          same_team_records: matches
            .filter((m) => !m.sameName)
            .map((m) => m.code),
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
