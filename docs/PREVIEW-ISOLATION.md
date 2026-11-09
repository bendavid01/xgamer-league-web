# Preview / Production database isolation

Status: 9 Nov 2026. Steps marked **Owner** need David's approval or action in Vercel.

## Verification results (read-only)

| Check                                                 | Result                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production deployment                                 | `339cb79` (XG-009) is READY. Build log: `Migrations verified.` Migrations 001–005 matched and nothing was applied.                                                                                                                                                                                                                                                          |
| Live data after XG-009                                | `/champions` is identical to the pre-release baseline: 8 players, 8 matches, 29 goals, same ranking (David 2, Anil 2, Ashiq 1, others 0).                                                                                                                                                                                                                                   |
| Neon connection `xgamer-league` → `xgamer-league-web` | Environments: **Preview + Production**. No preview-branch action. Unchanged since 29 Oct.                                                                                                                                                                                                                                                                                   |
| Production database variables visible to Preview      | 16: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_URL_NO_SSL`, `POSTGRES_PRISMA_URL`, `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`, `PGHOST`, `PGHOST_UNPOOLED`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `NEON_PROJECT_ID`.                                                                    |
| Other Preview variables                               | Preview copies of `AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `PRIVATE_DATA_KEY`, `MAIN_ADMIN_DISCORD_IDS`, `AUTH_URL`, `APP_ORIGIN` and `REGISTRATION_ENABLED`. `SANITY_API_WRITE_TOKEN`, `AUDIT_WEBHOOK_SECRET` and `NEXT_PUBLIC_SANITY_*` are set in all environments. Judging by their names, none is a database connection string (values were not read). |
| Existing preview deployments                          | 7, all behind Vercel Authentication (team login). The 6 READY previews were built on or before 28 Oct, before the Neon database and its variables existed. The only later preview (`feature/mcp-server`, 7 Nov) failed to build and serves nothing. **No running preview holds production database credentials.**                                                           |
| Production migration ledger                           | 001–005 (this code), plus `006_mcp_oauth`, written by that MCP preview build. 006 is left untouched and its file must never be edited. New migrations start at 007.                                                                                                                                                                                                         |

## Done (no production effect)

- **Preview deployments switched off** for the project (Vercel project setting, 9 Nov 2026). Production deploys from `main` work as before. As a second guard, `vercel.json` also disables this work's branches.
- **This branch (not deployed):** builds never change the database:
  - **Production build:** a read-only schema check. The build stops if this code needs a migration that the database doesn't have, or if an applied migration file was edited. Nothing is written.
  - **Preview/development builds:** no database access at all.
  - **Applying migrations:** only with `MIGRATE_ON_BUILD=true` set for one approved production deploy, then removed. Data health warns while it's on.
  - **Deliberate local run:** `npm run db:migrate`, unchanged.

## Proposed configuration

1. **Owner: production credentials out of Preview.**
   - In Vercel → Storage → `xgamer-league` → Projects → `xgamer-league-web`, change the connection's environments to **Production only**.
   - If Vercel offers no way to edit the connection, stop and tell Claude before disconnecting. Disconnecting removes the variables from Production as well.
2. **Owner: a separate preview database with synthetic data.**
   - **Recommended:** a new Neon database `xgamer-preview` (Vercel → Storage → Create → Neon), connected to **Preview only**. It has its own host, user and password and holds no real player data.
   - **If a Neon branch is required:** use Neon's schema-only branch (tables, no rows) and reset that branch's password. A normal branch copies production rows, including encrypted phone numbers, and the production password, so it doesn't meet "synthetic test data".
3. **Owner: separate Preview secrets.**
   - Give Preview its own new `AUTH_SECRET` and `PRIVATE_DATA_KEY`. A shared `AUTH_SECRET` lets a preview build sign sessions that production accepts.
   - Remove `SANITY_API_WRITE_TOKEN` from Preview and Development; it can write to the live archive.
4. **Claude: verify, then re-enable.** After steps 1–3, Claude checks:
   - the variable targets and the store connection
   - that no production variable reaches Preview
   - that migrations and synthetic seed data load into the preview database only

   Previews are switched back on only after these checks.

5. **MCP branch:** don't push or redeploy it. Before any further work it must be rebased on `main` so it gets the build check. Its `006_mcp_oauth.sql` must stay byte-identical.

**Optional (Owner):** delete the 6 old READY previews. They hold no production database credentials, but they are old builds that no longer match the site. Deleting them removes builds only, not data.
