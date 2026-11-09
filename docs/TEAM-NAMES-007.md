# Tournament-specific team names (migration 007)

Status: prepared on branch `feature/team-names-007`, which also contains `chore/no-auto-migrations`. Nothing is deployed and nothing has been applied to any shared database. The production migration needs separate approval.

## Requirement

Each player's team name is kept separately for every tournament they enter. The permanent XG player ID never changes, and changing a player's current team does not touch history. Example: XG-0007 played Tournament 1 as Real Madrid, Tournament 2 as Barcelona and Tournament 3 as Arsenal.

## Schema proposal

| Column                               | Meaning                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `application.team_name` (new)        | The team used in that tournament. The `application` row already means "this player in this tournament".     |
| `application.team_name_source` (new) | `registration` (stored at registration), `registration_record` (recovered by 007), or empty (not recorded). |
| `player.team_name` (unchanged)       | The player's current team, from their latest registration.                                                  |

No changes to player IDs, fixtures, results, standings, final positions or the audit trail.

## Migration history (verified 9 Nov 2026)

- This code holds 001–005. On production, 001–005 match: the production build log for `339cb79` says `Migrations verified.`
- Production also has `006_mcp_oauth`, written by the MCP preview build on 7 Nov. It is not in `main`, it holds 3 empty OAuth tables, and it is left untouched.
- **007 is the next free number.** 006 stays reserved for the MCP branch, and its file must stay byte-identical. If that branch is merged later, fresh databases apply 006 before 007, the same order as production. They touch different tables, so they can't conflict.

## Backfill and history preservation

- **Source of truth.** Every registration writes an immutable audit record (`audit_event`, action `application.create`) containing the team that was typed. This has happened since 29 Oct 2026, the same release that added team names. The production database was created that day.
- **Recovery.** 007 copies that recorded team onto its entry (`registration_record`). These are exact values, not guesses.
- **No invented names.** An entry without such a record stays empty and shows without a team. A player's current team is never copied onto an older tournament.
- **Nothing overwritten.** Only empty team fields are filled. Players, IDs, names, current teams and audit records are untouched, and running 007 again changes nothing.
- **Going forward.** From this release on, registration stores the team on the entry directly (`registration`).
- **Expected on production.** Every current entry is recovered. Data health → "Team names per tournament" shows the counts by source.

## Where it shows

- **That tournament's team:**
  - tournament pages
  - Champions tournament pages (Podium, Players, Records)
  - Hall of Fame and the homepage champions
  - the OM registrations list
- **Player profile:** the current team in the header, plus "Team: …" for each tournament in the history and in the tournament view (`?t=`).
- **Current team:** the all-time leaderboards and the XGamer Ranking.

## Release plan (needs approval)

1. Merge `chore/no-auto-migrations` first, or merge both together. Production builds then only check the database.
2. **Owner approves 007.** Release while registration is closed, if possible.
3. **Backup.** In Neon, create a branch `before-007-<date>` from production. It's an instant copy and serves as the restore point.
4. **Before numbers.** Record players, highest XG ID, tournaments, matches, goals and the ranking, as for XG-009.
5. **Apply.** Set `MIGRATE_ON_BUILD=true` for Production only, then merge `feature/team-names-007` into `main`. The build applies 007, then builds.
   - If the build fails, the current version stays live. 007 only adds columns, so the current version keeps working.
6. **Turn it off.** Remove `MIGRATE_ON_BUILD` straight away. Data health should then show "Automatic migrations: Off".
7. **Verify.**
   - Data health: 007 is listed, the team-name counts, and the highest XG ID is unchanged.
   - `/champions` numbers equal the before numbers.
   - Player pages show the teams.

If someone registers between the migration and the new code going live, their team is still in the registration record. Running the same backfill again (a follow-up migration) fills it in.

## Rollback

- **Code:** Vercel Instant Rollback to the previous production deployment. The old code ignores the new columns, so no schema change is needed.
- **Schema:** not needed, because 007 only adds columns. If removal were ever required, it would be a new approved migration dropping the two columns. Current teams and registration records would still hold every name.
- **Data (last resort):** restore from the `before-007` Neon branch.

## Approval package (before asking to run 007 on production)

`docs/sql/007-isolated-test.sql` covers it, with no database credentials leaving Neon:

1. **Verified backup:** a Neon branch `backup-before-007` whose snapshot (Part A) matches production.
2. **Isolated test:** 007 applied to a separate branch `test-007`, never to production.
3. **Reconciliation:** Part A must be identical before and after 007 (players, highest XG ID, entries, results, goals, final positions, audit, fingerprints). Part D lists every recovered team name.
4. **Rollback:** see above. The backup branch is the data restore point.

Status: the design is approved (PM, 9 Nov 2026). Running 007 on production is **not authorized** yet.

## Regression tests (59 passing)

- **`database.test`:** 007 on a pre-007 database.
  - The XG-0007 example is recovered exactly.
  - Entries without a record stay empty; the current team is not copied back.
  - Player IDs, names, current teams and the audit trail are unchanged.
  - Running it twice changes nothing, and unknown sources are rejected.
- **`om.integration` (real PostgreSQL):** one phone number registers for 3 tournaments with 3 teams.
  - The player keeps one XG ID.
  - Each tournament shows its own team.
  - The profile shows the current team and the team for each tournament.
- **`records.test`:** the Hall of Fame shows the team used in that tournament, or none if it wasn't recorded. All-time boards use the current team.
- **`migrations.test`:** ordinary builds never change the database, and the ledger check finds pending, edited and outside migrations.
