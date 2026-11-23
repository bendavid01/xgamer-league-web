/**
 * Organizer sign-in lands on /admin (OL-1 to OL-6).
 *
 * The bug: Organizer Manager's "Sign in with Discord" was a link to /login. Since
 * the player portal, /login is the player sign-in (and sends anyone with a player
 * session to /dashboard), so Discord was never reached and organizers ended up on
 * the player pages. These tests run the real Auth.js configuration (src/auth.ts)
 * with only Discord's two HTTP endpoints stubbed; nothing leaves the machine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";

// Test-only values. Auth.js reads them when src/auth.ts is first imported, so every
// module that imports it is loaded with a dynamic import() below.
Object.assign(process.env, {
  AUTH_SECRET: "organizer-login-test-secret-0123456789abcdef",
  AUTH_DISCORD_ID: "222222222222222222",
  AUTH_DISCORD_SECRET: "organizer-login-test-discord-secret",
  MAIN_ADMIN_DISCORD_IDS: "100000000000000001,100000000000000002",
  PLAYER_SESSION_SECRET: "organizer-login-test-player-session-secret-0123",
  // The tests talk to http://localhost:3000 whatever NODE_ENV is.
  AUTH_TRUST_HOST: "true",
});
delete process.env.AUTH_URL;
delete process.env.NEXTAUTH_URL;

const ORIGIN = "http://localhost:3000";
const ADMIN_ID = "100000000000000001";

const modules = async () => {
  const [authjs, access, player, api] = await Promise.all([
    import("../src/auth"),
    import("../src/lib/organizer-access"),
    import("../src/lib/player-auth"),
    import("../src/lib/api"),
  ]);
  return { ...authjs, ...access, ...player, HttpError: api.HttpError };
};

/** A browser's cookie jar, plus every cookie name any response tried to set. */
function browser() {
  const jar = new Map<string, string>();
  const written: string[] = [];
  return {
    jar,
    written,
    header: () => [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    absorb(res: Response) {
      for (const line of res.headers.getSetCookie()) {
        const [pair, ...attrs] = line.split(";");
        const i = pair.indexOf("=");
        const name = pair.slice(0, i).trim();
        written.push(name);
        const gone = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a));
        if (gone) jar.delete(name);
        else jar.set(name, pair.slice(i + 1).trim());
      }
    },
  };
}

const get = (url: string, cookie: string) =>
  new NextRequest(url, { headers: { cookie } });

/** Discord's token and user endpoints, answered locally. */
function stubDiscord(user: Record<string, unknown>) {
  const real = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    seen.push(url);
    if (url === "https://discord.com/api/oauth2/token")
      return Response.json({
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 604800,
        scope: "identify",
      });
    if (url === "https://discord.com/api/users/@me") return Response.json(user);
    throw new Error(`Unexpected request in a test: ${url}`);
  }) as typeof fetch;
  return { seen, restore: () => (globalThis.fetch = real) };
}

/** Starts sign-in the way the /admin server action does: POST signin/discord, callbackUrl /admin. */
async function startSignIn(b: ReturnType<typeof browser>) {
  const { handlers, ORGANIZER_HOME } = await modules();
  const csrf = await handlers.GET(get(`${ORIGIN}/api/auth/csrf`, b.header()));
  b.absorb(csrf);
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const res = await handlers.POST(
    new NextRequest(`${ORIGIN}/api/auth/signin/discord`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: b.header(),
      },
      body: new URLSearchParams({ csrfToken, callbackUrl: ORGANIZER_HOME }),
    }),
  );
  b.absorb(res);
  return res;
}

