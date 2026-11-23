import { auth, ORGANIZER_HOME } from "@/auth";
import { adminIds, type Actor, type Operation } from "@/lib/access";
import { actor, HttpError } from "@/lib/api";

/**
 * Organizer sign-in. Organizers use Discord (Auth.js) and land on /admin.
 * The flow never passes through /login, the player sign-in, so a player
 * session cookie can't send an organizer to the player hub instead.
 */

/** Discord sign-in can start: the same settings actor() needs, plus Discord's. */
export function organizerSignInConfigured(
  env: Record<string, string | undefined> = process.env,
) {
  return (
    !!env.AUTH_SECRET &&
    !!env.AUTH_DISCORD_ID &&
    !!env.AUTH_DISCORD_SECRET &&
    adminIds(env.MAIN_ADMIN_DISCORD_IDS ?? "").length > 0
  );
}

type SignIn = (
  provider: "discord",
  options: { redirectTo: string },
) => Promise<unknown>;

/** Starts Discord sign-in; Auth.js brings the organizer back to /admin. */
export async function startOrganizerSignIn(signIn: SignIn) {
  await signIn("discord", { redirectTo: ORGANIZER_HOME });
}

export type OrganizerGate =
  /** Signed in and allowed: show Organizer Manager. */
  | { state: "open" }
  /** Organizer access isn't set up in this environment. */
  | { state: "unconfigured" }
  /** No Discord session: offer Discord sign-in. */
  | { state: "signed-out" }
  /** A Discord session that isn't a main admin or an active coordinator. */
  | { state: "not-authorized"; name: string | null; discordId: string };

type Session = {
  user?: { id?: string | null; name?: string | null };
} | null;

/**
 * What /admin shows before the workspace loads. The decision is the API's own:
 * actor() runs exactly as GET /api/admin runs it, so the page and the API agree.
 */
export async function organizerGate(
  session: () => Promise<Session> = () => auth(),
  resolve: (operation: Operation, tournament: string) => Promise<Actor> = actor,
  env: Record<string, string | undefined> = process.env,
): Promise<OrganizerGate> {
  // actor()'s configuration check: without it nobody can open Organizer Manager.
  if (!env.AUTH_SECRET || !adminIds(env.MAIN_ADMIN_DISCORD_IDS ?? "").length)
    return { state: "unconfigured" };
  const signedOut: OrganizerGate = organizerSignInConfigured(env)
    ? { state: "signed-out" }
    : { state: "unconfigured" };
  const current = await session();
  const id = current?.user?.id;
  if (!id) return signedOut;
  try {
    await resolve("workspace", "*");
    return { state: "open" };
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) return signedOut;
    if (error instanceof HttpError && error.status === 403)
      return {
        state: "not-authorized",
        name: current?.user?.name ?? null,
        discordId: id,
      };
    // Anything else (the database is unreachable, say): open the workspace,
    // which shows the service message and lets the organizer retry.
    return { state: "open" };
  }
}
