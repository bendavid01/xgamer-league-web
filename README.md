# X-Gamer Pro League — 2.0 MVP

Production: https://xgamer-league-web.vercel.app/

Next.js App Router, TypeScript, Tailwind, Motion, Lucide and the existing Sanity content source. Cyan/slate X-GAMER branding and the existing production data are retained.

## What's on the site
- **Homepage:** XGamer crest hero (animated glow, light sweep, particles; respects reduced motion), a **LIVE NOW** banner and menu badge while the YouTube channel is streaming, confirmed competitor names, latest fixtures and the community section.
- **Join the arena → `/register`:** player name, team name and a 10-digit Indian WhatsApp number. Shows the tournament's details; players choose when several are open. One entry per phone per tournament; returning players keep their player ID (XG-0001…).
- **Homepage Tournaments section** (live ones, max 3) and a **Tournaments** page with past ones. **Players, Match center and Standings** have one tab per live tournament; the existing Sanity season shows when none is running. Standings are automatic, with the qualification line and Qualified badges.

## Organizer Manager (OM) — `/admin`
Discord sign-in for the two main admins (and optional coordinators). No player counts are shown.
- **Home:** list of tournaments with their stage, **Add** (name + format → Apply), shared **Coordinators** and **Activity log** (who did what, by name, and which players were affected).
- **Inside a tournament:** Players (tick → approve/reject, remove, optional eFootball ID), Set up (format, single or home & away, matches per player, knockout yes/no + Top N, registration-page details, open/close registration), Fixtures & scores (generate with random draw, reset before first score, scores, confirm Top N, finish), Standings, Announcements.
- **Formats:** League (optionally followed by a knockout) or Knockout only. Knockouts are played in the eFootball app; the site records who qualified.
- Every change has an **Apply** button at the bottom-right of its section; Refresh is at the bottom-left.

## Going live (one-time setup)
Set these in Vercel → Settings → Environment Variables (never in Git), then run `npm run db:migrate` once against the database:
- `DATABASE_URL` — private PostgreSQL (e.g. Neon from the Vercel Marketplace).
- `PRIVATE_DATA_KEY` — 64 hex characters (`openssl rand -hex 32`). Back it up: phone numbers cannot be read without it.
- `AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET` — Discord app with redirect `https://xgamer-league-web.vercel.app/api/auth/callback/discord`.
- `MAIN_ADMIN_DISCORD_IDS` — exactly two numeric Discord user IDs, comma-separated.
- `APP_ORIGIN` and `AUTH_URL` — `https://xgamer-league-web.vercel.app`.
- `REGISTRATION_ENABLED=true` — then open registration from OM.
- Optional: `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID` for the Live Now banner.
Until these are set the live site keeps working: registration shows "not open yet", OM stays locked and public pages show the existing season.

## Development
Use Node 24. Run npm ci, npm test, npm run lint and npm run build. Full OM flow against a local PostgreSQL: `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres DATABASE_SSL=disable npm test` (local databases only; the test wipes it). Use npm run dev for local development. .env.example documents public configuration and existing webhook secret names; never commit real credentials.

The public Sanity dataset defaults to the original project aqtsgm5o / production. No data migration is part of this release. The separate bendavid01/xgamer-league-studio repository remains the content administration tool.

See docs/XGAMER-2-MVP.md for architecture, remaining setup, security boundaries and rollback instructions.
