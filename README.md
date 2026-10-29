# X-Gamer Pro League — 2.0 MVP

Production: https://xgamer-league-web.vercel.app/

Next.js App Router, TypeScript, Tailwind, Motion, Lucide and the existing Sanity content source. Cyan/slate X-GAMER branding and the existing production data are retained.

## What's on the site
- **Homepage:** XGamer crest hero (animated glow, light sweep, particles; respects reduced motion), a **LIVE NOW** banner and menu badge while the YouTube channel is streaming, confirmed competitor names, latest fixtures and the community section.
- **Join the arena → `/register`:** player name, team name and WhatsApp number only. One entry per phone number. Accepts entries only when the database is configured **and** registration is opened in OM.
- **Players, Match center and Standings** show the OM tournament once players are approved, otherwise the existing Sanity season. Standings are calculated automatically; League + Knockout shows the qualification line.

## Organizer Manager (OM) — `/admin`
Discord sign-in for the two main admins (and optional coordinators). No player counts are shown.
1. **Tournament:** name, format (League / Knockout / League + Knockout), Top 2–32 qualifiers, optional matches per player. Open or close registration.
2. **Players:** tick players and approve/reject them (after verifying on WhatsApp). Approved players appear on the website immediately. Add each approved player's eFootball ID.
3. **Generate fixtures** (optional random draw). Knockout handles any number of players with automatic byes. Reset is possible until the first score.
4. **Fixtures & scores:** standings update automatically; knockout draws need a tiebreak winner. Send Top N to the knockout, advance rounds, or finish a league.
Every action is recorded in the immutable activity log.

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
