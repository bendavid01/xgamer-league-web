import { body, endpoint, response } from "@/lib/api";
import { execute, home, snapshot } from "@/lib/control";
import { dataHealth } from "@/lib/health";

/** GET /api/admin → OM home; GET /api/admin?t=<id> → that tournament's workspace. */
export async function GET(request: Request) {
  return endpoint(async () => {
    const params = new URL(request.url).searchParams;
    if (params.get("health") === "1") return response(await dataHealth());
    const t = params.get("t");
    return response(t ? await snapshot(t) : await home());
  });
}
export async function POST(request: Request) {
  return endpoint(async () => response(await execute(await body(request))));
}