test("OL-1: the /admin sign-in action starts Discord with /admin as the destination", async () => {
  const { startOrganizerSignIn, ORGANIZER_HOME } = await modules();
  assert.equal(ORGANIZER_HOME, "/admin");
  const calls: unknown[][] = [];
  await startOrganizerSignIn(async (...args) => void calls.push(args));
  assert.deepEqual(calls, [["discord", { redirectTo: "/admin" }]]);
  // The page wires that action (and only that) to the sign-in button.
  const page = await readFile(
    new URL("../src/app/admin/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /await startOrganizerSignIn\(signIn\);/);
});

test("OL-2: Discord sign-in lands on /admin, not /login, with a player session present and untouched", async () => {
  const { handlers, signSession, verifySession, SESSION_COOKIE } =
    await modules();
  const b = browser();
  // A signed-in player (the case that used to end on /dashboard).
  const now = Math.floor(Date.now() / 1000);
  const playerToken = signSession(
    { playerId: randomUUID(), xgId: "XG-0007" },
    now,
  );
  b.jar.set(SESSION_COOKIE, playerToken);

  const start = await startSignIn(b);
  assert.equal(start.status, 302);
  const authorize = new URL(start.headers.get("location")!);
  assert.equal(
    `${authorize.origin}${authorize.pathname}`,
    "https://discord.com/api/oauth2/authorize",
  );
  assert.equal(
    authorize.searchParams.get("redirect_uri"),
    `${ORIGIN}/api/auth/callback/discord`,
  );
  assert.equal(authorize.searchParams.get("scope"), "identify");
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    decodeURIComponent(b.jar.get("authjs.callback-url") ?? ""),
    `${ORIGIN}/admin`,
  );

  // Discord approves and sends the browser back to the callback.
  const discord = stubDiscord({
    id: ADMIN_ID,
    username: "organizer",
    global_name: "Test Organizer",
    avatar: null,
    discriminator: "0",
  });
  let callback: Response;
  try {
    callback = await handlers.GET(
      get(
        `${ORIGIN}/api/auth/callback/discord?${new URLSearchParams({
          code: "test-code",
          state: authorize.searchParams.get("state")!,
          iss: "https://discord.com",
        })}`,
        b.header(),
      ),
    );
  } finally {
    discord.restore();
  }
  assert.deepEqual(discord.seen, [
    "https://discord.com/api/oauth2/token",
    "https://discord.com/api/users/@me",
  ]);
  b.absorb(callback);
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("location"), `${ORIGIN}/admin`);
  assert.ok(b.jar.get("authjs.session-token"), "organizer session issued");

  // The session is the Discord account that actor() checks against the main admins.
  const session = await handlers.GET(
    get(`${ORIGIN}/api/auth/session`, b.header()),
  );
  const body = (await session.json()) as {
    user: { id: string; name: string };
  };
  assert.equal(body.user.id, ADMIN_ID);
  assert.equal(body.user.name, "Test Organizer");

  // The player session was never written, cleared or replaced along the way.
  assert.ok(b.written.length > 0);
  assert.ok(
    b.written.every((name) => /^(__(Secure|Host)-)?authjs\./.test(name)),
    `only Auth.js cookies were set: ${b.written.join(", ")}`,
  );
  assert.equal(b.jar.get(SESSION_COOKIE), playerToken);
  assert.equal(verifySession(playerToken)?.xgId, "XG-0007");
});

test("OL-3: a cancelled or failed Discord sign-in returns to /admin, never /login", async () => {
  const { handlers } = await modules();
  const b = browser();
  const start = await startSignIn(b);
  const state = new URL(start.headers.get("location")!).searchParams.get(
    "state",
  )!;
  // The organizer presses Cancel on Discord. Auth.js logs it as an error; keep
  // that out of the test output, but check it is the expected one.
  const logged: string[] = [];
  const consoleError = console.error;
  console.error = (...args: unknown[]) => void logged.push(args.join(" "));
  let cancelled: Response;
  try {
    cancelled = await handlers.GET(
      get(
        `${ORIGIN}/api/auth/callback/discord?${new URLSearchParams({
          error: "access_denied",
          error_description:
            "The resource owner or authorization server denied the request",
          state,
          iss: "https://discord.com",
        })}`,
        b.header(),
      ),
    );
  } finally {
    console.error = consoleError;
  }
  assert.ok(logged.some((line) => line.includes("OAuthCallbackError")));
  assert.equal(cancelled.status, 302);
  const back = new URL(cancelled.headers.get("location")!, ORIGIN);
  assert.equal(back.pathname, "/admin");
  assert.ok(back.searchParams.get("error"));
  assert.ok(!b.jar.get("authjs.session-token"), "no session after a cancel");

  // Auth.js's own sign-in and error pages send organizers to /admin as well.
  for (const path of [
    "/api/auth/signin",
    "/api/auth/error?error=Configuration",
  ]) {
    const res = await handlers.GET(get(`${ORIGIN}${path}`, ""));
    assert.equal(res.status, 302, path);
    const to = new URL(res.headers.get("location")!, ORIGIN);
    assert.equal(to.pathname, "/admin", path);
  }
});

