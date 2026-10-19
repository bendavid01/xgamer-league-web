import { body, endpoint, response, HttpError } from "@/lib/api";
import { snapshot, execute } from "@/lib/control";
const tournament = "xgamer-2026-10";
export async function GET() {
  return endpoint(async () => response(await snapshot(tournament)));
}
export async function POST(request: Request) {
  return endpoint(async () => {
    if (!request) {
      const { actor } = await import("@/lib/api");
      await actor("registrations", tournament);
      throw new HttpError(400, "Missing request.");
    }
    return response(await execute(tournament, await body(request)));
  });
}
