# Phase 1: public entry and organizer boundary

Review branch only. No migrations, deployment, data changes or production configuration changes were applied.

- Public home: registration and published announcements only; no invented updates, event date banner, oversized competition stats, or technical admin copy.
- Existing season routes and backend logic remain. Route groups preserve URLs. Public navbar/footer do not advertise organizer/status/planner tools.
- OM: separate layout and metadata at /admin, /login, /status and /planner; noindex/follow=false. /admin, /status and /planner require the existing server-side workspace authorization before showing their interface. API authorization remains mandatory on each request. Noindex is not an access control.
- CM: Sanity remains the existing-season editorial workspace. Sanity membership does not grant OM permissions. Operational announcements displayed on home come from the existing published PostgreSQL announcement records, not a new CMS schema.
- Registration: editable fields even while closed; compact required consent. Submission is disabled and API returns 503 unless explicitly enabled with database, a valid encryption key and APP_ORIGIN. Existing strict validation, bounded same-origin JSON requests, honeypot, rate limits, encrypted contact storage, duplicate detection and transactional audit insertion are preserved.
- Discord: https://discord.gg/hYUaqdjaSc.

## Cloud prerequisites (not provisioned in this phase)

OM is a server-hosted route in the web application, not a laptop-hosted service. This branch has not created a separate OM deployment or domain. Review a preview before promoting anything.

Use a dedicated non-production database and encryption key for preview verification. Confirm the existing migration is applied to that database; do not run it against production for this review. Set APP_ORIGIN and AUTH_URL to the exact preview origin, configure AUTH_SECRET and Discord OAuth credentials with its callback /api/auth/callback/discord, and set exactly two distinct MAIN_ADMIN_DISCORD_IDS. Set REGISTRATION_ENABLED=true only when the database, schema and secure configuration are verified. An environment-presence check does not prove database connectivity or migration readiness; failures continue to return an error, never success.

Both main admins have equal existing server permissions. Coordinators retain scoped operations and cannot delete or manage roles. PostgreSQL mutations and their audit events share a transaction, with immutable audit protections tested locally. Production guarantees still require verifying deployed DB grants, backups and actual authenticated flows. Sanity webhook audit delivery, external write paths and Studio deletion restrictions require a separate service-level verification; this phase does not claim complete automatic auditing across both services. Do not grant coordinators broad Sanity write access.

## Review checklist

- [ ] Home has a minimal register action, announcements and the latest Discord invite.
- [ ] Registration fields accept edits while closed; consent checkbox is compact; submit stays disabled with setup notice.
- [ ] No event date/banner or 64/08 oversized stats on home or registration.
- [ ] /admin, /planner and /status show only an access gate when unauthorized; they have separate organizer metadata and no public navigation.
- [ ] Once a preview is safely configured: submit a synthetic application, verify encrypted persistence, duplicate rejection and the corresponding audit event.
- [ ] Sign in as each main admin and a coordinator; verify equal admin access, coordinator no-delete, per-operation scope and reliable audits.
- [ ] Publish a harmless preview announcement in OM and verify it appears on the public home without private fields.
- [ ] Verify Studio CM labeling and separate OM link; do not edit production documents to test.

## Local verification

30 tests pass, including database migration/capacity/immutable-audit tests in isolated PGlite. Lint passes. Web production build passes with `next build --webpack`; default `npm run build` (Turbopack) hit a local worker-startup panic after initial restricted font downloads. Studio build passes, with an existing warning that its auto-update runtime (5.31.1) differs from locked local Sanity 5.3.0. No dependency versions were changed.

HTTP smoke check: /, /register and /admin return 200; /admin renders the closed access gate, has noindex and no public navigation. Unconfigured registration POST returns 503. Live authenticated/production persistence tests remain pending prerequisites above.

Stop after Phase 1 for user review.
