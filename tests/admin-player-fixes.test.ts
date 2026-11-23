/**
 * Unit checks (no database) for the main-admin drawer corrections and the
 * navbar's signed-in hint.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError } from "../src/lib/api";
import {
  clearRejectedEntry,
  clearRejectedInput,
  correctWhatsApp,
  correctWhatsAppInput,
} from "../src/lib/admin-player-fixes";
import {
  SESSION_SECONDS,
  clearedSessionHintCookie,
  sessionHintCookie,
} from "../src/lib/player-auth";
import { hasPlayerHint } from "../src/components/playerHint";
import { ACTION_LABEL } from "../src/components/om/labels";

const PLAYER = "6f1c7d0e-6f7b-4c3a-9a55-0d4c5b9e2a10";
const ENTRY = "0b8f6a52-2c1d-4e8f-b0a3-7c9d1e2f3a4b";
const forbidden = (e: unknown) =>
  e instanceof HttpError && e.status === 403;

test("only configured main admins reach either correction (403 before any work)", async () => {
  process.env.MAIN_ADMIN_DISCORD_IDS = "759756138437804062,759756138437804063";
  const coordinator = async () => ({
    id: "759756138437804064",
    role: "coordinator" as const,
    operations: ["registrations"],
    tournaments: ["*"],
  });
  const signedOut = async (): Promise<never> => {
    throw new HttpError(401, "Sign in with Discord.");
  };
  const notListed = async () => ({
    id: "759756138437809999",
    role: "admin" as const,
    operations: [],
    tournaments: [],
  });
  const input = { whatsapp: "+919820012345", reason: "Initial wrong number fix" };
  for (const who of [coordinator, signedOut, notListed]) {
    await assert.rejects(correctWhatsApp(PLAYER, input, who), forbidden);
    await assert.rejects(
      clearRejectedEntry(PLAYER, ENTRY, { reason: "Old entry" }, who),
      forbidden,
    );
  }
  // Anything else the organizer check throws is passed through unchanged.
  const unconfigured = async (): Promise<never> => {
    throw new HttpError(503, "Down");
  };
  await assert.rejects(correctWhatsApp(PLAYER, input, unconfigured), (e) =>
    e instanceof HttpError && e.status === 503,
  );
});

test("reasons are 3–200 characters with no contact details; inputs are strict", () => {
  const ok = (v: unknown) => correctWhatsAppInput.safeParse(v).success;
  assert.equal(ok({ whatsapp: "9820012345", reason: "Initial wrong number fix" }), true);
  assert.equal(ok({ whatsapp: "9820012345", reason: "  ab  " }), false);
  assert.equal(ok({ whatsapp: "9820012345", reason: "x".repeat(201) }), false);
  assert.equal(ok({ whatsapp: "9820012345", reason: "call 98200 12345" }), false);
  assert.equal(ok({ whatsapp: "9820012345" }), false);
  assert.equal(ok({ whatsapp: "9820012345", reason: "Fix", playerId: PLAYER }), false);
  assert.equal(clearRejectedInput.safeParse({ reason: "Old entry" }).success, true);
  assert.equal(clearRejectedInput.safeParse({ reason: "no" }).success, false);
  assert.equal(
    clearRejectedInput.safeParse({ reason: "Old entry", status: "approved" }).success,
    false,
  );
});

test("the navbar hint cookie holds only the expiry and is readable by the page", () => {
  const exp = 1_900_000_000;
  const cookie = sessionHintCookie(exp, { NODE_ENV: "production" });
  assert.equal(
    cookie,
    `xg_player_hint=${exp}; Path=/; SameSite=Lax; Max-Age=${SESSION_SECONDS}; Secure`,
  );
  assert.doesNotMatch(cookie, /HttpOnly/);
  assert.match(clearedSessionHintCookie({}), /^xg_player_hint=; Path=\/; SameSite=Lax; Max-Age=0;/);

  const future = Math.floor(Date.now() / 1000) + 3600;
  const past = Math.floor(Date.now() / 1000) - 60;
  assert.equal(hasPlayerHint(`a=1; xg_player_hint=${future}; b=2`), true);
  assert.equal(hasPlayerHint(`xg_player_hint=${past}`), false);
  assert.equal(hasPlayerHint("xg_player_hint="), false);
  assert.equal(hasPlayerHint("xg_player_hint=abc"), false);
  assert.equal(hasPlayerHint("xg_player_session=x.y"), false);
  assert.equal(hasPlayerHint(""), false);
});

test("both new audit actions have readable labels", () => {
  assert.equal(ACTION_LABEL["player.whatsapp_correct"], "Corrected WhatsApp number");
  assert.equal(ACTION_LABEL["application.clear_rejected"], "Removed rejected entry");
});
