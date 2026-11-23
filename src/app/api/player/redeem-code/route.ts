import { body, endpoint, HttpError, requestIp, response } from "@/lib/api";
import {
  redeemInput,
  redeemOneTimeCode,
  requirePlayerAuthConfigured,
} from "@/lib/player-account";
import {
  SESSION_SECONDS,
  sessionCookie,
  sessionHintCookie,
  signSession,
} from "@/lib/player-auth";

/**
 * POST { xgId, code, newPassword, displayNickname? } → redeems an organizer's claim
 * or reset code, sets the password and signs the player in.
 */
export async function POST(request: Request) {
  return endpoint(async () => {
    requirePlayerAuthConfigured();
    const parsed = redeemInput.safeParse(await body(request));
    if (!parsed.success)
      throw new HttpError(
        400,
        parsed.error.issues.find((i) => i.path[0] === "displayNickname")
          ?.message ??
          "Check your XG ID, the 6-character code and a new password of 8–128 characters.",
      );
    const who = await redeemOneTimeCode(parsed.data, requestIp(request));
    const res = response({ ok: true, xgId: who.xgId });
    res.headers.append("Set-Cookie", sessionCookie(signSession(who, who.iat)));
    res.headers.append(
      "Set-Cookie",
      sessionHintCookie(who.iat + SESSION_SECONDS),
    );
    return res;
  });
}
