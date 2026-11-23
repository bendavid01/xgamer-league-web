/**
 * XG player accounts (XG-008) end to end on a disposable local PostgreSQL:
 * two-tier registration, approval activating the signup password, organizer
 * one-time codes, sign-in lockout, session isolation, one-click entry and guest
 * visibility. Synthetic data only.
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import postgres from "postgres";
import { testDatabaseUrl } from "./helpers/test-database";

const base = testDatabaseUrl();
const skip = !base && "TEST_DATABASE_URL not set";
const ORIGIN = "http://localhost:3000";
const CUP = "accounts-cup";
const LEAGUE = "accounts-league";
const NEXT = "accounts-next-cup";
const CLOSED = "accounts-closed-cup";
const admin = {
  id: "759756138437804042",
  name: "First Organizer",
  role: "admin" as const,
  tournaments: [],
  operations: [],
};
const otherAdmin = { ...admin, id: "759756138437804043", name: "Second Organizer" };
const coordinator = {
  ...admin,
  id: "759756138437804044",
  role: "coordinator" as const,
  tournaments: ["*"],
  operations: ["registrations"],
};
const asAdmin = async () => admin;
const asCoordinator = async () => coordinator;
const verification = {
  identityVerified: true,
  contactVerified: true,
  reason: "Verified the applicant and contact in a live call.",
};

let sql: ReturnType<typeof import("../src/lib/db").db>;
let routes: {
  register: typeof import("../src/app/api/registrations/route").POST;
  login: typeof import("../src/app/api/player/login/route").POST;
  logout: typeof import("../src/app/api/player/logout/route").POST;
  me: typeof import("../src/app/api/player/me/route").GET;
  redeem: typeof import("../src/app/api/player/redeem-code/route").POST;
  join: typeof import("../src/app/api/player/tournaments/[id]/join/route").POST;
  adminGet: typeof import("../src/app/api/admin/route").GET;
};
let approve: typeof import("../src/lib/new-player-registration").executeNewPlayerRegistration;
let issue: typeof import("../src/lib/player-account").issueOneTimeCode;
let control: typeof import("../src/lib/control");
let auth: typeof import("../src/lib/player-auth");

before(async () => {
  if (!base) return;
  const dbUrl = new URL(base);
  const name = dbUrl.pathname.slice(1) + "_accounts";
  if (!/^[a-z0-9_]{1,50}$/.test(name)) throw new Error("Unsafe test database name.");
  const setup = postgres(base, { ssl: false, max: 1, onnotice: () => {} });
  try {
    await setup`drop database if exists ${setup(name)} with (force)`;
    await setup`create database ${setup(name)}`;
  } finally {
    await setup.end();
  }
  dbUrl.pathname = "/" + name;
  process.env.DATABASE_URL = dbUrl.toString();
  process.env.PRIVATE_DATA_KEY = "ce".repeat(32);
  process.env.REGISTRATION_ENABLED = "true";
  process.env.APP_ORIGIN = ORIGIN;
  process.env.MAIN_ADMIN_DISCORD_IDS = `${admin.id},${otherAdmin.id}`;
  process.env.PLAYER_SESSION_SECRET = "test-only-player-session-secret-abcdef0123";
  sql = (await import("../src/lib/db")).db();
  routes = {
    register: (await import("../src/app/api/registrations/route")).POST,
    login: (await import("../src/app/api/player/login/route")).POST,
    logout: (await import("../src/app/api/player/logout/route")).POST,
    me: (await import("../src/app/api/player/me/route")).GET,
    redeem: (await import("../src/app/api/player/redeem-code/route")).POST,
    join: (await import("../src/app/api/player/tournaments/[id]/join/route")).POST,
    adminGet: (await import("../src/app/api/admin/route")).GET,
  };
  ({ executeNewPlayerRegistration: approve } = await import("../src/lib/new-player-registration"));
  ({ issueOneTimeCode: issue } = await import("../src/lib/player-account"));
  control = await import("../src/lib/control");
  auth = await import("../src/lib/player-auth");
  const { applyMigrations, migrationFiles } = await import("../src/lib/migrations");
  await applyMigrations(sql, await migrationFiles(), () => {});
  await sql`insert into tournament(id,name,status,published,format) values
    (${CUP},'Accounts Cup','open',true,'league'),
    (${LEAGUE},'Accounts League','league',true,'league'),
    (${NEXT},'Next Cup','open',true,'league'),
    (${CLOSED},'Closed Cup','locked',true,'league')`;
});

after(async () => {
  if (sql) await sql.end();
});

// Every request comes from "local": keep the per-address limits out of the way.
beforeEach(async () => {
  if (sql) await sql`delete from rate_limit`;
});

const post = (path: string, body: unknown, cookie?: string) =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      ...(cookie ? { cookie: `xg_player_session=${cookie}` } : {}),
    },
    body: JSON.stringify(body),
  });
const get = (path: string, cookie?: string) =>
  new Request(`${ORIGIN}${path}`, {
    headers: cookie ? { cookie: `xg_player_session=${cookie}` } : {},
  });
/** A different well-formed XG ID. */
const legacyLikeId = (xgId: string) =>
  `XG-${String(Number(xgId.slice(3)) + 1).padStart(4, "0")}`;
