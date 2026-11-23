import { endpoint, response } from "@/lib/api";
import { playerHub } from "@/lib/player-account";

/** GET → the signed-in player's hub data (401 without a valid session). */
export async function GET(request: Request) {
  return endpoint(async () => response(await playerHub(request)));
}
