import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { JSONValue, TransactionSql } from "postgres";
import { z } from "zod";
import { db } from "./db";
import { actor, HttpError } from "./api";
import { adminIds, allowed, type Actor, type Operation } from "./access";
import { decrypt, encrypt, fingerprint, subkey } from "./private-data";
import { canonicalPhone, maskPhone, waUrl } from "./phone";
import { efootballIdInput } from "./registration";
import { playerCode } from "./codes";
import { lockAuditRequest } from "./audit-request";

/**
 * WhatsApp number changes and disclosure in OM (plan revision 2, 13 Nov 2026).
 *
 * Every check here is an ORGANIZER ATTESTATION: a named main admin records that they
 * did a manual check. Nothing authenticates a WhatsApp number automatically.
 *
 * Route 1, established channel (one main admin): only when the current number was
 *   itself organizer-attested before. The code goes to the new number and comes back
 *   from the current attested number.
 * Route 2, independent evidence (two different main admins): every legacy number.
 *   Evidence first (eFootball possession with a server-issued challenge, or a person
 *   who knows the player, live or on video), the code comes back from the new number,
 *   the requesting admin checks the code, then a different main admin approves
 *   within 72 hours.
 *
 * Never stored or logged: full numbers outside their ciphertexts, codes, challenges.
 * The audit holds no digits of any number, no hashes and no ciphertexts.
 */

export const LIMITS = {
  codeMinutes: 30,
  attempts: 5,
  resends: 2,
  changeMinutes: 120,
  approvalHours: 72,
  evidenceMaxAgeDays: 7,
  startsPerPlayerPerDay: 3,
  startsPerAdminPerHour: 10,
  startsPerNumberPerDay: 3,
  disclosuresPerAdminPerHour: 30,
  disclosuresPerPlayerPerHour: 5,
};

export const contactEditingOn = (
  env: Record<string, string | undefined> = process.env,
) => env.CONTACT_EDITING?.trim() === "on";

/** Free text may never carry a phone number: 6+ digits in a row (separators ignored) or "+digit". */
export const PHONE_LIKE = /\+\s*\d|\d(?:[\s.()/-]*\d){5,}/;
const safeText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !PHONE_LIKE.test(v), {
      message:
        "Don't include phone numbers or long digit sequences (write dates like 13 Nov).",
    });

const uuid = z.string().uuid().toLowerCase();
const tid = z.string().regex(/^[a-z0-9-]{3,80}$/);
const requestId = uuid;
const ROUTES = ["established_channel", "independent_evidence"] as const;
const EVIDENCE = [
  "efootball_possession",
  "known_person_live_video",
  "known_person_in_person",
] as const;
const PURPOSES = [
  "registration_check",
  "tournament_coordination",
  "contact_change",
  "admin_review",
] as const;
const COORDINATOR_PURPOSES = ["registration_check", "tournament_coordination"];

const contactCommand = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("contact.change_start"),
    tournament: tid,
    playerId: uuid,
    expectedContactVersion: z.number().int().min(1),
    newPhone: z.string().max(32),
    route: z.enum(ROUTES),
    evidenceType: z.enum(EVIDENCE).optional(),
    evidenceNote: safeText(20, 500).optional(),
    evidenceObservedAt: z.string().datetime({ offset: true }).optional(),
    confirm: z.literal(true),
    reason: safeText(5, 300),
    requestId,
  }),
  z.strictObject({
    action: z.literal("contact.change_resend"),
    tournament: tid,
    changeId: uuid,
    requestId,
  }),
  z.strictObject({
    action: z.literal("contact.change_code"),
    tournament: tid,
    changeId: uuid,
    code: z.string().regex(/^\d{6}$/),
    attest: z.literal(true),
    efootballId: efootballIdInput.optional(),
    challenge: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{6}$/)
      .optional(),
    requestId,
  }),
  z.strictObject({
    action: z.literal("contact.change_approve"),
    tournament: tid,
    changeId: uuid,
    reviewed: z.literal(true),
    reason: safeText(5, 300),
    requestId,
  }),
  z.strictObject({
    action: z.literal("contact.change_cancel"),
    tournament: tid,
    changeId: uuid,
    reason: safeText(5, 300),
    requestId,
  }),
  z.strictObject({
    action: z.literal("contact.disclose"),
    tournament: tid,
    playerId: uuid,
    purpose: z.enum(PURPOSES),
    requestId,
  }),
]);
export type ContactCommand = z.infer<typeof contactCommand>;
export const CONTACT_ACTIONS = contactCommand.options.map(
  (o) => o.shape.action.value,
) as ContactCommand["action"][];
export const isContactCommand = (raw: unknown) =>
  !!raw &&
  typeof raw === "object" &&
  (CONTACT_ACTIONS as string[]).includes(
    String((raw as { action?: unknown }).action),
  );

