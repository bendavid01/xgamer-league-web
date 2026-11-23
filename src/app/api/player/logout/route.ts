import { allowedOrigin, endpoint, HttpError, response } from "@/lib/api";
import { clearedSessionCookie } from "@/lib/player-auth";

/** POST → clears the player session cookie. Sessions are stateless; nothing else to end. */
export async function POST(request: Request) {
  return endpoint(async () => {
    if (!allowedOrigin(request.headers.get("origin")))
      throw new HttpError(403, "Invalid request origin.");
    const res = response({ ok: true });
    res.headers.append("Set-Cookie", clearedSessionCookie());
    return res;
  });
}
