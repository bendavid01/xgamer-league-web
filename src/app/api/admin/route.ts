import { body, endpoint, response } from "@/lib/api";
import { execute, home, snapshot } from "@/lib/control";
import { dataHealth } from "@/lib/health";
import {
  executeEdit,
  isEditCommand,
  playerDetails,
  teamReview,
} from "@/lib/player-details";

/**
 * GET /api/admin → OM home; GET /api/admin?t=<id> → that tournament's workspace;
 * ?t=<id>&player=<id> → Edit player details; ?teams=1 → team-name review (main admins).
 */
export async function GET(request: Request) {
  return endpoint(async () => {
    const params = new URL(request.url).searchParams;
    if (params.get("health") === "1") return response(await dataHealth());
    if (params.get("teams") === "1") return response(await teamReview());
    const t = params.get("t");
    const player = params.get("player");
    if (t && player) return response(await playerDetails(t, player));
    return response(t ? await snapshot(t) : await home());
  });
}
export async function POST(request: Request) {
  return endpoint(async () => {
    const raw = await body(request);
    return response(
      isEditCommand(raw) ? await executeEdit(raw) : await execute(raw),
    );
  });
}
