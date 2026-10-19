# XGamer 2.0: incremental release

## Preserved production

- Repository: bendavid01/xgamer-league-web, production branch main.
- Vercel project: prj_BFl9HwZRzBnSgRdxjsQSqdBFbzyJ.
- Team: team_0S3pngB9m77spOYOSSNowIR0.
- Existing URL: https://xgamer-league-web.vercel.app/.
- Original production commit: 31cd646c918e4782e6888919aeee9ee468b384e9.
- Existing Sanity project aqtsgm5o, dataset production; no migration or content writes during release.
- Existing studio repository and permissions remain unchanged.
- Cyan/slate X-GAMER identity retained.

## Implemented

Public competition overview, match filters/results, group standings, participant records and histories use the existing Sanity documents. Soft-deleted matches and drafts are excluded. Records are not authenticated player identities. Upstream failures are labeled and never replaced with fabricated data.

Browser-only tournament planner supports round robin, seeded knockout with byes and explicit drawn-match winners, and a complete single round-robin league phase followed by knockout. Input order sets seeding. Qualification requires each league pairing exactly once; unresolved cutoff ties block qualification. Scores are drafts; no tournament publication or persistence exists. Preview export contains only the user-entered draft.

Manual external eFootball finals steps are documented in /rules. Actual room creation, messaging and evidence review remain external.

Audit webhook keeps its existing bearer and Sanity signature requirements, adds bounded bodies and structured validation, and uses an event-content hash plus createIfNotExists to retain distinct edits and deduplicate identical deliveries. Existing audit documents are preserved. Audit storage errors fail closed.

## Explicitly not enabled

Account sign-in, recovery, Discord OAuth, guest submissions, admin approvals, private evidence storage, role assignment, chat, automated notifications and account upgrades. /api/registrations returns 503 without reading or storing a submission. /api/admin returns 403. /admin is a public setup explanation containing no private data. /login and /register describe availability rather than simulate successful operations. /status is the public capability inventory.

## Final setup (user deferred identities)

1. Confirm exactly two administrator Discord user IDs; both receive the same server-side permissions. Never infer admins from display names or a client-submitted role.
2. Select/configure a private durable database and managed identity provider. Do not store phone numbers or credentials in the public Sanity dataset. Configure provider secrets directly in Vercel, never chat or source.
3. Implement Discord OAuth with state/PKCE, secure HttpOnly SameSite cookies, verified subjects, session expiry/revocation and recovery. Registration and admin endpoints must verify authorization server-side for every request.
4. Guest phone flow: private normalized number plus consent -> pending verification -> administrator contacts guest -> phone verified -> entry approved. No SMS OTP or automatic WhatsApp.
5. Guest Discord flow: proven Discord ownership -> pending approval -> approved tournament entry. Bot notifications require explicit consent, outbox retries and idempotency.
6. Guest-to-account upgrade: verify ownership of existing guest identity; transactionally link the existing participant ID and retain registrations/results. Never link by matching names or an unverified phone.
7. Add durable rate limits, CSRF/origin checks, idempotency keys and transactional audit events for all mutations before opening registration.
8. Persist tournaments and confirmed results with revision checks, immutable audit trails and organizer review; keep previews isolated.
9. Implement private eFootball evidence upload/review and dispute workflow. No external game synchronization is claimed.
10. Test both administrators independently, rejected/duplicate registrations, ownership attacks, guest upgrades and notification failures before enabling those features.

## Deployment and rollback

Run npm test, npm run lint, npm run build and the production dependency audit. Deploy the exact committed revision through the existing Vercel project and verify live pages and API rejection behavior. Retain all existing environment variables. Do not disable deployment protection.
Rollback through Vercel to the previous production deployment; no data rollback is needed because this release performs no migrations.

## Performance/accessibility

Server-rendered public pages; only navigation, filters, standings and planner hydrate. System fonts avoid third-party font fetches. One transform animation honors reduced motion; no 60 FPS guarantee is claimed without device profiling. Polling runs every 30 seconds only while visible and online. Tables have captions/row headers and horizontal overflow, navigation has accessible controls, and focus/skip links are provided.
