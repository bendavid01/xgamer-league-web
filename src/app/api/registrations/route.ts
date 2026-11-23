import { body, endpoint, HttpError, response } from "@/lib/api";
import {
  newPlayerRegistrationInput,
  registrationConfigured,
  register,
} from "@/lib/registration";
import {
  returningRegistrationInput,
  submitReturningRegistration,
} from "@/lib/returning-registration";
export async function POST(request: Request) {
  return endpoint(async () => {
    if (!registrationConfigured())
      return response(
        { error: "Registration is not open yet. Please check back soon." },
        503,
      );
    if (!request) throw new HttpError(400, "Missing request.");
    const raw = await body(request);
    const ip = process.env.VERCEL
      ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
      : "local";
    if (!ip) throw new HttpError(503, "Abuse protection is unavailable.");
    if (raw && typeof raw === "object" && raw.kind === "existing") {
      const parsed = returningRegistrationInput.safeParse(raw);
      if (!parsed.success)
        throw new HttpError(
          400,
          "Check your XG ID, team name, WhatsApp number and the consent box.",
        );
      await submitReturningRegistration(parsed.data, ip);
      return response({ ok: true }, 202);
    }
    const parsed = newPlayerRegistrationInput.safeParse(raw);
    if (!parsed.success) {
      // Account fields explain themselves (password length, nickname rules).
      const account = parsed.error.issues.find((i) =>
        ["password", "displayNickname", "tier"].includes(String(i.path[0])),
      );
      throw new HttpError(
        400,
        account?.message ??
          "Check your player name, team name, phone number and the consent box.",
      );
    }
    return response(await register(parsed.data, ip), 202);
  });
}
