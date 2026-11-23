/**
 * The navbar's "signed in" hint (see sessionHintCookie in src/lib/player-auth.ts).
 * Display only: it holds the session's expiry and nothing else, and /dashboard
 * verifies the real session on the server.
 */
const NAME = "xg_player_hint";

export function hasPlayerHint(cookie = document.cookie) {
  const raw = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(NAME + "="))
    ?.slice(NAME.length + 1);
  const exp = Number(raw);
  return Number.isFinite(exp) && exp * 1000 > Date.now();
}

/** /login is only reachable while signed out, so a hint seen there is stale. */
export function clearPlayerHint() {
  document.cookie = `${NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}
