import { body, endpoint, HttpError, response } from "@/lib/api";
import {
  registrationConfigured,
  registrationInput,
  register,
} from "@/lib/registration";
export async function POST(request: Request) {
  return endpoint(async () => {
    if (!registrationConfigured())
      return response(
        { error: "Registration is not open yet. Please check back soon." },
        503,
      );
    if (!request) throw new HttpError(400, "Missing request.");
    const parsed = registrationInput.safeParse(await body(request));
    if (!parsed.success)
      throw new HttpError(
        400,
        "Check your player name, team name, phone number and the consent box.",
      );
    const ip = process.env.VERCEL
      ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
      : "local";
    if (!ip) throw new HttpError(503, "Abuse protection is unavailable.");
    return response(await register(parsed.data, ip), 201);
  });
}