/** The session token from a Set-Cookie header (attributes checked separately). */
const tokenOf = (res: Response) =>
  /^xg_player_session=([^;]*);/.exec(res.headers.get("set-cookie") ?? "")?.[1] ?? null;

let phoneNo = 0;
const nextPhone = () => `98100${String(20000 + ++phoneNo)}`;
async function apply(fields: Record<string, unknown>) {
  const phone = nextPhone();
  const res = await routes.register(
    post("/api/registrations", {
      teamName: "Night Owls",
      phone,
      consent: true,
      website: "",
      tournament: CUP,
      ...fields,
    }),
  );
  const json = await res.json();
  return { res, json, phone: `+91${phone}` };
}
const approveIt = (reference: string, phone: string, tournament = CUP) =>
  approve(
    { action: "newPlayer.approve", tournament, reference, verifiedPhone: phone, ...verification },
    asAdmin,
  );
const login = (xgId: string, password: string) =>
  routes.login(post("/api/player/login", { xgId, password }));
const redeem = (body: Record<string, unknown>) =>
  routes.redeem(post("/api/player/redeem-code", body));

let activated: { xgId: string; playerId: string; password: string; token: string };

test(
  "a registered applicant's password is hashed at signup, activated by approval and the hash purged",
  { skip },
  async () => {
    const password = "Signup pass 1";
    const { res, json, phone } = await apply({
      playerName: "Account Holder",
      tier: "registered",
      password,
      displayNickname: "  Night  Hawk ",
    });
    assert.equal(res.status, 202);
    const [pending] = await sql`select registration_tier,pending_password_hash,pending_nickname
      from new_player_registration_request where id=${json.reference}`;
    assert.equal(pending.registration_tier, "registered");
    assert.equal(pending.pending_nickname, "Night Hawk");
    assert.match(pending.pending_password_hash, /^scrypt\$/);
    assert.ok(!pending.pending_password_hash.includes(password));
    // No XG ID exists yet: the review screen previews the next one, and nothing is reserved.
    const seqBefore = (await sql`select last_value::int as v, is_called from player_public_no_seq`)[0];
    const workspace = await control.snapshot(CUP, asAdmin);
    const preview = workspace.nextAvailableXgId;
    assert.match(preview!, /^XG-\d{4}$/);
    assert.deepEqual(
      (await sql`select last_value::int as v, is_called from player_public_no_seq`)[0],
      seqBefore,
    );
    const shown = workspace.newPlayerRequests!.find((r) => r.reference === json.reference)!;
    assert.deepEqual([shown.tier, shown.accountReady, shown.nickname], ["registered", true, "Night Hawk"]);
    // A coordinator never sees the preview or the queue.
    assert.equal((await control.snapshot(CUP, asCoordinator)).nextAvailableXgId, undefined);

    const result = await approveIt(json.reference, phone);
    assert.equal(result.code, preview, "the previewed XG ID is minted by the approval");
    assert.equal(result.accountActivated, true);
    const [player] = await sql`select id,public_no,player_type,display_nickname,nickname_locked from player where id=${result.playerId}`;
    assert.deepEqual(
      [player.player_type, player.display_nickname, player.nickname_locked],
      ["registered", "Night Hawk", true],
    );
    const [credential] = await sql`select password_hash,password_changed_at from player_credential where player_id=${player.id}`;
    assert.equal(credential.password_hash, pending.pending_password_hash, "the signup hash moved unchanged");
    assert.ok(credential.password_changed_at);
    const [decided] = await sql`select status,gaming_name,contact_proof,pending_password_hash,pending_nickname
      from new_player_registration_request where id=${json.reference}`;
    assert.deepEqual(decided, {
      status: "approved",
      gaming_name: null,
      contact_proof: null,
      pending_password_hash: null,
      pending_nickname: null,
    });
    const [event] = await sql`select after_value from audit_event where action='application.create' and affected=${result.code}`;
    assert.equal(event.after_value.account_activated, true);
    assert.equal(event.after_value.nickname_locked, true);
    assert.ok(!JSON.stringify(event.after_value).includes("scrypt"));

    // The player can sign in the moment the approval commits.
    const signedIn = await login(result.code, password);
    assert.equal(signedIn.status, 200);
    const cookie = signedIn.headers.get("set-cookie")!;
    assert.match(cookie, /; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800/);
    activated = { xgId: result.code, playerId: player.id, password, token: tokenOf(signedIn)! };
  },
);

