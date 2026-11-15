# Registration queues: limits and retention

**Status:** limits are implemented. The retention policy in section 2 is a **proposal for owner approval**. Nothing on this branch deletes, expires or rejects a pending request automatically.

## 1. Limits (implemented)

| Control | Value | Where |
| --- | --- | --- |
| Attempts per IP address | 10 per hour, shared by both public forms (unchanged) | `checkRegistrationLimit` |
| Pending requests per tournament | 200 per queue: new players and returning players separately. `REGISTRATION_PENDING_LIMIT` (1–5000) overrides it. | `requirePendingRoom` |

How the per-tournament limit behaves:
- It is counted while the tournament row is locked, so simultaneous submissions cannot exceed it.
- An exact retry of a pending request still receives its existing reference when the queue is full.
- A full queue answers 429 with a generic message. It never reveals whether a number or XG ID is on file.
- Nothing already in the queue is changed.

**Not added, on purpose:** limits per WhatsApp number or per claimed XG ID. Anyone can type someone else's number or XG ID. Such a limit would let a stranger use up that person's slots and block their genuine application.

**Trade-off:** a determined flood from many IP addresses can fill a tournament's queue. That stops new public applications for that tournament until organizers clear it, which is better than an unbounded queue. Organizers see the queue size in the New applications and Returning players tabs. Data Health warns about requests older than 30 days.

## 2. Retention (proposal, needs owner approval)

**What a pending request holds:**
- New player: gaming name, team name, a keyed contact proof (never the number), consent version and time.
- Returning player: claimed XG number, team name and keyed proof.

Approval or rejection already clears the name, team and proof.

**Proposed policy:**

1. **Close of registration.** When a tournament's fixtures are generated or it is completed, its pending requests can no longer be approved, only rejected. Proposal: organizers reject them in OM within 7 days, with the reason "Registration closed".
2. **Age limit.** Proposal: a pending request older than 30 days is shown in Data Health (implemented, read-only). After 60 days it is closed as **rejected** with the audit reason "Expired without review", using the same update as a manual rejection: status `rejected`, `decided_at`, and the name, team and proof set to NULL. Rows are never physically deleted, so the audit trail and the `application_id` links stay intact.
3. **Who runs it.** Proposal: a main-admin action in OM ("Close expired requests") that lists the affected requests first and writes one audit row per request. Optionally, a scheduled job that runs the same code, only after it has run manually at least once.
4. **Decided rows.** These keep only status, timestamps, tournament and (for returning claims) the claimed XG number, with no personal data. Proposal: keep them for as long as the tournament's records are kept.
5. **Key rotation.** Rotating `PRIVATE_DATA_KEY` invalidates pending proofs (see `docs/MIGRATIONS.md`). Close or finish pending requests before a rotation.

**Decisions needed from the owner:**
- the 30- and 60-day values
- whether expiry is manual only or also scheduled
- the default limit of 200

## 3. Bulk rejection (proposed follow-up)

A flood can only be cleared one request at a time today. A main-admin bulk "Reject selected" with a single audited reason would make clean-up practical. It is not part of this change.
