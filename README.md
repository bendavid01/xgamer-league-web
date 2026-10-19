# X-Gamer Pro League — 2.0 MVP

Production: https://xgamer-league-web.vercel.app/

Next.js App Router, TypeScript, Tailwind, Motion, Lucide and the existing Sanity content source. Cyan/slate X-GAMER branding and the existing production data are retained.

## Available
- Public competition overview, fixture/result filters and group standings.
- Public league participant records and match histories.
- Browser-only tournament planner: round robin, seeded knockout with byes, league phase plus knockout qualification, score entry and preview export.
- Manual external eFootball finals guide.
- Clear public feature inventory at /status.
- Existing Sanity studio results workflow remains available with its existing permissions.

## Not yet enabled
Account sign-in/recovery, guest entry submission, verified phone/Discord identity, new admin controls, entry approval, chat, account upgrades, evidence upload and automated Discord integration. These need private storage, identity configuration and the two administrator identities. WhatsApp verification and updates will be manual.

Registration returns 503 and private admin endpoints return 403 until implemented; no personal information is collected by these placeholders. Public participant records are not verified accounts. Tournament plans never publish to live data.

## Development
Use Node 24. Run npm ci, npm test, npm run lint and npm run build. Use npm run dev for local development. .env.example documents public configuration and existing webhook secret names; never commit real credentials.

The public Sanity dataset defaults to the original project aqtsgm5o / production. No data migration is part of this release. The separate bendavid01/xgamer-league-studio repository remains the content administration tool.

See docs/XGAMER-2-MVP.md for architecture, remaining setup, security boundaries and rollback instructions.
