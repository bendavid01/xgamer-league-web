import { body, endpoint, response } from "@/lib/api";
import { correctWhatsApp } from "@/lib/admin-player-fixes";

/**
 * POST { whatsapp, reason } → corrects a player's WhatsApp number. Main admins
 * only, through the Discord organizer session; the player cookie is never read.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return endpoint(
    async () => {
      const { id } = await params;
      return response(await correctWhatsApp(id, await body(request)));
    },
    { detailedConflicts: true },
  );
}
