# Claude (MCP) access to OM

Organizers can connect Claude to OM and ask things like *"who's still pending in Season 3?"* or
*"draft WhatsApp reminders for Round 2"*. Version 1 is **read-only**: Claude can look, never change.

## How it works

```
Claude ──(1) finds /.well-known/oauth-protected-resource/api/mcp
       ──(2) registers itself at /oauth/register (Claude or localhost return addresses only)
       ──(3) opens /oauth/authorize → organizer signs in with Discord (as for OM) → Allow
       ──(4) swaps the one-time code (+ PKCE proof) at /oauth/token → 1-hour access token
       ──(5) calls tools at /api/mcp with "Authorization: Bearer xgm_at_…"
```

- Same people as OM: the two main admins and active coordinators. Roles are checked on **every** tool call,
  so deactivating a coordinator in OM cuts off their Claude access immediately.
- WhatsApp numbers and eFootball IDs need the **registrations** role, exactly as in OM. Each time Claude
  reveals them, an entry appears in the OM **Activity log** ("Drafted WhatsApp reminders via Claude").
  New connections are logged too ("Connected Claude (MCP) to OM").
- Nothing is ever sent. Reminder tools return `wa.me` links with the message typed; you press send.

## Tools

| Tool | What it gives |
| --- | --- |
| `list_tournaments` | All tournaments you can see, with registered/approved counts |
| `get_tournament` | Dates, fee, prize, players by status, fixture progress, podium, latest updates |
| `list_players` | Players with XG code, team, status; contact details only if `include_contact=true` |
| `find_registration_issues` | Same player/team names, approved players missing an eFootball ID, pending count |
| `list_fixtures` | League fixtures and scores, by round or unplayed only |
| `get_standings` | League table |
| `draft_whatsapp_reminders` | wa.me links for approved, pending, or a round's players (with their opponent) |

## Turning it on

1. Deploy (the build applies migration `006_mcp_oauth.sql`: three new private tables).
2. Vercel → Settings → Environment Variables: `MCP_ENABLED=true`, then redeploy.
   No new secrets: it reuses `AUTH_SECRET`, `APP_ORIGIN`, `MAIN_ADMIN_DISCORD_IDS`, `DATABASE_URL`, `PRIVATE_DATA_KEY`.
   No Discord app change is needed (sign-in uses the existing callback).
3. Connect:
   - **Claude (web, desktop, phone):** Settings → Connectors → Add custom connector →
     `https://xgamerproleague.vercel.app/api/mcp`.
   - **Claude Code:** `claude mcp add --transport http xgamer-om https://xgamerproleague.vercel.app/api/mcp`
   - **Testing:** `npx @modelcontextprotocol/inspector` → Streamable HTTP → same URL.

**Emergency off switch:** set `MCP_ENABLED=false` and redeploy. Every `/oauth/*` and `/api/mcp` route then returns 404.
To end every existing connection as well, run `update oauth_token set revoked_at=now() where revoked_at is null;`.

## Security notes

- OAuth 2.1 public clients with mandatory PKCE (S256); no client secrets exist to leak.
- Return addresses are allowlisted: `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback`
  and loopback (`http://localhost`, `127.0.0.1`) for desktop tools. Others need `MCP_EXTRA_REDIRECT_URIS`.
- Only SHA-256 hashes of codes and tokens are stored. Codes: 10 minutes, single use.
  Access tokens: 1 hour. Refresh tokens: 30 days, rotated on every use; replaying an old one ends the connection.
- Tokens are bound to `/api/mcp` (RFC 8707) and the issuer is pinned to `APP_ORIGIN` (never request headers).
- The Allow button is a Next.js Server Action (cross-site posts are rejected) and the page can't be framed.
  The page warns organizers to approve only connections they started themselves.
- Registration is rate-limited (20 per hour per IP). Client Metadata Documents are fetched only from public HTTPS hosts,
  with a 5-second timeout, 64 KB limit and no redirects.
- Player and team names are treated as data; the server instructions tell Claude not to follow text inside them.

## Testing

`TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres DATABASE_SSL=disable npm test` runs `tests/mcp.test.ts`
against its own database (`xgamer_mcp_test`): OAuth rules, code reuse, PKCE, refresh rotation and reuse detection,
revocation, role checks and audit logging.
