# XGamer 2.0 implementation and activation

## Deployment boundary

Continue using Vercel project `prj_BFl9HwZRzBnSgRdxjsQSqdBFbzyJ`, team `team_0S3pngB9m77spOYOSSNowIR0` and https://xgamerproleague.vercel.app. Preserve Sanity project `aqtsgm5o`, dataset `production`, existing content and social destinations. No production Sanity writes or migrations are required.

The owner explicitly requested that new registration and organizer operations stay closed until access can be configured. `REGISTRATION_ENABLED` defaults false. The API accepts no registration without this flag, a private database and encryption key. Admin operations reject requests until exactly two distinct numeric Discord administrator IDs and auth are configured. Nothing in this release provisions a database or claims live application persistence yet.

## Implemented code

- Guest form with explicit consent, normalized IDs, contact preference and honeypot. Server validation, bounded JSON body, exact origin check, keyed contact/game fingerprints, randomized AES-256-GCM encryption, durable hourly abuse counter, stable UUID player IDs and generic duplicate failures. No ownership linking by name, phone or a client-submitted player ID.
- SQL migration with database-enforced 64-slot allocation. Pending review reserves a slot; excess entries waitlist. Rejected/withdrawn entries free slots. Promotion is explicit, never silently approves an unverified player. Database locks serialize registration, review and tournament mutations.
- Auth.js Discord OAuth with state/PKCE and four-hour secure sessions. Exactly two main administrator IDs have equal access; coordinator grants are read from storage on every request. Removing an assignment immediately removes authorization even if the session remains valid. No passwords are collected.
- Control Center registration review, score entry, standings, league generation, qualification, knockout progression, announcements and audit list. Backend commands also assign coordinators, bind a manually verified Discord identity and release encrypted external finals credentials. Forms cover coordinator access, verified Discord linking, finals credential release and playoff evidence.
- One October tournament is seeded in draft status; configure/open/lock and opponent count are supported by API. Default 64 entrants, four opponents, 128 matches and top eight knockout. Existing circle, standings and knockout algorithms are reused. Bracket slots persist in order. League results freeze at qualification; previous knockout rounds freeze after advancement. Cutoff ties block qualification until admins record external playoff winners and evidence; only tied cutoff players can be selected. Playoff matches themselves are played and verified externally.
- Sensitive application, result, role and tournament mutations record before/after in the same transaction. Finals secrets are redacted from audit payloads. Audit UPDATE/DELETE is blocked by a database trigger. This is application-level immutability, not protection against a database owner changing the trigger.
- Finals API requires a signed-in Discord subject explicitly linked by an organizer to a qualified player, and an organizer release flag. Game room setup and contact ownership verification remain manual. Public Sanity never receives credentials or contacts.

## Activation (owner-dependent)

