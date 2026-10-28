# Public upgrade (builds on Phase 1)

Review branch only. No production deploy, data change or migration has been applied.

## What changed
- **Homepage:** mobile-first hero without the stadium image. Tournament name, status, format, slots, start date, entry and prize (only when published) and one primary button sit above the fold (≈480px on a 390px phone). The button follows the tournament status: Discord updates → Register now → View tournament → Fixtures → Final standings.
- **Tournament format block, match rule cards and announcements:** all edited in Sanity Studio (Tournaments, Announcements). Nothing appears until it is published. Empty fields are hidden, never filled with placeholder numbers.
- **`/tournament`:** full details page for the tournament marked "Show on homepage".
- **`/rules`:** shows the Studio "Rules page" once published; until then the existing draft rules stay, labelled as drafts. FAQ comes from Studio.
- **Navigation:** Fixtures, Standings, Players and Rules restored (Phase 1 had removed them). The mobile menu is a fully opaque (#0b1118) full-screen panel at z-index 50, with a 44×44px close button, Escape to close, focus trap, scroll lock and grouped links (Tournament / League / Community). "Register" only appears while registration is open.
- **Registration:** WhatsApp number required (Indian numbers accepted without +91) and Discord username optional. The form only accepts entries when OM is configured **and** the published tournament status is "Registration open". The success screen shows the player ID. Migration `002_registration_contacts.sql` adds an optional, separately encrypted Discord contact. `npm run db:migrate` now applies every numbered migration in order.

- **Hero animation:** an animated format diagram (every slot → qualifiers → knockout bracket → champion), drawn from the published player count, format and Top 4/8, so it redraws when the tournament changes. A live countdown shows time until registration closes (or kick-off). One light sweep and a short button pulse run once on load. All motion is CSS, plays once, and is disabled for reduced-motion users (they see the finished diagram).

## Not included (by design)
- No live slot counter. "13 / 64 confirmed" will come from OM once the database is live; it is never typed into Sanity.
- No Room check-in or Submit results links until those features exist.
- The eFootball user ID keeps the existing 6–32 letters/numbers/hyphen rule until the real in-game format is confirmed on a phone.

## Verification
- 36 tests pass (6 new for content normalisation, status buttons, IST dates and CMS link safety; registration and migration tests updated).
- Lint and typecheck pass. `next build --webpack` passes (Google Fonts mocked locally because this build environment blocks them).
- Checked at 390×844 and 1366×900 against sample CMS content: no horizontal scroll, close button 44×44, Escape closes the menu.

## Review checklist
- [ ] Deploy the Studio branch (or run `npm run dev` in the Studio) and create one tournament, one announcement and the Rules page; publish them.
- [ ] Open this PR's Vercel preview and confirm the homepage, `/tournament`, `/rules` and the mobile menu.
- [ ] Switch the tournament status in Studio and confirm the main button changes.
- [ ] Confirm `/register` stays closed until OM registration is configured.
