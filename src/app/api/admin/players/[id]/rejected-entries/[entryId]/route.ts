import { body, endpoint, response } from "@/lib/api";
import { clearRejectedEntry } from "@/lib/admin-player-fixes";

/**
 * DELETE { reason } → removes a rejected entry with no matches played. Main
 * admins only, through the Discord organizer session.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  return endpoint(
    async () => {
      const { id, entryId } = await params;
      return response(await clearRejectedEntry(id, entryId, await body(request)));
    },
    { detailedConflicts: true },
  );
}