test("rejection erases the applicant's password hash and nickname", { skip }, async () => {
  const { json } = await apply({
    playerName: "Rejected Applicant",
    tier: "registered",
    password: "Never stored 1",
    displayNickname: "Gone Soon",
  });
  const seq = (await sql`select last_value::int as v from player_public_no_seq`)[0].v;
  await approve(
    { action: "newPlayer.reject", tournament: CUP, reference: json.reference, reason: "Could not verify the applicant." },
    asAdmin,
  );
  const [row] = await sql`select status,pending_password_hash,pending_nickname,gaming_name
    from new_player_registration_request where id=${json.reference}`;
  assert.deepEqual(row, { status: "rejected", pending_password_hash: null, pending_nickname: null, gaming_name: null });
  assert.equal((await sql`select last_value::int as v from player_public_no_seq`)[0].v, seq, "no XG ID used");
});

test("intake refuses taken nicknames, reserved words and account fields on a guest", { skip }, async () => {
  const taken = await apply({ playerName: "Copycat", tier: "registered", password: "Copycat pass", displayNickname: "night hawk" });
  assert.equal(taken.res.status, 409);
  const reserved = await apply({ playerName: "Sneaky", tier: "registered", password: "Sneaky pass1", displayNickname: "Admin_01" });
  assert.equal(reserved.res.status, 400);
  const guest = await apply({ playerName: "Guest Fields", tier: "guest", password: "Guest pass 1" });
  assert.equal(guest.res.status, 400);
  const short = await apply({ playerName: "Short Pass", tier: "registered", password: "short", displayNickname: "Shorty" });
  assert.equal(short.res.status, 400);
  assert.match(short.json.error, /8–128/);
});

test("the player hub reads only the session's own data; logout clears the cookie", { skip }, async () => {
  const res = await routes.me(get("/api/player/me", activated.token));
  assert.equal(res.status, 200);
  const hub = await res.json();
  assert.equal(hub.player.xgId, activated.xgId);
  assert.equal(hub.player.displayNickname, "Night Hawk");
  assert.equal(hub.player.nicknameLocked, true);
  assert.deepEqual(hub.entries.map((e: { tournamentId: string; status: string }) => [e.tournamentId, e.status]), [[CUP, "approved"]]);
  assert.ok(Array.isArray(hub.upcomingMatches) && Array.isArray(hub.pastMatches) && Array.isArray(hub.announcements));
  assert.equal((await routes.me(get("/api/player/me"))).status, 401);
  // An edited token (another XG ID, same signature) or one signed with another secret is refused.
  const [body, mac] = activated.token.split(".");
  const edited = JSON.parse(Buffer.from(body, "base64url").toString());
  edited.xgId = legacyLikeId(edited.xgId);
  const tampered = `${Buffer.from(JSON.stringify(edited)).toString("base64url")}.${mac}`;
  assert.equal((await routes.me(get("/api/player/me", tampered))).status, 401);
  const foreign = auth.signSession(
    { playerId: activated.playerId, xgId: activated.xgId },
    Math.floor(Date.now() / 1000),
    "another-secret-of-sufficient-length-0123456789",
  );
  assert.equal((await routes.me(get("/api/player/me", foreign))).status, 401);
  const out = await routes.logout(post("/api/player/logout", {}, activated.token));
  assert.equal(out.status, 200);
  assert.match(out.headers.get("set-cookie")!, /^xg_player_session=; .*Max-Age=0/);
});

