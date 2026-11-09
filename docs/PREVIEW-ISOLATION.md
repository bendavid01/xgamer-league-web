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

## Decision (PM, 9 Nov 2026)

Preview uses a **separate Neon project, `xgamer-preview`**, with synthetic test records and its own credentials and secrets. Production keeps the current live database. Preview deployments stay disabled until isolation is verified. The live Neon connection must not be disconnected if that could interrupt Production. The unfinished MCP branch is not redeployed.

## Done (no production effect)

- **Preview deployments switched off** (Vercel project setting). `vercel.json` also blocks this work's branches.
- **`SANITY_API_WRITE_TOKEN` removed from Preview.** It is now Production and Development only. Its value is unchanged.
- **Preview has its own new `AUTH_SECRET` and `PRIVATE_DATA_KEY`.** These are the Preview-only records; the Production records are untouched.
- **Builds never change the database** (this branch, PR #5):
  - Production builds run a read-only check.
  - Preview builds don't touch any database.
  - `006_mcp_oauth` is recognized and left untouched.

## Owner steps

1. **Take the live database out of Preview.** In Vercel → Storage → `xgamer-league` → Projects → `xgamer-league-web`, change the connection's environments to **Production only**.
   - If Vercel offers no way to edit the connection, **stop and tell Claude**. Do not disconnect it.
2. **Create the preview database.** Vercel → Storage → Create Database → Neon:
   - name `xgamer-preview`
   - region Singapore (`sin1`)
   - Free plan
   - connect it to `xgamer-league-web` with **Preview only** and no prefix
3. **Tell Claude.** Claude then:
   - verifies the variable targets and both store connections, and that no production database variable reaches Preview
   - loads the schema and synthetic test data into `xgamer-preview` only
   - switches previews back on

**Optional (Owner):** delete the 6 old READY previews. They hold no production database credentials; deleting them removes builds only, not data.
