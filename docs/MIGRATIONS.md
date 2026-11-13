# Database migrations: numbers and status

SQL migration numbers are a separate series from feature IDs (for example, feature XG-008's schema is SQL migration 010). Files live in `migrations/`, are applied once each in name order, and are recorded with their SHA-256 in `xgamer_migration`. An applied file is never edited; changes go into a new migration.

**Production rule:** ordinary builds only check the schema. Migrations reach production through the Neon SQL Editor packet procedure (preflight, target and ledger guard, one transaction with the ledger rows, post-check), each separately authorized.

| Number | Migration | In this repository | Production (13 Nov 2026) | Notes |
| --- | --- | --- | --- | --- |
| 001–005 | control center … announcement dates | yes | applied | |
| 006 | `006_mcp_oauth` | **no** (MCP branch `feature/mcp-server`) | applied by the 7 Nov preview build | Recognized by the build check and left untouched. Its file must stay byte-identical. |
| 007 | `007_application_team_name` | yes | pending | SHA-256 `bbc004390ba1b09cbc7ce09c2fc644192e7d081d92e54a3bfaec397655f5ea41`; never edited |
| 008 | `008_team_name_provenance` | yes | pending | Schema only: the four team-name provenance labels. Needs 007. |
| 009 | `009_contact_change` | yes | pending | Schema only: `contact_version` (default 1), organizer-attestation fields, `contact_change`. Needs 001 and 003. |
| **010** | **`010_player_accounts`** | **reserved** | — | Feature XG-008 (player accounts). Must not add `contact_version` again (009 does). Must keep all four team-name labels in any redefinition of `application_team_name_source_check`. |

**Next release packet:** 007 → 008 → 009 in one transaction, with three ledger rows. Code on the OM branch reads all three, and the production build check stops any deploy until they are recorded.

**Attestation fields (009):** `player.contact_verified_at` and `contact_verification_method` record a manual organizer attestation in OM. They are not automated proof of WhatsApp ownership and never authorization for player login.