type Resolve = (operation: Operation, tournament: string) => Promise<Actor>;
type Who = Pick<Actor, "id" | "role" | "name">;

/** POST /api/admin with a contact action. */
export async function executeContact(raw: unknown, resolve: Resolve = actor) {
  const parsed = contactCommand.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.find((i) =>
      i.message.startsWith("Don't include"),
    )?.message;
    throw new HttpError(400, message ?? "Check the details and try again.");
  }
  const c = parsed.data;
  const user = await resolve(
    c.action === "contact.disclose" ? "workspace" : "players",
    c.tournament,
  );
  return runContact(user, c);
}

/** A failure whose bookkeeping (attempt count, expiry) must still be committed. */
class Committed {
  constructor(public error: HttpError) {}
}

function requireMainAdmin(user: Who, changes: boolean) {
  if (changes && !contactEditingOn())
    throw new HttpError(403, "WhatsApp number editing is switched off.");
  if (user.role !== "admin" || !adminIds().includes(user.id))
    throw new HttpError(403, "Only a configured main admin can do this.");
}

async function authorize(tx: Tx, user: Who, c: ContactCommand) {
  if (c.action !== "contact.disclose") {
    requireMainAdmin(user, true);
    return;
  }
  if (user.role === "admin") {
    requireMainAdmin(user, false);
    return;
  }
  if (COORDINATOR_PURPOSES.includes(c.purpose)) {
    const [scope] = await tx<{ operations: string[]; tournaments: string[] }[]>`
      select operations,tournaments from coordinator
      where discord_id=${user.id} and active for share`;
    if (scope && allowed({ ...user, ...scope }, "registrations", c.tournament))
      return;
  }
  throw new HttpError(403, "This operation is not assigned to you.");
}

export async function runContact(user: Who, c: ContactCommand) {
  let out;
  try {
    out = await db().begin("isolation level read committed", (tx) =>
      apply(tx, user, { ...c, requestId: c.requestId.toLowerCase() }),
    );
  } catch (error) {
    // Unique indexes are the final guards: one number per player record, one open change.
    const e = error as { code?: string; constraint_name?: string };
    if (e.code === "23505")
      throw new HttpError(
        409,
        e.constraint_name?.startsWith("contact_change_open")
          ? "There is already an open change for this player or number."
          : "This number belongs to another player record.",
      );
    throw error;
  }
  if (out instanceof Committed) throw out.error;
  return out;
}

type Tx = TransactionSql;
type Change = {
  id: string;
  player_id: string;
  tournament_id: string;
  route: (typeof ROUTES)[number];
  evidence_type: (typeof EVIDENCE)[number] | null;
  new_contact_hash: string;
  new_contact_cipher: string;
  from_contact_version: number;
  code_hash: string | null;
  code_expires_at: Date | null;
  challenge_hash: string | null;
  challenge_confirmed_at: Date | null;
  attempts: number;
  resends: number;
  status: string;
  requested_by: string;
  expires_at: Date;
  approve_by: Date | null;
};

type DisclosurePlayer = {
  public_no: number;
  contact_cipher: string;
  deleted_at: Date | null;
};
type ChangePlayer = Pick<DisclosurePlayer, "public_no" | "deleted_at"> & {
  contact_hash: string;
  contact_version: number;
  contact_verified_at: Date | null;
  efootball_hash: string | null;
  efootball_cipher: string | null;
};

const CHANGED = "Changed by someone else. Reload and try again.";
const USED_REQUEST = "This request was already used for another change.";
const RESTART_CHANGE = "Cancel this number change and start again.";

function requireSecondAdmin(user: Who, change: Change) {
  if (change.requested_by === user.id)
    throw new HttpError(
      403,
      "A second, different main admin must approve this change.",
    );
  if (!adminIds().includes(change.requested_by))
    throw new HttpError(
      409,
      `The admin who started this change is no longer a main admin. ${RESTART_CHANGE}`,
    );
}

const keyed = (label: string, value: string) =>
  createHmac("sha256", subkey(label)).update(value).digest("hex");
const codeHash = (changeId: string, code: string) =>
  keyed("xg-contact-code-v1", `${changeId}:${code}`);
// Both eFootball edit paths re-encrypt the ID with a fresh IV on every write,
// so this revision changes even when an ID is changed back to its old value.
const efootballRevision = (changeId: string, ciphertext: string) =>
  keyed(
    "xg-contact-efootball-revision-v1",
    JSON.stringify([changeId, ciphertext]),
  );
