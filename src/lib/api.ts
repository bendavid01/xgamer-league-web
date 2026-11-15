import { auth } from "@/auth";
import { db } from "@/lib/db";
import { adminIds, allowed, type Actor, type Operation } from "@/lib/access";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function response(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
/**
 * Expected database conflicts (L4). A unique index or a lock conflict means the
 * request lost a race or repeats an existing record; nothing was written, and a
 * plain retry would fail the same way, so it is a 409 with a precise reason.
 * Everything else stays a 503.
 */
const CONFLICT_MESSAGES: Record<string, string> = {
  player_contact_hash_key:
    "This WhatsApp number belongs to another player record.",
  application_tournament_id_player_id_key:
    "This player already has an entry for this tournament.",
  new_player_registration_pending_claim:
    "This application is already waiting for review.",
  returning_registration_pending_claim:
    "This request is already waiting for review.",
  contact_change_open_player:
    "There is already an open change for this player or number.",
  contact_change_open_number:
    "There is already an open change for this player or number.",
};
/**
 * `detailed` names the conflicting record and is for signed-in organizer
 * endpoints only. Public endpoints get the generic text, so a response can
 * never reveal whether a number or player is on file.
 */
export function databaseConflict(
  error: unknown,
  detailed = false,
): HttpError | null {
  const e = error as { code?: unknown; constraint_name?: unknown } | null;
  if (!e || typeof e !== "object") return null;
  if (e.code === "23505")
    return new HttpError(
      409,
      (detailed &&
        typeof e.constraint_name === "string" &&
        CONFLICT_MESSAGES[e.constraint_name]) ||
        "This conflicts with an existing record. Nothing was saved. Refresh and try again.",
    );
  // Deadlock: PostgreSQL rolled this transaction back.
  if (e.code === "40P01")
    return new HttpError(
      409,
      "Someone else changed this at the same time. Nothing was saved. Refresh and try again.",
    );
  return null;
}
export async function endpoint(
  fn: () => Promise<Response>,
  options: { detailedConflicts?: boolean } = {},
) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError)
      return response({ error: error.message }, error.status);
    const conflict = databaseConflict(error, options.detailedConflicts);
    if (conflict) return response({ error: conflict.message }, conflict.status);
    return response(
      {
        error:
          "Service unavailable. No success has been recorded; please retry later.",
      },
      503,
    );
  }
}
/**
 * XGamer's own production addresses. While the site moves from the old
 * Vercel address to the new one, forms work on both. Requests from any other
 * site are still refused (CSRF protection).
 */
export const OFFICIAL_ORIGINS = [
  "https://xgamerproleague.vercel.app",
  "https://xgamer-league-web.vercel.app",
];
export function allowedOrigin(
  origin: string | null,
  appOrigin = process.env.APP_ORIGIN,
) {
  if (!origin || !appOrigin) return false;
  return origin === appOrigin || OFFICIAL_ORIGINS.includes(origin);
}
export async function body(request: Request) {
  if (!allowedOrigin(request.headers.get("origin")))
    throw new HttpError(403, "Invalid request origin.");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "JSON is required.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request.");
  let text = "",
    bytes = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 8192) {
      await reader.cancel();
      throw new HttpError(413, "Request too large.");
    }
    text += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(text + decoder.decode());
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
export async function actor(
  operation: Operation,
  tournament: string,
): Promise<Actor> {
  if (!adminIds().length || !process.env.AUTH_SECRET)
    throw new HttpError(403, "Organizer access is awaiting configuration.");
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new HttpError(401, "Sign in with Discord.");
  const name = session?.user?.name ?? undefined;
  let user: Actor;
  if (adminIds().includes(id))
    user = { id, name, role: "admin", operations: [], tournaments: [] };
  else {
    const [row] =
      await db()`select operations, tournaments from coordinator where discord_id=${id} and active=true`;
    if (!row) throw new HttpError(403, "Access denied.");
    user = {
      id,
      name,
      role: "coordinator",
      operations: row.operations,
      tournaments: row.tournaments,
    };
  }
  if (!allowed(user, operation, tournament))
    throw new HttpError(403, "This operation is not assigned to you.");
  return user;
}