1. Provision a dedicated private PostgreSQL database; do not use a shared database with unrelated public tables. Connect server-only `DATABASE_URL` using TLS. Configure separate preview/development databases; never point tests at production.
2. Configure Vercel locally, link the existing project and pull secrets into ignored `.env.local`. Set a random 32-byte hexadecimal `PRIVATE_DATA_KEY` and high-entropy `AUTH_SECRET` directly in Vercel. Back up the encryption key separately with restricted access: losing it makes private contact data unrecoverable. Rotation needs a decrypt/re-encrypt migration, not simply replacing the key.
3. Create a Discord OAuth app with callback `https://xgamerproleague.vercel.app/api/auth/callback/discord`. Set `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `AUTH_URL`, `APP_ORIGIN` and exactly two numeric IDs in `MAIN_ADMIN_DISCORD_IDS` (comma-separated). Do not put secrets in Git or chat. Register alternate localhost callback only for local testing.
4. Run `npm run db:migrate` only after project linkage and required env verification. The script applies SQL inside a transaction with an advisory lock and checksum ledger. No migration has been run against a hosted database in this release.
5. Configure provider backups/PITR, restricted application credentials and a separate migration owner. Audit triggers do not stop the database owner; revoke mutation permissions on audit rows from the runtime role. Use a dedicated runtime role with only SELECT/INSERT/UPDATE on application tables, INSERT/SELECT on audit_event, and sequence USAGE. No schema administration, TRUNCATE or role management. Keep migration-owner credentials out of the runtime environment.
6. Review Sanity membership and enforce no-delete coordinator permissions at the Sanity service, or keep coordinators entirely out of Studio. See the Studio repository's `docs/CONTROL-CENTER-ACCESS.md`. UI action filtering alone is not security.
7. Run actual isolated staging HTTP flows with both administrators and coordinator identities, parallel 70 applications, malformed submissions, duplicate/retry attempts, score corrections, all knockout rounds, cutoff ties, finals access denial/grant and grant revocation. Perform provider backup restoration into a new database and verify encrypted records using the saved key. Embedded PostgreSQL tests do not establish hosted production or concurrency behavior.
8. Only after those checks: turn registration on, open the tournament through the admin API, redeploy and verify live success/error behavior. Do not publish fake counts while registration is closed.

## Revoking a main admin

Main admins come from the `MAIN_ADMIN_DISCORD_IDS` environment variable, not from the database. Every organizer request checks it. Registration decisions (new-player and returning-player approval, rejection and manual addition, and the Players-tab review) check it once before the transaction. They check it again once every lock is held, immediately before anything is written, so a decision that waited on a lock is recorded only if the reviewer is still on the list.

Limitations of environment-based revocation:

- A deployment reads the variable from its own environment. Editing it in the Vercel project changes nothing for deployments that already exist. Only a deployment built after the change uses the new list. Until that deployment serves production, the removed admin keeps full access. Requests already running on the old deployment finish under the old list. Within one deployment the second check sees the same list as the first, because the environment does not change while it runs.
- Older deployments stay reachable at their own deployment URLs with the old list and their own `AUTH_SECRET`. Make sure Deployment Protection blocks them, or delete them.
- Sign-in sessions last up to four hours, and removing an ID does not end them. A new deployment rejects the removed ID on every request anyway. Rotating `AUTH_SECRET` signs everyone out, but only in deployments built after the rotation.
- Coordinators are different: their access is read from the database on every request, so deactivating one takes effect immediately in every deployment.

To revoke:

1. Set `MAIN_ADMIN_DISCORD_IDS` to the remaining admin and the replacement. The list must have exactly two distinct IDs. Any other value, including a single ID, turns off all organizer access, so it can serve as an emergency stop.
2. Redeploy production and confirm the new deployment is serving the production domain.
3. Check that older deployments are protected or deleted.
4. Review the audit log for the removed admin's recent decisions.

## API operations

`GET /api/admin` returns a private workspace snapshot. `POST /api/admin` requires same-origin JSON and an authorized session. Commands: `review`, `delete` (application soft-delete only), `configure`, `generate`, `qualify`, `score`, `advance`, `announce`, `coordinator`, `finals`. Revision values are required for review/delete/configure/score. Coordinators cannot delete, assign roles, configure tournaments, qualify entrants, read audit records or release credentials, regardless of forged client payloads. Results/announcements-only coordinators receive no contact data.

`POST /api/registrations` accepts gamingName/efootballId/preference/contact/consent/website/tournament. The tournament key is `xgamer-2026-10`. `GET /api/finals` returns released credentials only to a verified qualified Discord identity. No bulk private exports, automatic WhatsApp messages, external game API synchronization, chat or guest account recovery flow is claimed.

## Known unfinished work

Hosted database provisioning and migrations; real Discord sign-in; main admin identity setup; Sanity service-side grants and direct API permission tests; actual staging/production success flows; hosted backup restoration; privacy retention/erasure tooling; provider backup scheduling and runtime database-role provisioning. The public October Cup page reads approved gaming names, persisted fixtures, unified standings and published announcements only; existing public Sanity league pages remain separate and unchanged.

Do not describe this as tournament-ready until the dependencies and remaining flows above are resolved. Keep applications closed until then.