test("OL-4: /admin's gate: signed out, explicitly not authorized, not set up, or open", async () => {
  const { organizerGate, HttpError } = await modules();
  const env = {
    AUTH_SECRET: "x",
    AUTH_DISCORD_ID: "222222222222222222",
    AUTH_DISCORD_SECRET: "y",
    MAIN_ADMIN_DISCORD_IDS: "100000000000000001,100000000000000002",
  };
  const signedIn = async () => ({
    user: { id: "300000000000000003", name: "Not An Organizer" },
  });
  const allow = async () => ({
    id: ADMIN_ID,
    role: "admin" as const,
    operations: [],
    tournaments: [],
  });
  const refuse = (status: number, message: string) => async () => {
    throw new HttpError(status, message);
  };

  assert.deepEqual(await organizerGate(async () => null, allow, env), {
    state: "signed-out",
  });
  // A session without a Discord ID (e.g. an old or foreign token) is signed out.
  assert.deepEqual(
    await organizerGate(async () => ({ user: { id: "" } }), allow, env),
    { state: "signed-out" },
  );
  assert.deepEqual(await organizerGate(signedIn, allow, env), {
    state: "open",
  });
  // actor() refuses (no admin, no active coordinator): an explicit screen, not a loop.
  for (const message of [
    "Access denied.",
    "This operation is not assigned to you.",
  ])
    assert.deepEqual(await organizerGate(signedIn, refuse(403, message), env), {
      state: "not-authorized",
      name: "Not An Organizer",
      discordId: "300000000000000003",
    });
  assert.deepEqual(
    await organizerGate(signedIn, refuse(401, "Sign in with Discord."), env),
    { state: "signed-out" },
  );
  // A database failure opens the workspace, which shows the service message.
  assert.deepEqual(
    await organizerGate(
      signedIn,
      async () => {
        throw new Error("connect ECONNREFUSED");
      },
      env,
    ),
    { state: "open" },
  );
  // Not set up: no admin list, no Auth.js secret, or (signed out) no Discord app.
  for (const broken of [
    { ...env, MAIN_ADMIN_DISCORD_IDS: "" },
    { ...env, AUTH_SECRET: "" },
  ])
    assert.deepEqual(await organizerGate(signedIn, allow, broken), {
      state: "unconfigured",
    });
  assert.deepEqual(
    await organizerGate(async () => null, allow, {
      ...env,
      AUTH_DISCORD_ID: "",
    }),
    { state: "unconfigured" },
  );
});

test("OL-5: no organizer screen links to the player sign-in", async () => {
  for (const file of [
    "../src/app/admin/page.tsx",
    "../src/components/ControlCenter.tsx",
    "../src/components/om/OmShell.tsx",
    "../src/components/om/OrganizerGate.tsx",
    "../src/components/om/OrganizerSignInButton.tsx",
  ]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /["'`]\/login\b/, file);
  }
  const gate = await readFile(
    new URL("../src/components/om/OrganizerGate.tsx", import.meta.url),
    "utf8",
  );
  assert.match(gate, /Not authorized for Organizer Manager/);
});

test("OL-6: organizer and player cookies can't collide", async () => {
  const { SESSION_COOKIE, SESSION_HINT_COOKIE } = await modules();
  for (const name of [SESSION_COOKIE, SESSION_HINT_COOKIE])
    assert.doesNotMatch(name, /authjs/i);
  // Auth.js's cookie names (with and without the HTTPS prefixes) all start with authjs.
  const b = browser();
  await startSignIn(b);
  for (const name of b.written)
    assert.match(name, /^(__(Secure|Host)-)?authjs\./);
});