const challengeHash = (changeId: string, revision: string, challenge: string) =>
  keyed(
    "xg-contact-challenge-v2",
    JSON.stringify([changeId, revision, challenge]),
  );
const sameHash = (a: string | null, b: string) =>
  !!a &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
const CHALLENGE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const newChallenge = () =>
  Array.from(
    { length: 6 },
    () => CHALLENGE_ALPHABET[randomInt(CHALLENGE_ALPHABET.length)],
  ).join("");
const minutes = (n: number) => new Date(Date.now() + n * 60_000);
/** A chat with the NEW number, prefilled with the code (only for the admin who asked). */
const sendUrl = (phone: string, code: string) =>
  `${waUrl(phone)}?text=${encodeURIComponent(`XGamer verification code: ${code}`)}`;

function efootballProof(ch: Change, ciphertext: string | null) {
  const parts = ch.challenge_hash?.split(":") ?? [];
  const [version, boundRevision, challengeDigest] = parts;
  const revision = ciphertext && efootballRevision(ch.id, ciphertext);
  // Only versioned proofs can be checked. After checking, erase the challenge
  // digest and keep the revision through approval.
  const expectedParts = ch.status === "pending_code" ? 3 : 2;
  if (
    version !== "v2" ||
    parts.length !== expectedParts ||
    !revision ||
    !sameHash(boundRevision ?? null, revision)
  )
    throw new HttpError(
      409,
      `The eFootball evidence changed or is unbound. ${RESTART_CHANGE}`,
    );
  return { revision, challengeDigest };
}

function wrongCode(attempts: number, efootball: boolean) {
  const left = LIMITS.attempts - attempts;
  return new HttpError(
    409,
    left <= 0
      ? "Wrong details. This change is now closed after 5 wrong attempts."
      : `Wrong code${efootball ? " or eFootball details" : ""}. ${left} attempt${left === 1 ? "" : "s"} left.`,
  );
}

/** Shared counters in the existing rate_limit table; keys are HMACs (no IDs or numbers). */
async function underLimit(tx: Tx, label: string, max: number, seconds: number) {
  const key = keyed("xg-rate-v1", label);
  const [r] =
    await tx`insert into rate_limit(key,hits,expires_at) values(${key},1,now() + make_interval(secs => ${seconds}))
    on conflict(key) do update set
      hits = case when rate_limit.expires_at < now() then 1 else rate_limit.hits + 1 end,
      expires_at = case when rate_limit.expires_at < now() then now() + make_interval(secs => ${seconds}) else rate_limit.expires_at end
    returning hits`;
  return r.hits <= max;
}

async function writeAudit(
  tx: Tx,
  user: Who | null,
  action: string,
  entity: string,
  tournament: string,
  summary: string,
  affected: string,
  before: Record<string, JSONValue>,
  after: Record<string, JSONValue>,
) {
  await tx`insert into audit_event(actor,actor_name,actor_role,action,entity,tournament_id,summary,affected,before_value,after_value)
    values(${user?.id ?? "system:contact-change"},${user?.name ?? null},${user?.role ?? "system"},${action},${entity},${tournament},
      ${summary},${affected},${tx.json(before)},${tx.json(after)})`;
}

/** Ends an open change: the new number's hash and ciphertext, code and challenge are erased. */
async function finish(
  tx: Tx,
  id: string,
  status: "completed" | "cancelled" | "failed" | "expired",
  approvedBy: string | null = null,
) {
  await tx`update contact_change set status=${status}, finished_at=now(), approved_by=coalesce(${approvedBy}, approved_by),
      code_checked_at=case when ${status}='completed' then coalesce(code_checked_at, now()) else code_checked_at end,
      code_hash=null, challenge_hash=null, new_contact_hash=${"erased:" + id}, new_contact_cipher='erased'
    where id=${id}`;
}

