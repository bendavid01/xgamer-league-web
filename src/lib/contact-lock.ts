import type { TransactionSql } from "postgres";

/**
 * Every workflow that can give a WhatsApp number to a player record takes this
 * transaction-scoped lock on the number first (L1): new-player approval, and the
 * start and completion of a number change. Each then re-reads the player and
 * contact_change tables, so a check can no longer pass on both sides of a race.
 * Callers already hold their tournament (and player) row locks, so the order is
 * always rows → number and no lock cycle is possible.
 */
const CONTACT_LOCK_CLASS = 2026111501;

export async function lockContactNumber(tx: TransactionSql, contactHash: string) {
  await tx`select pg_advisory_xact_lock(${CONTACT_LOCK_CLASS}::int, hashtext(${"contact:" + contactHash}))`;
}

/**
 * New-player approvals take this transaction-scoped lock on the applicant's gaming
 * name before looking for same-name records. Approvals in different tournaments
 * hold different tournament locks, so without it two applicants with the same name
 * could each be approved without seeing the other's new record. The second now
 * waits, then finds the first and needs the reviewer's confirmation.
 *
 * The key is the name compared by the possible-match check (NFKC, case folded,
 * whitespace collapsed), so every spelling that check treats as equal shares one
 * lock. A gaming-name change (player-details.ts) takes it for the new name too, so
 * an approval cannot miss a rename committed while it was checking.
 *
 * The name lock is always taken last, after every row and number lock
 * (approval: tournament → request → number → name; rename: tournament → player
 * → entry → name), and nothing waits for another lock while holding it, so no
 * cycle is possible.
 */
const NAME_LOCK_CLASS = 2026111502;

export async function lockPlayerName(tx: TransactionSql, gamingName: string) {
  await tx`select pg_advisory_xact_lock(${NAME_LOCK_CLASS}::int, hashtext('name:' ||
    btrim(regexp_replace(lower(normalize(${gamingName}::text, NFKC)), '[[:space:]]+', ' ', 'g'))))`;
}

/**
 * True while a live number change reserves this number for an existing player.
 * Expiry in contact-change.ts is lazy, so a change past its deadline (the same
 * conditions it uses) no longer reserves the number; its own completion re-checks
 * the player table and refuses a number that has been taken meanwhile.
 */
export async function contactReservedByOpenChange(
  tx: TransactionSql,
  contactHash: string,
) {
  const [open] = await tx`select 1 from contact_change
    where new_contact_hash=${contactHash}
      and ((status='pending_code' and expires_at > now())
        or (status='awaiting_second_admin' and approve_by > now()))
    limit 1`;
  return !!open;
}
