/**
 * XG player accounts (XG-008): password hashing, the signed session, nickname
 * rules, one-time codes and the boundary between player and organizer sessions.
 * No database: the flows that need one are in player-accounts.integration.test.ts.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import * as auth from "../src/lib/player-auth";

// Isolated test values, never deployment credentials.
const SECRET = "test-only-player-session-secret-0123456789";
process.env.PLAYER_SESSION_SECRET = SECRET;
process.env.PRIVATE_DATA_KEY = "ab".repeat(32);
process.env.APP_ORIGIN = "http://localhost:3000";
const ORIGIN = "http://localhost:3000";
const PLAYER = "8b0c5a64-7a3c-4b0e-9a55-2f0f6a1d2c11";
const now = () => Math.floor(Date.now() / 1000);

test("passwords: scrypt with a random salt, verified in constant time, never stored as given", async () => {
  const a = await auth.hashPassword("correct horse battery");
  const b = await auth.hashPassword("correct horse battery");
  assert.match(
    a,
    /^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/,
    "the shape the migrations' check constraints accept",
  );
  assert.notEqual(a, b, "a fresh salt every time");
  assert.ok(!a.includes("correct horse"));
  assert.equal(await auth.verifyPassword("correct horse battery", a), true);
  assert.equal(await auth.verifyPassword("correct horse batterY", a), false);
  assert.equal(await auth.verifyPassword("", a), false);
  // Compatibility characters hash the same (NFKC), so a keyboard can't lock someone out.
  const w = await auth.hashPassword("ｐａｓｓｗｏｒｄ１２３");
  assert.equal(await auth.verifyPassword("password123", w), true);
  // Malformed, plaintext or attacker-chosen cost parameters never verify.
  for (const stored of [
    null,
    "",
    "correct horse battery",
    a.replace("scrypt$16384$", "scrypt$2$"),
    a.slice(0, -1),
  ])
    assert.equal(await auth.verifyPassword("correct horse battery", stored), false);
});

test("password policy: 8 to 128 characters", () => {
  assert.equal(auth.passwordInput.safeParse("1234567").success, false);
  assert.equal(auth.passwordInput.safeParse("12345678").success, true);
  assert.equal(auth.passwordInput.safeParse("x".repeat(128)).success, true);
  assert.equal(auth.passwordInput.safeParse("x".repeat(129)).success, false);
  assert.match(
    auth.passwordInput.safeParse("short").error!.issues[0].message,
    /8–128 characters/,
  );
});

test("session: HMAC-signed, expiring, bound to one player, and nothing else verifies", () => {
  const iat = now();
  const token = auth.signSession({ playerId: PLAYER, xgId: "XG-0007" }, iat);
  const s = auth.verifySession(token);
  assert.deepEqual(s, {
    kind: "player",
    playerId: PLAYER,
    xgId: "XG-0007",
    iat,
    exp: iat + auth.SESSION_SECONDS,
  });
  const [body, mac] = token.split(".");
  const forge = (payload: object) =>
    `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${mac}`;
  // Another player's ID in the payload breaks the signature.
  assert.equal(auth.verifySession(forge({ ...s, playerId: "0".repeat(8) + PLAYER.slice(8) })), null);
  assert.equal(auth.verifySession(forge({ ...s, xgId: "XG-0001" })), null);
  // Signed with any other secret (e.g. AUTH_SECRET or an old value): refused.
  assert.equal(
    auth.verifySession(auth.signSession({ playerId: PLAYER, xgId: "XG-0007" }, iat, "x".repeat(40))),
    null,
  );
  // Expired, issued in the future, wrong shape, truncated.
  assert.equal(auth.verifySession(token, iat + auth.SESSION_SECONDS), null);
  assert.equal(
    auth.verifySession(auth.signSession({ playerId: PLAYER, xgId: "XG-0007" }, iat + 3600)),
    null,
  );
  for (const bad of ["", "x", `${body}.`, `${body}.${mac}.x`, `.${mac}`, token.slice(0, -2)])
    assert.equal(auth.verifySession(bad), null, bad);
  // A payload that is not a player session, even if correctly signed, is refused.
  const other = Buffer.from(JSON.stringify({ ...s, kind: "organizer" })).toString("base64url");
  const otherMac = createHmac("sha256", SECRET)
    .update("xg-player-session:v1." + other)
    .digest("base64url");
  assert.equal(auth.verifySession(`${other}.${otherMac}`), null);
});

test("session secret: no fallback value in any environment", () => {
  for (const env of [
    {},
    { PLAYER_SESSION_SECRET: "" },
    { PLAYER_SESSION_SECRET: "too-short" },
    { NODE_ENV: "production" },
    { NODE_ENV: "development" },
  ])
    assert.throws(
      () => auth.sessionSecret(env),
      (e: { status?: number }) => e.status === 503,
      JSON.stringify(env),
    );
  assert.equal(auth.sessionSecret({ PLAYER_SESSION_SECRET: SECRET }), SECRET);
});

test("session cookie: HttpOnly, SameSite=Lax, Path=/, Secure in production, cleared on logout", () => {
  const dev = auth.sessionCookie("abc", { NODE_ENV: "development" });
  assert.equal(
    dev,
    "xg_player_session=abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800",
  );
  assert.match(auth.sessionCookie("abc", { NODE_ENV: "production" }), /; Secure$/);
  const cleared = auth.clearedSessionCookie({ NODE_ENV: "production" });
  assert.match(cleared, /^xg_player_session=; /);
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /HttpOnly; SameSite=Lax/);
  const req = new Request(ORIGIN, {
    headers: { cookie: "a=1; xg_player_session=tok.en ; authjs.session-token=zzz" },
  });
  assert.equal(auth.readCookie(req, "xg_player_session"), "tok.en");
  assert.equal(auth.readCookie(new Request(ORIGIN), "xg_player_session"), null);
});

test("nicknames: 2–24 characters, normalized, reserved organizer words refused", () => {
  assert.equal(auth.normalizeNickname("  Ｎeo   Striker "), "Neo Striker");
  for (const ok of ["Neo", "Modric", "Staffy", "XGamerFan", "Ra'ul_9", "Ünal"])
    assert.equal(auth.nicknameProblem(ok), null, ok);
  for (const bad of [
    "A",
    "x".repeat(25),
    "admin",
    "Admin_01",
    "THE ADMIN",
    "mod",
    "Mod 7",
    "organizer",
    "Staff",
    "xgamer",
    "a.d.m.i.n",
    "XG-0007",
    "xg12",
    "Neo<script>",
    "emoji🙂",
  ])
    assert.notEqual(auth.nicknameProblem(bad), null, bad);
  assert.equal(auth.nicknameInput.parse(" Neo  Striker "), "Neo Striker");
  assert.equal(auth.nicknameInput.safeParse("admin").success, false);
});

test("one-time codes: 6 characters, no 0/O/1/I, keyed hash per player and purpose", () => {
  assert.equal(auth.CODE_ALPHABET.length, 32);
  assert.doesNotMatch(auth.CODE_ALPHABET, /[0O1I]/);
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const code = auth.generateOneTimeCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
    seen.add(code);
  }
  assert.ok(seen.size > 490, "codes are random");
  const code = "K7Q2XM";
  const h = auth.oneTimeCodeHash(PLAYER, "claim", code);
  assert.match(h, /^[a-f0-9]{64}$/);
  assert.notEqual(h, code);
  assert.equal(auth.oneTimeCodeHash(PLAYER, "claim", "k7q-2xm"), h, "typed loosely");
  assert.notEqual(auth.oneTimeCodeHash(PLAYER, "reset", code), h, "purpose-bound");
  assert.notEqual(
    auth.oneTimeCodeHash(PLAYER.replace("8b0c", "8b0d"), "claim", code),
    h,
    "player-bound",
  );
  assert.equal(auth.oneTimeCodeInput.parse(" k7q 2xm "), "K7Q2XM");
  for (const bad of ["K7Q2X", "K7Q2XMM", "O7Q2XM", "I7Q2XM", "07Q2XM"])
    assert.equal(auth.oneTimeCodeInput.safeParse(bad).success, false, bad);
});

test("brute force: five failures lock an XG ID for 15 minutes", () => {
  assert.equal(auth.LOCK_AFTER_FAILURES, 5);
  assert.equal(auth.LOCK_MINUTES, 15);
});

test("registration tiers: registered needs a password and nickname, guests never send them", async () => {
  const { newPlayerRegistrationInput } = await import("../src/lib/registration");
  const base = {
    playerName: "New Player",
    teamName: "Night Owls",
    phone: "9800001234",
    consent: true,
    website: "",
    tournament: "open-cup",
  };
  const ok = (v: object) => newPlayerRegistrationInput.safeParse(v).success;
  assert.equal(ok(base), true, "the current form (no tier) keeps working");
  assert.equal(ok({ ...base, tier: "registered", password: "long enough", displayNickname: "Owl" }), true);
  assert.equal(ok({ ...base, tier: "registered", password: "long enough" }), false);
  assert.equal(ok({ ...base, tier: "registered", displayNickname: "Owl" }), false);
  assert.equal(ok({ ...base, tier: "registered", password: "short", displayNickname: "Owl" }), false);
  assert.equal(ok({ ...base, tier: "registered", password: "long enough", displayNickname: "admin" }), false);
  assert.equal(ok({ ...base, tier: "guest" }), true);
  assert.equal(ok({ ...base, tier: "guest", password: "long enough" }), false);
  assert.equal(ok({ ...base, tier: "guest", displayNickname: "Owl" }), false);
  assert.equal(ok({ ...base, tier: "vip" }), false);
});

test("player endpoints answer 503 without their secret, before reading anything", async () => {
  const saved = process.env.PLAYER_SESSION_SECRET;
  delete process.env.PLAYER_SESSION_SECRET;
  try {
    const { POST: login } = await import("../src/app/api/player/login/route");
    const { GET: me } = await import("../src/app/api/player/me/route");
    const res = await login(
      new Request(`${ORIGIN}/api/player/login`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ xgId: "XG-0001", password: "whatever1" }),
      }),
    );
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("set-cookie"), null);
    assert.equal((await me(new Request(`${ORIGIN}/api/player/me`))).status, 503);
  } finally {
    process.env.PLAYER_SESSION_SECRET = saved;
  }
});

test("player endpoints take the player only from a valid session cookie", async () => {
  // Configured, but the database is never reached: every request below fails first.
  process.env.DATABASE_URL = "postgres://nobody@127.0.0.1:1/never";
  const { GET: me } = await import("../src/app/api/player/me/route");
  const { POST: join } = await import("../src/app/api/player/tournaments/[id]/join/route");
  assert.equal((await me(new Request(`${ORIGIN}/api/player/me`))).status, 401);
  const forged = auth
    .signSession({ playerId: PLAYER, xgId: "XG-0007" }, now(), "y".repeat(40));
  assert.equal(
    (
      await me(
        new Request(`${ORIGIN}/api/player/me`, {
          headers: { cookie: `xg_player_session=${forged}` },
        }),
      )
    ).status,
    401,
  );
  const params = Promise.resolve({ id: "open-cup" });
  const joinWith = (body: object, cookie?: string) =>
    join(
      new Request(`${ORIGIN}/api/player/tournaments/open-cup/join`, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          "content-type": "application/json",
          ...(cookie ? { cookie: `xg_player_session=${cookie}` } : {}),
        },
        body: JSON.stringify(body),
      }),
      { params },
    );
  // Naming a player in the body is refused outright, whoever is signed in.
  for (const extra of [{ playerId: PLAYER }, { xgId: "XG-0001" }])
    assert.equal((await joinWith({ teamName: "Night Owls", ...extra })).status, 400);
  assert.equal((await joinWith({ teamName: "Night Owls" })).status, 401);
  delete process.env.DATABASE_URL;
});

/** Every .ts/.tsx file under a directory. */
async function sources(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(new URL(dir, import.meta.url), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await sources(path)));
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}
const text = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("organizer code never reads the player session, and player routes never use the organizer one", async () => {
  const PLAYER_SESSION = /xg_player_session|SESSION_COOKIE|playerSessionFrom|sessionPlayer|verifySession|readCookie/;
  const organizer = [
    ...(await sources("../src/app/api/admin")),
    ...(await sources("../src/app/admin")),
    "../src/lib/api.ts",
    "../src/auth.ts",
    "../src/lib/control.ts",
    "../src/lib/access.ts",
  ];
  for (const f of organizer)
    assert.doesNotMatch(await text(f), PLAYER_SESSION, f);
  // The one organizer route that touches player accounts goes through the Discord actor check.
  const issue = await text("../src/lib/player-account.ts");
  assert.match(
    issue.slice(issue.indexOf("export async function issueOneTimeCode")),
    /await resolve\("players", "\*"\);\s+requireRegistrationReviewer\(organizer\);/,
  );
  const player = await sources("../src/app/api/player");
  assert.ok(player.length >= 5);
  for (const f of player) {
    const src = await text(f);
    assert.doesNotMatch(src, /@\/auth|\bactor\(|issueOneTimeCode/, f);
    // Identity comes from the session, never from a body field or query parameter.
    assert.doesNotMatch(src, /searchParams|playerId/, f);
  }
});

test("the admin API ignores a valid player session", async () => {
  process.env.MAIN_ADMIN_DISCORD_IDS = "759756138437804042,759756138437804043";
  const { GET } = await import("../src/app/api/admin/route");
  const token = auth.signSession({ playerId: PLAYER, xgId: "XG-0007" }, now());
  // Unconfigured, then configured for Discord sign-in: neither accepts the player cookie.
  for (const authSecret of [undefined, "test-only-auth-secret-0123456789abcdef"]) {
    if (authSecret) process.env.AUTH_SECRET = authSecret;
    for (const path of ["/api/admin", "/api/admin?t=open-cup", "/api/admin?health=1"]) {
      const res = await GET(
        new Request(`${ORIGIN}${path}`, {
          headers: { cookie: `xg_player_session=${token}` },
        }),
      );
      assert.ok([401, 403, 503].includes(res.status), `${path}: ${res.status}`);
      const body = await res.json();
      assert.deepEqual(Object.keys(body), ["error"], path);
    }
  }
  delete process.env.AUTH_SECRET;
  delete process.env.MAIN_ADMIN_DISCORD_IDS;
});