async function apply(tx: Tx, user: Who, c: ContactCommand) {
  // Lock the request ID before the rows. Disclosures can share row locks, but
  // only one transaction can consume any request ID.
  await lockAuditRequest(tx, c.requestId);
  await authorize(tx, user, c);
  // Row lock order: tournament → player → application or contact_change.
  let change: Change | null = null;
  let playerId: string | undefined;
  if ("changeId" in c) {
    const [ref] = await tx<
      { player_id: string }[]
    >`select player_id from contact_change
      where id=${c.changeId} and tournament_id=${c.tournament}`;
    playerId = ref?.player_id;
  } else playerId = c.playerId;
  const [t] =
    c.action === "contact.disclose"
      ? await tx`select id from tournament where id=${c.tournament} and deleted_at is null for share`
      : await tx`select id from tournament where id=${c.tournament} and deleted_at is null for update`;
  if (!playerId) throw new HttpError(404, "Number change not found.");
  if (!t) throw new HttpError(404, "Tournament not found.");
  const [target] =
    c.action === "contact.disclose"
      ? await tx<
          DisclosurePlayer[]
        >`select public_no,contact_cipher,deleted_at from player where id=${playerId} for share`
      : await tx<
          ChangePlayer[]
        >`select public_no,contact_hash,contact_version,contact_verified_at,efootball_hash,efootball_cipher,deleted_at
          from player where id=${playerId} for update`;
  if (!target || target.deleted_at)
    throw new HttpError(404, "Player not found.");
  const [entry] = await tx`select 1 from application
    where player_id=${playerId} and tournament_id=${c.tournament} and deleted_at is null for share`;
  if (!entry) throw new HttpError(404, "This player isn't in this tournament.");
  if ("changeId" in c) {
    [change] = await tx<Change[]>`select * from contact_change
        where id=${c.changeId} and tournament_id=${c.tournament} and player_id=${playerId} for update`;
  }
  // Coordinator permissions are share-locked through commit. Re-read the
  // runtime allowlist for admins after waiting for the other row locks.
  if (user.role === "admin")
    requireMainAdmin(user, c.action !== "contact.disclose");
  if ("changeId" in c && !change)
    throw new HttpError(404, "Number change not found.");

  if (change?.route === "independent_evidence") {
    if (
      (c.action === "contact.change_resend" ||
        c.action === "contact.change_code") &&
      change.requested_by !== user.id
    )
      throw new HttpError(
        403,
        "Only the requesting main admin can resend or check the code.",
      );
    if (c.action === "contact.change_approve") requireSecondAdmin(user, change);
  }

  const prior = await tx<
    {
      actor: string;
      action: string;
      entity: string;
      tournament_id: string | null;
      attempts: number | null;
    }[]
  >`select actor,action,entity,tournament_id,
         case when action in ('contact.change_code_rejected','contact.change_failed')
              then (after_value->>'attempts')::int end as attempts
    from audit_event where lower(after_value->>'request_id')=${c.requestId} limit 2`;
  if (prior.length) {
    const [event] = prior;
    // A disclosure request ID is single use. Never decrypt or return contact
    // data from a replay, even when its original scope still matches.
    if (
      prior.length !== 1 ||
      event.actor !== user.id ||
      event.tournament_id !== c.tournament ||
      (change && event.entity !== change.id)
    )
      throw new HttpError(409, USED_REQUEST);
    if (c.action === "contact.disclose")
      throw new HttpError(
        409,
        "This reveal request was already used. Open the number again.",
      );
    if (
      c.action === "contact.change_code" &&
      (event.action === "contact.change_code_rejected" ||
        event.action === "contact.change_failed") &&
      event.attempts !== null
    )
      throw wrongCode(
        event.attempts,
        change?.evidence_type === "efootball_possession",
      );
    if (event.action !== c.action) throw new HttpError(409, USED_REQUEST);
    if (change) return { ok: true, repeated: true, changeId: change.id };
    // A successful start may be acknowledged again for the same player without
    // returning the code, challenge, or number.
    const [started] = await tx`select id from contact_change
      where id::text=${event.entity} and player_id=${playerId}
      and tournament_id=${c.tournament} and requested_by=${user.id}`;
    if (!started) throw new HttpError(409, USED_REQUEST);
    return { ok: true, repeated: true, changeId: event.entity };
  }

  const code = playerCode(target.public_no);
  const base = (extra: Record<string, JSONValue> = {}) => ({
    request_id: c.requestId,
    ...extra,
  });

  /* ── Disclosure (masked by default; full number only on request) ── */
  if (c.action === "contact.disclose") {
    const perAdmin = await underLimit(
      tx,
      `disclose:actor:${user.id}`,
      LIMITS.disclosuresPerAdminPerHour,
      3600,
    );
    const perPlayer = await underLimit(
      tx,
      `disclose:actor:${user.id}:player:${playerId}`,
      LIMITS.disclosuresPerPlayerPerHour,
      3600,
    );
    if (!perAdmin || !perPlayer)
      throw new HttpError(429, "Too many number requests. Try again later.");
    await writeAudit(
      tx,
      user,
      "contact.disclose",
      playerId,
      c.tournament,
      "Viewed WhatsApp number",
      code,
      {},
      base({ purpose: c.purpose }),
    );
    if (user.role === "admin") requireMainAdmin(user, false);
    if (!("contact_cipher" in target)) throw new Error("No contact selected.");
    const phone = decrypt(target.contact_cipher);
    return { ok: true, phone, waUrl: waUrl(phone), masked: maskPhone(phone) };
  }

  if (!("contact_version" in target)) throw new Error("No player selected.");
  const player = target;
  /* ── Start ── */
  if (c.action === "contact.change_start") {
    if (player.contact_version !== c.expectedContactVersion)
      throw new HttpError(409, CHANGED);
    const independent = c.route === "independent_evidence";
    if (!independent) {
      if (!player.contact_verified_at)
        throw new HttpError(
          409,
          "This number was never organizer-attested (legacy), so it isn't an established channel. Use independent evidence with a second admin.",
        );
      if (c.evidenceType || c.evidenceNote || c.evidenceObservedAt)
        throw new HttpError(
          400,
          "Evidence belongs to the independent-evidence route.",
        );
    } else {
      if (!c.evidenceType || !c.evidenceNote)
        throw new HttpError(
          400,
          "Choose the evidence type and describe the check.",
        );
      if (c.evidenceType === "efootball_possession") {
        if (
          !player.efootball_hash ||
          typeof player.efootball_cipher !== "string"
        )
          throw new HttpError(
            409,
            "This player has no eFootball ID on record, so possession can't be checked. Choose another evidence type.",
          );
        if (c.evidenceObservedAt)
          throw new HttpError(
            400,
            "The eFootball check is recorded when the challenge is confirmed.",
          );
      } else {
        const seen = c.evidenceObservedAt
          ? new Date(c.evidenceObservedAt).getTime()
          : NaN;
        if (
          !Number.isFinite(seen) ||
          seen > Date.now() + 5 * 60_000 ||
          seen < Date.now() - LIMITS.evidenceMaxAgeDays * 86_400_000
        )
          throw new HttpError(
            400,
            "Give when you saw the player (within the last 7 days).",
          );
      }
    }
    const parsed = canonicalPhone(c.newPhone);
    if ("error" in parsed) throw new HttpError(400, parsed.error);
    const newHash = fingerprint("whatsapp:" + parsed.phone);
    if (newHash === player.contact_hash)
      throw new HttpError(400, "That is already this player's number.");
    const [owner] =
      await tx`select public_no, deleted_at from player where contact_hash=${newHash}`;
    if (owner)
      throw new HttpError(
        409,
        `This number belongs to ${playerCode(owner.public_no)}${owner.deleted_at ? " (a removed player record)" : ""}.`,
      );
    const [open] =
      await tx`select player_id from contact_change where status in ('pending_code','awaiting_second_admin') and (player_id=${playerId} or new_contact_hash=${newHash}) limit 1`;
    if (open)
      throw new HttpError(
        409,
        open.player_id === playerId
          ? "This player already has an open number change."
          : "This number is already in another open change.",
      );
    const limits = [
      await underLimit(
        tx,
        `start:player:${playerId}`,
        LIMITS.startsPerPlayerPerDay,
        86_400,
      ),
      await underLimit(
        tx,
        `start:actor:${user.id}`,
        LIMITS.startsPerAdminPerHour,
        3600,
      ),
      await underLimit(
        tx,
        `start:number:${newHash}`,
        LIMITS.startsPerNumberPerDay,
        86_400,
      ),
    ];
    if (limits.includes(false))
      throw new HttpError(
        429,
        "Too many number changes started. Try again later.",
      );
    const id = randomUUID();
    const oneTime = newCode();
    const evidenceCipher =
      c.evidenceType === "efootball_possession"
        ? player.efootball_cipher
        : null;
    const challenge = evidenceCipher ? newChallenge() : null;
    let boundChallenge = null;
    if (evidenceCipher && challenge) {
      const revision = efootballRevision(id, evidenceCipher);
      boundChallenge = `v2:${revision}:${challengeHash(id, revision, challenge)}`;
    }
    const expiresAt = minutes(LIMITS.changeMinutes);
    const codeExpires = minutes(LIMITS.codeMinutes);
    requireMainAdmin(user, true);
    await tx`insert into contact_change(id,player_id,tournament_id,route,evidence_type,evidence_note,evidence_observed_at,challenge_hash,
        new_contact_hash,new_contact_cipher,from_contact_version,code_hash,code_expires_at,requested_by,expires_at)
      values(${id},${playerId},${c.tournament},${c.route},${c.evidenceType ?? null},${c.evidenceNote ?? null},${c.evidenceObservedAt ?? null},
        ${boundChallenge},${newHash},${encrypt(parsed.phone)},${player.contact_version},
        ${codeHash(id, oneTime)},${codeExpires},${user.id},${expiresAt})`;
    await writeAudit(
      tx,
      user,
      c.action,
      id,
      c.tournament,
      independent
        ? "Started WhatsApp number change (independent evidence; needs a second admin)"
        : "Started WhatsApp number change (established channel)",
      code,
      { contact_version: player.contact_version },
      base({
        change_id: id,
        route: c.route,
        evidence_type: c.evidenceType ?? null,
        evidence_note: c.evidenceNote ?? null,
        reason: c.reason,
      }),
    );
    return {
      ok: true,
      changeId: id,
      code: oneTime,
      challenge,
      newNumber: maskPhone(parsed.phone),
      sendUrl: sendUrl(parsed.phone, oneTime),
      codeExpiresAt: codeExpires.toISOString(),
    };
  }

  const ch = change!;
  const open = ["pending_code", "awaiting_second_admin"].includes(ch.status);
  if (!open)
    throw new HttpError(
      409,
      `This number change has already ended (${ch.status.replace(/_/g, " ")}).`,
    );

  // Lazy expiry: committed even though the request fails.
  const now = Date.now();
  if (
    (ch.status === "pending_code" &&
      now >= new Date(ch.expires_at).getTime()) ||
    (ch.status === "awaiting_second_admin" &&
      now >= new Date(ch.approve_by!).getTime())
  ) {
    await finish(tx, ch.id, "expired");
    await writeAudit(
      tx,
      null,
      "contact.change_expired",
      ch.id,
      ch.tournament_id,
      "WhatsApp number change expired",
      code,
      { status: ch.status },
      { change_id: ch.id },
    );
    return new Committed(
      new HttpError(409, "This number change expired. Start again if needed."),
    );
  }

  /* ── Cancel ── */
  if (c.action === "contact.change_cancel") {
    await finish(tx, ch.id, "cancelled");
    await writeAudit(
      tx,
      user,
      c.action,
      ch.id,
      ch.tournament_id,
      "Cancelled WhatsApp number change",
      code,
      { status: ch.status },
      base({ change_id: ch.id, reason: c.reason }),
    );
    return { ok: true, changeId: ch.id };
  }

  /* ── Resend: new code, same attempt count, same overall deadline ── */
  if (c.action === "contact.change_resend") {
    if (ch.status !== "pending_code")
      throw new HttpError(409, "The code was already checked.");
    if (ch.evidence_type === "efootball_possession")
      efootballProof(ch, player.efootball_cipher);
    if (player.contact_version !== ch.from_contact_version)
      throw new HttpError(409, CHANGED);
    if (ch.resends >= LIMITS.resends)
      throw new HttpError(
        429,
        "No more resends for this change. Cancel it and start again later.",
      );
    const oneTime = newCode();
    const codeExpires = new Date(
      Math.min(
        minutes(LIMITS.codeMinutes).getTime(),
        new Date(ch.expires_at).getTime(),
      ),
    );
    requireMainAdmin(user, true);
    await tx`update contact_change set code_hash=${codeHash(ch.id, oneTime)}, code_expires_at=${codeExpires}, resends=resends+1 where id=${ch.id}`;
    await writeAudit(
      tx,
      user,
      c.action,
      ch.id,
      ch.tournament_id,
      "Sent a new code for a WhatsApp number change",
      code,
      { resends: ch.resends },
      base({ change_id: ch.id }),
    );
    return {
      ok: true,
      changeId: ch.id,
      code: oneTime,
      sendUrl: sendUrl(decrypt(ch.new_contact_cipher), oneTime),
      codeExpiresAt: codeExpires.toISOString(),
    };
  }

  const complete = async (method: string, approvedBy: string | null) => {
    const [taken] =
      await tx`select public_no, deleted_at from player where contact_hash=${ch.new_contact_hash} and id<>${playerId}`;
    if (taken)
      throw new HttpError(
        409,
        "This number now belongs to another player record.",
      );
    requireMainAdmin(user, true);
    if (approvedBy) requireSecondAdmin(user, ch);
    const [done] =
      await tx`update player set contact_hash=${ch.new_contact_hash}, contact_cipher=${ch.new_contact_cipher},
          contact_version=contact_version+1, contact_verified_at=now(), contact_verification_method=${method}
        where id=${playerId} and contact_version=${ch.from_contact_version} and deleted_at is null
        returning contact_version`;
    if (!done) throw new HttpError(409, CHANGED);
    await finish(tx, ch.id, "completed", approvedBy);
    return done.contact_version as number;
  };

  /* ── Code (and, for eFootball evidence, the possession challenge) ── */
  if (c.action === "contact.change_code") {
    if (ch.status !== "pending_code")
      throw new HttpError(409, "The code was already checked.");
    if (player.contact_version !== ch.from_contact_version)
      throw new HttpError(409, CHANGED);
    if (now >= new Date(ch.code_expires_at!).getTime())
      throw new HttpError(409, "This code expired. Send a new one.");
    const efootball = ch.evidence_type === "efootball_possession";
    if (efootball && (!c.efootballId || !c.challenge))
      throw new HttpError(
        400,
        "Enter the eFootball ID you checked and the challenge you saw on it.",
      );
    const proof = efootball
      ? efootballProof(ch, player.efootball_cipher)
      : null;
    const proofMatches =
      !proof ||
      (sameHash(player.efootball_hash, fingerprint("ef:" + c.efootballId)) &&
        sameHash(
          proof.challengeDigest ?? null,
          challengeHash(ch.id, proof.revision, c.challenge!),
        ));
    const ok = proofMatches && sameHash(ch.code_hash, codeHash(ch.id, c.code));
    requireMainAdmin(user, true);
    if (!ok) {
      const attempts = ch.attempts + 1;
      const exhausted = attempts >= LIMITS.attempts;
      await tx`update contact_change set attempts=${attempts} where id=${ch.id}`;
      if (exhausted) await finish(tx, ch.id, "failed");
      await writeAudit(
        tx,
        user,
        exhausted ? "contact.change_failed" : "contact.change_code_rejected",
        ch.id,
        ch.tournament_id,
        exhausted
          ? "WhatsApp number change closed after 5 wrong attempts"
          : "Rejected a WhatsApp verification attempt",
        code,
        { status: ch.status },
        base({ change_id: ch.id, attempts }),
      );
      return new Committed(wrongCode(attempts, efootball));
    }
    if (ch.route === "established_channel") {
      if (!player.contact_verified_at) throw new HttpError(409, CHANGED);
      const version = await complete(
        "organizer_attested_established_channel",
        null,
      );
      await writeAudit(
        tx,
        user,
        c.action,
        ch.id,
        ch.tournament_id,
        "Changed WhatsApp number (organizer-attested through the established channel)",
        code,
        { contact_version: ch.from_contact_version },
        base({
          change_id: ch.id,
          outcome: "completed",
          contact_version: version,
          method: "organizer_attested_established_channel",
        }),
      );
      return { ok: true, changeId: ch.id, status: "completed" };
    }
    await tx`update contact_change set status='awaiting_second_admin', code_checked_at=now(), code_hash=null,
        challenge_hash=${proof ? `v2:${proof.revision}` : null},
        approve_by=now() + make_interval(hours => ${LIMITS.approvalHours}),
        challenge_confirmed_at=${efootball ? new Date() : null},
        evidence_observed_at=coalesce(evidence_observed_at, ${efootball ? new Date() : null})
      where id=${ch.id}`;
    await writeAudit(
      tx,
      user,
      c.action,
      ch.id,
      ch.tournament_id,
      "Code returned from the new number; waiting for a second admin",
      code,
      { status: ch.status },
      base({
        change_id: ch.id,
        outcome: "awaiting_second_admin",
        efootball_challenge_confirmed: efootball,
      }),
    );
    return { ok: true, changeId: ch.id, status: "awaiting_second_admin" };
  }

  /* ── Second admin approval (Route 2) ── */
  if (
    ch.route !== "independent_evidence" ||
    ch.status !== "awaiting_second_admin"
  )
    throw new HttpError(409, "This change isn't waiting for approval.");
  // Older open requests can have been resent or verified by the approving admin.
  // Check the immutable event trail before honoring the awaiting state.
  const [proof] = await tx<
    { checked_by_requester: boolean; other_issuer: boolean }[]
  >`
    select
      count(*) filter (where action='contact.change_code'
        and after_value->>'outcome'='awaiting_second_admin')=1
        and bool_and(coalesce(actor=${ch.requested_by} and actor_role='admin',false))
          filter (where action='contact.change_code') as checked_by_requester,
      coalesce(bool_or(actor<>${ch.requested_by})
        filter (where action='contact.change_resend'),false) as other_issuer
    from audit_event where entity=${ch.id} and tournament_id=${ch.tournament_id}
      and action in ('contact.change_code','contact.change_resend')`;
  if (!proof.checked_by_requester || proof.other_issuer)
    throw new HttpError(
      409,
      `The verification steps were not completed by the requesting admin. ${RESTART_CHANGE}`,
    );
  if (ch.evidence_type === "efootball_possession") {
    efootballProof(ch, player.efootball_cipher);
    if (!ch.challenge_confirmed_at)
      throw new HttpError(
        409,
        `The eFootball evidence was not confirmed. ${RESTART_CHANGE}`,
      );
  }
  if (player.contact_version !== ch.from_contact_version)
    throw new HttpError(409, CHANGED);
  const version = await complete(
    "organizer_attested_independent_evidence",
    user.id,
  );
  await writeAudit(
    tx,
    user,
    c.action,
    ch.id,
    ch.tournament_id,
    "Approved WhatsApp number change (independent evidence, second admin)",
    code,
    { contact_version: ch.from_contact_version },
    base({
      change_id: ch.id,
      outcome: "completed",
      contact_version: version,
      method: "organizer_attested_independent_evidence",
      requested_by: ch.requested_by,
      reason: c.reason,
    }),
  );
  return { ok: true, changeId: ch.id, status: "completed" };
}