test("five wrong passwords lock the XG ID for 15 minutes; success resets the count", { skip }, async () => {
  const { xgId, playerId, password } = activated;
  // Fewer than five failures, then success: the count starts again.
  for (let i = 0; i < 3; i++) assert.equal((await login(xgId, "wrong password")).status, 401);
  assert.equal((await login(xgId, password)).status, 200);
  assert.equal((await sql`select failed_attempts from player_credential where player_id=${playerId}`)[0].failed_attempts, 0);
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push((await login(xgId, "wrong password")).status);
  assert.deepEqual(statuses, [401, 401, 401, 401, 429]);
  const [locked] = await sql`select failed_attempts,locked_until > now() + interval '14 minutes' as long_enough
    from player_credential where player_id=${playerId}`;
  assert.equal(locked.long_enough, true);
  // Even the right password waits for the lock to end.
  const blocked = await login(xgId, password);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("set-cookie"), null);
  await sql`update player_credential set locked_until=now()-interval '1 second' where player_id=${playerId}`;
  assert.equal((await login(xgId, password)).status, 200);
  const [reset] = await sql`select failed_attempts,locked_until,last_login_at from player_credential where player_id=${playerId}`;
  assert.equal(reset.failed_attempts, 0);
  assert.equal(reset.locked_until, null);
  assert.ok(reset.last_login_at);
  // Unknown XG IDs fail the same way and create nothing.
  assert.equal((await login("XG-9999", password)).status, 401);
  assert.equal((await sql`select count(*)::int as n from player_credential`)[0].n, 1);
});

let legacy: { xgId: string; playerId: string };

