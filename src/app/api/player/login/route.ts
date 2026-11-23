import { body, endpoint, HttpError, requestIp, response } from "@/lib/api";
import {
  login,
  loginInput,
  requirePlayerAuthConfigured,
} from "@/lib/player-account";
import { sessionCookie, signSession } from "@/lib/player-auth";

/** POST { xgId, password } → sets the player session cookie. */
export async function POST(request: Request) {
  return endpoint(async () => {
    requirePlayerAuthConfigured();
    const parsed = loginInput.safeParse(await body(request));
    if (!parsed.success)
      throw new HttpError(400, "Enter your XG ID and password.");
    const who = await login(parsed.data, requestIp(request));
    const res = response({ ok: true, xgId: who.xgId });
    res.headers.append("Set-Cookie", sessionCookie(signSession(who, who.iat)));
    return res;
  });
}