/* ─────────────────────────── Reads ─────────────────────────── */

/** Masked display; a damaged ciphertext shows "unavailable" instead of breaking the view. */
const maskedOf = (cipher: string) => {
  try {
    return maskPhone(decrypt(cipher));
  } catch {
    return "unavailable";
  }
};

/** The contact block of Edit player details. Masked; no ciphertext or hash leaves here. */
export async function contactSummary(playerId: string, viewer: Who) {
  const [p] =
    await db()`select contact_cipher,contact_version,contact_verified_at,contact_verification_method,efootball_hash
      from player where id=${playerId}`;
  if (!p) return null;
  const [change] =
    await db()`select c.id,c.route,c.evidence_type,c.status,c.requested_by,c.created_at,c.code_expires_at,
        c.expires_at,c.approve_by,c.attempts,c.resends,
        (select actor_name from audit_event where action='contact.change_start' and entity=c.id::text limit 1) as requested_by_name
      from contact_change c where c.player_id=${playerId} and c.status in ('pending_code','awaiting_second_admin')`;
  const mainAdmin = viewer.role === "admin" && adminIds().includes(viewer.id);
  return {
    masked: maskedOf(p.contact_cipher),
    version: p.contact_version as number,
    attestedAt: p.contact_verified_at as string | null,
    method: p.contact_verification_method as string | null,
    route1Available: !!p.contact_verified_at,
    hasEfootballId: !!p.efootball_hash,
    editingOn: contactEditingOn(),
    canEdit: mainAdmin && contactEditingOn(),
    openChange: change
      ? {
          id: change.id as string,
          route: change.route as string,
          evidenceType: change.evidence_type as string | null,
          status: change.status as string,
          requestedByMe: change.requested_by === viewer.id,
          requestedByName: change.requested_by_name as string | null,
          createdAt: change.created_at,
          codeExpiresAt: change.code_expires_at,
          expiresAt: change.expires_at,
          approveBy: change.approve_by,
          attemptsLeft: LIMITS.attempts - (change.attempts as number),
          resendsLeft: LIMITS.resends - (change.resends as number),
        }
      : null,
  };
}