test("organizer codes: main admins only, shown once, stored as a keyed hash, older code revoked", { skip }, async () => {
  // A registered player from the earlier form, with no password yet.
  const { json, phone } = await apply({ playerName: "Legacy Player" });
  const approved = await approveIt(json.reference, phone);
  assert.equal(approved.accountActivated, false);
  legacy = { xgId: approved.code, playerId: approved.playerId };

  await assert.rejects(() => issue(legacy.playerId, { purpose: "claim" }, asCoordinator), /main admins/);
  await assert.rejects(() => issue(legacy.playerId, { purpose: "reset" }, asAdmin), /claim code/);
  await assert.rejects(() => issue(legacy.playerId, { purpose: "claim", playerId: activated.playerId }, asAdmin), /claim or reset/);
  const first = await issue(legacy.playerId, { purpose: "claim" }, asAdmin);
  assert.match(first.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(first.xgId, legacy.xgId);
  const second = await issue(legacy.playerId, { purpose: "claim" }, asAdmin);
  const codes = await sql`select code_hash,revoked_at,created_by_admin
    from player_one_time_code where player_id=${legacy.playerId} order by created_at`;
  assert.equal(codes.length, 2);
  assert.ok(codes[0].revoked_at, "a new code replaces the open one");
  assert.equal(codes[1].revoked_at, null);
  assert.equal(codes[1].created_by_admin, admin.id);
  for (const c of codes) {
    assert.match(c.code_hash, /^[a-f0-9]{64}$/);
    assert.ok(![first.code, second.code].includes(c.code_hash));
  }
  const events = await sql`select actor,after_value from audit_event where action='player.code.issue' and entity=${legacy.playerId}`;
  assert.equal(events.length, 2);
  for (const e of events) {
    assert.equal(e.actor, admin.id);
    assert.ok(!JSON.stringify(e.after_value).includes(first.code) && !JSON.stringify(e.after_value).includes(second.code));
  }
  // The replaced code no longer works.
  assert.equal((await redeem({ xgId: legacy.xgId, code: first.code, newPassword: "Claimed pass 1" })).status, 401);
  legacyCode = second.code;
});
let legacyCode = "";

test("claiming: one use only, nickname set and locked once, wrong codes count toward the lockout", { skip }, async () => {
  // The failure above counted once; three more wrong codes.
  for (const code of ["AAAAAA", "BBBBBB", "CCCCCC"])
    assert.equal((await redeem({ xgId: legacy.xgId, code, newPassword: "Claimed pass 1" })).status, 401);
  // The right code with a taken nickname: refused without using the code or adding a failure.
  const clash = await redeem({ xgId: legacy.xgId, code: legacyCode, newPassword: "Claimed pass 1", displayNickname: "NIGHT HAWK" });
  assert.equal(clash.status, 409);
  const [state] = await sql`select c.failed_attempts,(select used_at from player_one_time_code o where o.player_id=c.player_id and o.revoked_at is null) as used_at
    from player_credential c where c.player_id=${legacy.playerId}`;
  assert.deepEqual(state, { failed_attempts: 4, used_at: null });
  const res = await redeem({ xgId: legacy.xgId, code: legacyCode.toLowerCase(), newPassword: "Claimed pass 1", displayNickname: "Old Timer" });
  assert.equal(res.status, 200);
  const token = tokenOf(res)!;
  assert.equal((await routes.me(get("/api/player/me", token))).status, 200);
  const [player] = await sql`select display_nickname,nickname_locked from player where id=${legacy.playerId}`;
  assert.deepEqual(player, { display_nickname: "Old Timer", nickname_locked: true });
  const [credential] = await sql`select failed_attempts,password_hash from player_credential where player_id=${legacy.playerId}`;
  assert.equal(credential.failed_attempts, 0);
  assert.match(credential.password_hash, /^scrypt\$/);
  assert.equal((await sql`select count(*)::int as n from player_one_time_code where player_id=${legacy.playerId} and used_at is not null`)[0].n, 1);
  // Single use.
  assert.equal((await redeem({ xgId: legacy.xgId, code: legacyCode, newPassword: "Another pass 1" })).status, 401);
  assert.equal((await login(legacy.xgId, "Claimed pass 1")).status, 200);
  const [audit] = await sql`select actor,actor_role,after_value from audit_event where action='player.account.claim' and entity=${legacy.playerId}`;
  assert.deepEqual([audit.actor, audit.actor_role, audit.after_value], [`player:${legacy.playerId}`, "player", { purpose: "claim", nickname_set: true }]);

  // Claimed accounts get reset codes; the nickname stays locked.
  await assert.rejects(() => issue(legacy.playerId, { purpose: "claim" }, asAdmin), /already claimed/);
  const reset = await issue(legacy.playerId, { purpose: "reset" }, asAdmin);
  const rename = await redeem({ xgId: legacy.xgId, code: reset.code, newPassword: "Reset pass 12", displayNickname: "New Name" });
  assert.equal(rename.status, 409);
  // A session older than the new password stops working. (The claim happened a
  // moment ago; move it back so a session from 10 seconds ago is still valid.)
  await sql`update player_credential set password_changed_at=now()-interval '30 seconds' where player_id=${legacy.playerId}`;
  const [{ now }] = await sql`select floor(extract(epoch from now()))::int as now`;
  const old = auth.signSession({ playerId: legacy.playerId, xgId: legacy.xgId }, now - 10);
  assert.equal((await routes.me(get("/api/player/me", old))).status, 200);
  // A session older than the current password is already refused.
  const older = auth.signSession({ playerId: legacy.playerId, xgId: legacy.xgId }, now - 60);
  assert.equal((await routes.me(get("/api/player/me", older))).status, 401);
  const done = await redeem({ xgId: legacy.xgId, code: reset.code, newPassword: "Reset pass 12" });
  assert.equal(done.status, 200);
  assert.equal((await routes.me(get("/api/player/me", old))).status, 401);
  assert.equal((await routes.me(get("/api/player/me", tokenOf(done)!))).status, 200);
  assert.equal((await login(legacy.xgId, "Claimed pass 1")).status, 401);
  assert.equal((await login(legacy.xgId, "Reset pass 12")).status, 200);
  assert.equal((await sql`select display_nickname from player where id=${legacy.playerId}`)[0].display_nickname, "Old Timer");
});

test("codes expire after 24 hours, and five wrong codes lock redemption too", { skip }, async () => {
  const reset = await issue(legacy.playerId, { purpose: "reset" }, asAdmin);
  const [row] = await sql`select extract(epoch from expires_at - created_at)::int as seconds
    from player_one_time_code where player_id=${legacy.playerId} and used_at is null and revoked_at is null`;
  assert.equal(row.seconds, 24 * 60 * 60);
  await sql`update player_one_time_code set created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour'
    where player_id=${legacy.playerId} and used_at is null and revoked_at is null`;
  assert.equal((await redeem({ xgId: legacy.xgId, code: reset.code, newPassword: "Expired pass 1" })).status, 401);

  const fresh = await issue(legacy.playerId, { purpose: "reset" }, asAdmin);
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await redeem({ xgId: legacy.xgId, code: "ZZZZZZ", newPassword: "Wrong code 1" })).status);
  assert.deepEqual(statuses, [401, 401, 401, 429], "the expired attempt counted as the first failure");
  assert.equal((await redeem({ xgId: legacy.xgId, code: fresh.code, newPassword: "Locked out 1" })).status, 429);
  // The same lock stops sign-in.
  assert.equal((await login(legacy.xgId, "Reset pass 12")).status, 429);
  await sql`update player_credential set locked_until=now()-interval '1 second' where player_id=${legacy.playerId}`;
  assert.equal((await redeem({ xgId: legacy.xgId, code: fresh.code, newPassword: "Unlocked pass 1" })).status, 200);
});

