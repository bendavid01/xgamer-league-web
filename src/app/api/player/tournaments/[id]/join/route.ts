import { body, endpoint, HttpError, response } from "@/lib/api";
import { joinInput, joinTournament } from "@/lib/player-account";

/**
 * POST { teamName } → enters the signed-in player in an open tournament. The
 * player is taken from the session cookie only; a body naming a player is refused.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return endpoint(async () => {
    const { id } = await params;
    const parsed = joinInput.safeParse(await body(request));
    if (!parsed.success) throw new HttpError(400, "Enter your team name.");
    return response(await joinTournament(request, id, parsed.data), 201);
  });
}
