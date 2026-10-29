import { TOURNAMENT_ID } from "@/lib/current";
import { auth } from "@/auth";
import { endpoint, response, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/private-data";
export async function GET() {
  return endpoint(async () => {
    const id = (await auth())?.user?.id;
    if (!id)
      throw new HttpError(401, "Sign in with your verified Discord identity.");
    const [row] =
      await db()`select f.credential_cipher from finals_access f join qualification q on q.tournament_id=f.tournament_id join player p on p.id=q.player_id where p.discord_id=${id} and p.deleted_at is null and f.released=true and f.tournament_id=${TOURNAMENT_ID}`;
    if (!row)
      throw new HttpError(
        403,
        "Finals access is restricted to verified qualified players after organizer release.",
      );
    return response({ credentials: decrypt(row.credential_cipher) });
  });
}