let guest: { playerId: string; name: string };

test("guests: no XG ID, no account, no profile, never in all-time rankings, still in the table", { skip }, async () => {
  const preview = (await control.snapshot(CUP, asAdmin)).nextAvailableXgId;
  const { res, json, phone } = await apply({ playerName: "Visiting Guest", tier: "guest" });
  assert.equal(res.status, 202);
  const result = await approveIt(json.reference, phone);
  assert.equal(result.code, "GUEST");
  assert.equal(result.accountActivated, false);
  const [row] = await sql`select public_no,player_type,display_nickname from player where id=${result.playerId}`;
  assert.ok(row.public_no < 0);
  assert.equal(row.player_type, "guest");
  assert.equal((await control.snapshot(CUP, asAdmin)).nextAvailableXgId, preview, "no XG ID used");
  guest = { playerId: result.playerId, name: "Visiting Guest" };
  await assert.rejects(() => issue(guest.playerId, { purpose: "claim" }, asAdmin), /Guests have no XG account/);
  assert.equal((await sql`select count(*)::int as n from player_credential where player_id=${guest.playerId}`)[0].n, 0);

  // A league with the guest and two registered players, all results in.
  const players = [activated.playerId, legacy.playerId, guest.playerId];
  for (const p of players)
    await sql`insert into application(tournament_id,player_id,status,team_name,team_name_source)
      values(${LEAGUE},${p},'approved','League Club','registration')`;
  const [a, b, g] = players;
  await sql`insert into fixture(tournament_id,stage,round,slot,home,away,home_score,away_score) values
    (${LEAGUE},'league',1,0,${a},${g},1,3),(${LEAGUE},'league',2,0,${b},${g},0,2),(${LEAGUE},'league',3,0,${a},${b},2,2)`;
  const { getTournament } = await import("../src/lib/tournaments");
  const league = (await getTournament(LEAGUE))!;
  const guestRow = league.players.find((p) => p.id === g)!;
  assert.deepEqual([guestRow.isGuest, guestRow.code, guestRow.name], [true, "GUEST", guest.name]);
  assert.equal(league.players.filter((p) => p.isGuest).length, 1);
  // Match math is intact: the guest won twice and tops the table.
  assert.equal(league.standings[0].id, g);
  assert.equal(league.standings[0].pts, 6);
  assert.equal(league.standings.find((s) => s.id === a)!.pts, 1);

  const { getProfile } = await import("../src/lib/profile");
  assert.equal(await getProfile("GUEST"), null);
  assert.equal(await getProfile(`XG-${String(Math.abs(row.public_no)).padStart(4, "0")}`).then((p) => p?.player.name === guest.name), false);
  const mine = (await getProfile(activated.xgId))!;
  const versus = mine.headToHead.find((h) => h.name === guest.name)!;
  assert.deepEqual([versus.isGuest, versus.code, versus.p, versus.l], [true, "GUEST", 1, 1]);

  const { getRecords } = await import("../src/lib/records");
  const records = (await getRecords())!;
  assert.ok(!records.players.some((p) => p.id === g), "not on all-time boards");
  assert.equal(records.totals.players, records.players.length);
  assert.ok(records.players.some((p) => p.id === a));
  assert.ok(![...records.biggestWins, ...records.highestScoring].some((m) => m.winner.name === guest.name || m.loser.name === guest.name));
});

