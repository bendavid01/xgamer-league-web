import { body, endpoint, response } from "@/lib/api";
import { issueOneTimeCode } from "@/lib/player-account";

/**
 * POST { purpose: "claim" | "reset" } → a new one-time code for this registered
 * player, shown once for the organizer to send on WhatsApp. Main admins only,
 * through the Discord organizer session (the player cookie is never read here).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return endpoint(
    async () => {
      const { id } = await params;
      return response(await issueOneTimeCode(id, await body(request)));
    },
    { detailedConflicts: true },
  );
}
