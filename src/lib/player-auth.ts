import {
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { z } from "zod";
import { HttpError } from "./api";
import { subkey } from "./private-data";

/**
 * XG player accounts: password hashing, the signed session cookie, nickname rules
 * and one-time codes. No database access here (see player-account.ts).
 *
 * Players and organizers never share a session. Organizers sign in with Discord
 * (Auth.js, src/auth.ts) and nothing under /admin or /api/admin reads this cookie;
 * player endpoints read only this cookie and take the player's identity from it,
 * never from the request body or query string.
 */

/* ───────────────────────── Passwords ───────────────────────── */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
const PASSWORD_RULE = `Passwords are ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`;
export const passwordInput = z
  .string()
  .min(PASSWORD_MIN, PASSWORD_RULE)
  .max(PASSWORD_MAX, PASSWORD_RULE);

// N=2^14, r=8, p=1: about 16 MB and tens of milliseconds per hash.
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const KEY_BYTES = 64;
const SALT_BYTES = 16;
const MAX_MEMORY = 64 * 1024 * 1024;
/** scrypt$N$r$p$salt$key, both base64url. The migrations check the same shape. */
const HASH_FORMAT =
  /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{86})$/;

function derive(password: string, salt: Buffer, o: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      // The same characters typed on different keyboards hash the same.
      password.normalize("NFKC"),
      salt,
      KEY_BYTES,
      { ...o, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}

export async function hashPassword(password: string) {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

let dummy: Promise<string> | undefined;
/** Spends the same time as a real check, so a response never reveals whether an account exists. */
export const burnPasswordCheck = async (password: string) => {
  await verifyPassword(
    password,
    await (dummy ??= hashPassword(randomBytes(16).toString("hex"))),
  );
  return false as const;
};

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
) {
  const m = stored ? HASH_FORMAT.exec(stored) : null;
  if (!m) return burnPasswordCheck(password);
  const [N, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Only parameters this code could have written (a stored value is never trusted to set its own cost).
  if (N !== SCRYPT.N || r !== SCRYPT.r || p !== SCRYPT.p)
    return burnPasswordCheck(password);
  const expected = Buffer.from(m[5], "base64url");
  const key = await derive(password, Buffer.from(m[4], "base64url"), {
    N,
    r,
    p,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/* ───────────────────────── Session ───────────────────────── */

export const SESSION_COOKIE = "xg_player_session";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
const SESSION_CONTEXT = "xg-player-session:v1.";

export type PlayerSession = {
  kind: "player";
  playerId: string;
  xgId: string;
  /** Issued at, seconds since the epoch (database clock). */
  iat: number;
  exp: number;
};

const sessionShape = z.strictObject({
  kind: z.literal("player"),
  playerId: z.string().uuid(),
  xgId: z.string().regex(/^XG-\d{4,10}$/),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
});

/**
 * PLAYER_SESSION_SECRET signs player sessions. It is separate from AUTH_SECRET
 * (organizers) and PRIVATE_DATA_KEY. There is no fallback value: without it,
 * player sign-in is unavailable in every environment.
 */
export function sessionSecret(
  env: Record<string, string | undefined> = process.env,
) {
  const secret = env.PLAYER_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32)
    throw new HttpError(503, "Player sign-in is not available yet.");
  return secret;
}

const sign = (body: string, secret: string) =>
  createHmac("sha256", secret)
    .update(SESSION_CONTEXT + body)
    .digest();

export function signSession(
  who: { playerId: string; xgId: string },
  iat: number,
  secret = sessionSecret(),
) {
  const payload: PlayerSession = {
    kind: "player",
    playerId: who.playerId,
    xgId: who.xgId,
    iat,
    exp: iat + SESSION_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret).toString("base64url")}`;
}

/** The verified payload, or null for anything forged, malformed or expired. */
export function verifySession(
  token: string | null | undefined,
  now = Math.floor(Date.now() / 1000),
  secret = sessionSecret(),
): PlayerSession | null {
  if (!token || token.length > 1024) return null;
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const given = Buffer.from(mac, "base64url");
  const expected = sign(body, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const session = sessionShape.safeParse(parsed);
  if (!session.success) return null;
  const s = session.data;
  // A minute of tolerance for clock differences between the app and the database.
  if (s.exp <= now || s.iat > now + 60 || s.exp - s.iat !== SESSION_SECONDS)
    return null;
  return s;
}

export function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name)
      return part.slice(i + 1).trim();
  }
  return null;
}

const secure = (env: Record<string, string | undefined>) =>
  env.NODE_ENV === "production" ? "; Secure" : "";

export const sessionCookie = (
  token: string,
  env: Record<string, string | undefined> = process.env,
) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure(env)}`;

export const clearedSessionCookie = (
  env: Record<string, string | undefined> = process.env,
) =>
  `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure(env)}`;

/**
 * A display hint for the public navbar ("Dashboard" instead of "Login"), so
 * public pages stay static and never touch the database. It holds only the
 * session's expiry time: no identity, nothing signed, and it grants nothing.
 * /dashboard still verifies the real session and sends anyone else to /login,
 * which clears a stale hint.
 */
export const SESSION_HINT_COOKIE = "xg_player_hint";
export const sessionHintCookie = (
  exp: number,
  env: Record<string, string | undefined> = process.env,
) =>
  `${SESSION_HINT_COOKIE}=${Math.floor(exp)}; Path=/; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure(env)}`;
export const clearedSessionHintCookie = (
  env: Record<string, string | undefined> = process.env,
) =>
  `${SESSION_HINT_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure(env)}`;

/** The signed-in player from the cookie alone. Database checks follow in player-account.ts. */
export function playerSessionFrom(request: Request) {
  const session = verifySession(readCookie(request, SESSION_COOKIE));
  if (!session) throw new HttpError(401, "Sign in with your XG ID.");
  return session;
}

/* ───────────────────────── Brute force ───────────────────────── */

/** Failed sign-ins and code redemptions share one counter per XG ID. */
export const LOCK_AFTER_FAILURES = 5;
export const LOCK_MINUTES = 15;

/* ───────────────────────── Nicknames ───────────────────────── */

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 24;
const RESERVED = new Set(["admin", "organizer", "xgamer", "staff", "mod"]);

/** NFKC, trimmed, inner whitespace collapsed: the form that is stored and compared. */
export const normalizeNickname = (raw: string) =>
  raw.normalize("NFKC").trim().replace(/\s+/g, " ");

/** Why a nickname is refused, or null when it is acceptable. Uniqueness is checked in the database. */
export function nicknameProblem(nickname: string): string | null {
  const n = normalizeNickname(nickname);
  const length = [...n].length;
  if (length < NICKNAME_MIN || length > NICKNAME_MAX)
    return `Nicknames are ${NICKNAME_MIN}–${NICKNAME_MAX} characters.`;
  if (!/^[\p{L}\p{N} _.'-]+$/u.test(n))
    return "Use letters, numbers, spaces and _ . ' - only.";
  if (/^xg-?\d+$/i.test(n)) return "A nickname can't look like an XG ID.";
  // Words, split at separators and between letters and digits ("Admin_01", "mod 7").
  const words = n
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+|(?<=\p{L})(?=\p{N})|(?<=\p{N})(?=\p{L})/u)
    .filter(Boolean);
  const joined = n.toLowerCase().replace(/[^\p{L}]+/gu, "");
  if (words.some((w) => RESERVED.has(w)) || RESERVED.has(joined))
    return "That nickname is reserved.";
  return null;
}

export const nicknameInput = z
  .string()
  .max(64)
  .transform((raw, ctx) => {
    const problem = nicknameProblem(raw);
    if (problem) {
      ctx.addIssue({ code: "custom", message: problem });
      return z.NEVER;
    }
    return normalizeNickname(raw);
  });

/* ───────────────────────── One-time codes ───────────────────────── */

/** No 0/O or 1/I, so a code read out on WhatsApp can't be misread. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
export const CODE_HOURS = 24;
export type CodePurpose = "claim" | "reset";

export function generateOneTimeCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++)
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** What players may type: spaces and dashes are ignored, case too. */
export const normalizeOneTimeCode = (raw: string) =>
  raw.replace(/[\s-]/g, "").toUpperCase();

export const oneTimeCodeInput = z
  .string()
  .max(32)
  .transform(normalizeOneTimeCode)
  .pipe(z.string().regex(new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`)));

/**
 * Keyed hash of a code for one player and purpose. Without PRIVATE_DATA_KEY a
 * copy of the table can't be used to try codes offline.
 */
export const oneTimeCodeHash = (
  playerId: string,
  purpose: CodePurpose,
  code: string,
) =>
  createHmac("sha256", subkey("xg:player-one-time-code:v1"))
    .update(JSON.stringify([playerId, purpose, normalizeOneTimeCode(code)]))
    .digest("hex");