test("signed-in players enter an open tournament in one step; the session decides who", { skip }, async () => {
  const signedIn = await login(activated.xgId, activated.password);
  const token = tokenOf(signedIn)!;
  const join = (id: string, body: unknown, cookie: string | null = token) =>
    routes.join(post(`/api/player/tournaments/${id}/join`, body, cookie ?? undefined), {
      params: Promise.resolve({ id }),
    });
  assert.equal((await join(NEXT, { teamName: "Owls United" }, null)).status, 401);
  // Naming another player is refused, not ignored.
  assert.equal((await join(NEXT, { teamName: "Owls United", playerId: legacy.playerId })).status, 400);
  const res = await join(NEXT, { teamName: "Owls United" });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { ok: true, status: "pending" });
  const entries = await sql`select player_id,status,team_name,team_name_source from application where tournament_id=${NEXT}`;
  assert.deepEqual([...entries], [{ player_id: activated.playerId, status: "pending", team_name: "Owls United", team_name_source: "registration" }]);
  assert.equal((await join(NEXT, { teamName: "Owls United" })).status, 409);
  assert.equal((await join(CLOSED, { teamName: "Owls United" })).status, 409);
  const [event] = await sql`select actor,actor_role,after_value from audit_event where action='application.create' and tournament_id=${NEXT}`;
  assert.deepEqual([event.actor, event.actor_role, event.after_value.method], [`player:${activated.playerId}`, "player", "player_portal"]);
  // A removed entry is restored only by an organizer.
  await sql`update application set deleted_at=now() where tournament_id=${NEXT} and player_id=${activated.playerId}`;
  const again = await join(NEXT, { teamName: "Owls United" });
  assert.equal(again.status, 409);
  assert.match((await again.json()).error, /organizer/);
  // A retired player's session stops working.
  await sql`update player set deleted_at=now() where id=${activated.playerId}`;
  assert.equal((await routes.me(get("/api/player/me", token))).status, 401);
  await sql`update player set deleted_at=null where id=${activated.playerId}`;
});

test("the organizer API never accepts a player session", { skip }, async () => {
  const token = tokenOf(await login(activated.xgId, activated.password))!;
  for (const path of ["/api/admin", `/api/admin?t=${CUP}`, "/api/admin?teams=1"]) {
    const res = await routes.adminGet(get(path, token));
    assert.ok([401, 403, 503].includes(res.status), `${path}: ${res.status}`);
    assert.deepEqual(Object.keys(await res.json()), ["error"]);
  }
});

test("OM overview: the five latest audit events and pending account approvals", { skip }, async () => {
  await apply({ playerName: "Waiting Account", tier: "registered", password: "Waiting pass1", displayNickname: "Waiter" });
  await apply({ playerName: "Waiting Legacy" });
  await apply({ playerName: "Waiting Guest", tier: "guest" });
  const home = await control.home(asAdmin);
  assert.equal(home.recentActivity.length, 5);
  assert.deepEqual(home.recentActivity, home.audit.slice(0, 5));
  const ids = home.recentActivity.map((e) => Number(e.id));
  assert.deepEqual(ids, [...ids].sort((x, y) => y - x));
  assert.deepEqual(home.playerApprovals, { registered: 2, accounts: 1, guests: 1, returning: 0 });
  const coordinatorHome = await control.home(asCoordinator);
  assert.equal(coordinatorHome.playerApprovals, null);
  assert.deepEqual(coordinatorHome.recentActivity, []);
});