/** GET /api/admin?contactChanges=1: open changes, for the second admin's review. */
export async function contactChanges(resolve: Resolve = actor) {
  const user = await resolve("players", "*");
  requireMainAdmin(user, false);
  const rows =
    await db()`select c.id,c.tournament_id,c.route,c.evidence_type,c.evidence_note,c.evidence_observed_at,
      c.challenge_confirmed_at,c.status,c.requested_by,c.created_at,c.code_checked_at,c.approve_by,c.expires_at,
      c.new_contact_cipher,p.public_no,p.gaming_name,
      (select actor_name from audit_event where action='contact.change_start' and entity=c.id::text limit 1) as requested_by_name,
      (select after_value->>'reason' from audit_event where action='contact.change_start' and entity=c.id::text limit 1) as reason
    from contact_change c join player p on p.id=c.player_id
    where c.status in ('pending_code','awaiting_second_admin') order by c.created_at`;
  return {
    editingOn: contactEditingOn(),
    changes: rows.map((r) => ({
      id: r.id as string,
      tournament: r.tournament_id as string,
      code: playerCode(r.public_no),
      gaming_name: r.gaming_name as string,
      route: r.route as string,
      evidenceType: r.evidence_type as string | null,
      evidenceNote: r.evidence_note as string | null,
      evidenceObservedAt: r.evidence_observed_at,
      challengeConfirmedAt: r.challenge_confirmed_at,
      status: r.status as string,
      requestedByName: r.requested_by_name as string | null,
      requestedByMe: r.requested_by === user.id,
      reason: r.reason as string | null,
      createdAt: r.created_at,
      codeCheckedAt: r.code_checked_at,
      approveBy: r.approve_by,
      expiresAt: r.expires_at,
      newNumber: maskedOf(r.new_contact_cipher),
    })),
  };
}
