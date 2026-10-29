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
export async function endpoint(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError)
      return response({ error: error.message }, error.status);
    return response(
      {
        error:
          "Service unavailable. No success has been recorded; please retry later.",
      },
      503,
    );
  }
}
export async function body(request: Request) {
  if (request.headers.get("origin") !== process.env.APP_ORIGIN)
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
