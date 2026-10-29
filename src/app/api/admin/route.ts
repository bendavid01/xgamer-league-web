import { body, endpoint, response } from "@/lib/api";
import { execute, home, snapshot } from "@/lib/control";

/** GET /api/admin → OM home; GET /api/admin?t=<id> → that tournament's workspace. */
export async function GET(request: Request) {
  return endpoint(async () => {
    const t = new URL(request.url).searchParams.get("t");
    return response(t ? await snapshot(t) : await home());
  });
}
export async function POST(request: Request) {
  return endpoint(async () => response(await execute(await body(request))));
}
