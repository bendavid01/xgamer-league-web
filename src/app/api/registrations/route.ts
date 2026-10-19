import { registrationConfigured } from "@/lib/configuration";
import { body, endpoint, HttpError, response } from "@/lib/api";
import { registrationInput, register } from "@/lib/registration";
export async function POST(request: Request) {
  return endpoint(async () => {
    if (!registrationConfigured())
      return response(
        {
          error:
            "Applications are awaiting secure setup. Please check back shortly.",
        },
        503,
      );
    if (!request) throw new HttpError(400, "Missing request.");
    const parsed = registrationInput.safeParse(await body(request));
    if (!parsed.success)
      throw new HttpError(
        400,
        "Check your gaming name, eFootball ID, contact details and consent.",
      );
    const ip = process.env.VERCEL
      ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
      : "local";
    if (!ip) throw new HttpError(503, "Abuse protection is unavailable.");
    return response(await register(parsed.data, ip), 201);
  });
}
