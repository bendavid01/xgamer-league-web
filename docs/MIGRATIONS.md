# Database migrations: numbers and status

SQL migration numbers are a separate series from feature IDs (for example, feature XG-008's schema is SQL migration 010). Files live in `migrations/`, are applied once each in name order, and are recorded with their SHA-256 in `xgamer_migration`. An applied file is never edited; changes go into a new migration.

**Production rule:** builds only check the schema; they never apply a migration. Migrations reach production through the Neon SQL Editor packet procedure (preflight, target and ledger guard, one transaction with the ledger rows, post-check), each separately authorized. `MIGRATE_ON_BUILD` no longer does anything. A build that sees it prints a warning and ignores it, on Vercel and everywhere else, and the build script does not import the migration runner. `npm run db:migrate` remains for local databases.

| Number | Migration | In this repository | Production (13 Nov 2026) | Notes |
| --- | --- | --- | --- | --- |
| 001–005 | control center … announcement dates | yes | applied | |
| 006 | `006_mcp_oauth` | **no** (MCP branch `feature/mcp-server`) | applied by the 7 Nov preview build | Recognized by the build check and left untouched. Its file must stay byte-identical. |
| 007 | `007_application_team_name` | yes | pending | SHA-256 `bbc004390ba1b09cbc7ce09c2fc644192e7d081d92e54a3bfaec397655f5ea41`; never edited |
| 008 | `008_team_name_provenance` | yes | pending | Schema only: the four team-name provenance labels. Needs 007. |
| 009 | `009_contact_change` | yes | pending | Schema only: `contact_version` (default 1), organizer-attestation fields, `contact_change`. Needs 001 and 003. |
| **010** | **`010_player_accounts`** | **reserved** | — | Feature XG-008 (player accounts). Must not add `contact_version` again (009 does). Must keep all four team-name labels in any redefinition of `application_team_name_source_check`. |
| 011 | `011_returning_player_registration` | yes | pending | Adds a detached request queue. No backfill or change to existing player, application, result or audit rows. No dependency on 010. |
| 012 | `012_new_player_registration_approval` | yes | pending | Adds a private queue for first-time players. No backfill, renumbering or changes to existing entries. No dependency on 010. |

**Release packet for registration:** 007 → 008 → 009 → 011 → 012 in one transaction for a database still on 001–006, with five ledger rows. The build check requires the full schema for this code. Production remains approval-gated.

**Attestation fields (009):** `player.contact_verified_at` and `contact_verification_method` record a manual organizer attestation in OM. They are not automated proof of WhatsApp ownership and never authorization for player login.

**Returning-player requests (011):** Public intake stores the claimed XG number, tournament team and a keyed contact proof. A main admin checks identity and control of the submitted WhatsApp number. Only approval creates a tournament entry referencing the existing player. Decisions clear the pending proof and record the organizer and reason in the existing audit log. Rotating `PRIVATE_DATA_KEY` invalidates pending proofs, so finish or reject those requests and have the applicants resubmit when needed.

**First-time applications (012):** New submissions receive an application reference. Applicants share it privately with an organizer. A main admin reviews the request in the New applications tab and re-enters the independently verified number. The service checks for contact conflicts during this private review. Approval creates one player and tournament entry and records its audit event in the same transaction. Rejection clears the pending contact proof and applicant details. The proof uses the same key lifecycle as the returning-player queue. Existing pending entries already have permanent XG IDs and stay in the Players tab for review. PostgreSQL's ID sequence can leave a gap after a rolled-back approval. Keep those numbers unused.

**Line endings (M5):** Git stores every migration with LF line endings, and every issued checksum is of that LF form. `.gitattributes` keeps `*.sql` and `migrations/**` LF in every checkout. The runner also normalizes CRLF to LF before hashing and running, so a Windows checkout (`core.autocrlf=true`) gets the same checksums and executes the same bytes. No issued checksum changed. If a ledger row was ever recorded from a CRLF checkout of the same SQL, the build check reports it as a line-ending variant (not an edit) and leaves the ledger untouched.

**Release preflight (L3):** Before the registration packet, run `docs/sql/registration-preflight.sql` against the target. It is read-only (`begin transaction read only … rollback`) and works even without a ledger. It returns one row per check. Any `fail` stops the release:
- PostgreSQL 18 or later
- ledger checksums against the LF values (a CRLF variant is reported as `warn`)
- 006 against its pinned checksum
- unknown ledger rows
- each table and index created by 011 and 012 must be absent before its migration and present after it. This catches a pre-existing object that `create … if not exists` would otherwise keep silently.
- definitions: every index and constraint on these tables (NOT NULL included) is checked as PostgreSQL prints it, for each migration already in the ledger. Existence alone is not enough: an index with the right name but other columns, another predicate or no uniqueness fails, as does an invalid index (for example, left over from a failed concurrent build) and a weakened or missing constraint. The file fixes `search_path` to `public` for its own transaction, so definitions print the same way in any session. Indexes are compared by full definition, name included. Constraints are compared by table, type and definition. A definition owned by a migration not yet applied is left to that migration. A definition on these tables that the migrations don't create is reported as `warn` for review.

`tests/registration-preflight.integration.test.ts` keeps the file in step with `migrations/`.
