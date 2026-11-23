/**
 * Main-admin corrections in the OM player drawer, end to end on a disposable
 * local PostgreSQL: Correct WhatsApp and Remove rejected entry. Synthetic data only.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { testDatabaseUrl } from "./helpers/test-database";

const base = testDatabaseUrl();
const skip = !base && "TEST_DATABASE_URL not set";
const ORIGIN = "http://localhost:3000";
const OPEN = "fixes-open-cup";
const PLAYED = "fixes-played-league";
const OLD = "fixes-old-cup";
const admin = {
  id: "759756138437804052",
  name: "First Organizer",
  role: "admin" as const,
  tournaments: [],
  operations: [],
};
const otherAdmin = { ...admin, id: "759756138437804053", name: "Second Organizer" };
const coordinator = {
  ...admin,
  id: "759756138437804054",
  role: "coordinator" as const,
  tournaments: ["*"],
  operations: ["registrations", "results", "announcements"],
};
const asAdmin = async () => admin;
const asCoordinator = async () => coordinator;
/** No Discord organizer session at all (for example a player-cookie request). */
const signedOut = async (): Promise<never> => {
  const { HttpError } = await import("../src/lib/api");
  throw new HttpError(401, "Sign in with Discord.");
};
const VERIFIED = {
  identityVerified: true,
  contactVerified: true,
  reason: "Confirmed the player in a live call and checked their contact.",
};

let sql: ReturnType<typeof import("../src/lib/db").db>;
let fixes: typeof import("../src/lib/admin-player-fixes");
let returning: typeof import("../src/lib/returning-registration").executeReturningRegistration;
let details: typeof import("../src/lib/player-details").playerDetails;
let pd: typeof import("../src/lib/private-data");
let routes: {
  whatsapp: typeof import("../src/app/api/admin/players/[id]/whatsapp/route").POST;
  clear: typeof import("../src/app/api/admin/players/[id]/rejected-entries/[entryId]/route").DELETE;
};

const rejects = (status: number, message?: RegExp) => (e: unknown) => {
  assert.equal((e as { status: number }).status, status, (e as Error).message);
  if (message) assert.match((e as Error).message, message);
  return true;
};

let phoneNo = 0;
const nextPhone = () => `+9198200${String(30000 + ++phoneNo)}`;
async function player(name: string, phone = nextPhone()) {
  const [row] = await sql<{ id: string; public_no: number }[]>`
    insert into player(gaming_name,team_name,contact_hash,contact_cipher,consent_version)
    values(${name},'Current Club',${pd.fingerprint("whatsapp:" + phone)},${pd.encrypt(phone)},'test')
    returning id,public_no`;
  return { ...row, phone, code: `XG-${String(row.public_no).padStart(4, "0")}` };
}
async function entry(playerId: string, tournament: string, status: string) {
  const [row] = await sql<{ id: string }[]>`
    insert into application(tournament_id,player_id,status) values(${tournament},${playerId},${status})
    returning id`;
  return row.id;
}
const auditOf = (action: string, entity: string) =>
  sql<{ summary: string; affected: string; before_value: unknown; after_value: unknown; actor: string }[]>`
    select summary,affected,before_value,after_value,actor from audit_event
    where action=${action} and entity=${entity} order by id`;

before(async () => {
  if (!base) return;
  const dbUrl = new URL(base);
  const name = dbUrl.pathname.slice(1) + "_fixes";
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
  process.env.PRIVATE_DATA_KEY = "cf".repeat(32);
  process.env.APP_ORIGIN = ORIGIN;
  process.env.CONTACT_EDITING = "on";
  process.env.MAIN_ADMIN_DISCORD_IDS = `${admin.id},${otherAdmin.id}`;
  delete process.env.AUTH_SECRET;
  sql = (await import("../src/lib/db")).db();
  fixes = await import("../src/lib/admin-player-fixes");
  ({ executeReturningRegistration: returning } = await import("../src/lib/returning-registration"));
  ({ playerDetails: details } = await import("../src/lib/player-details"));
  pd = await import("../src/lib/private-data");
  routes = {
    whatsapp: (await import("../src/app/api/admin/players/[id]/whatsapp/route")).POST,
    clear: (await import("../src/app/api/admin/players/[id]/rejected-entries/[entryId]/route")).DELETE,
  };
  const { applyMigrations, migrationFiles } = await import("../src/lib/migrations");
  await applyMigrations(sql, await migrationFiles(), () => {});
  await sql`insert into tournament(id,name,status,published,format) values
    (${OPEN},'Fixes Open Cup','open',true,'league'),
    (${PLAYED},'Fixes Played League','league',true,'league'),
    (${OLD},'Fixes Old Cup','locked',true,'league')`;
});

after(async () => {
  if (sql) await sql.end();
});

/* ───────────────────────── Correct WhatsApp ───────────────────────── */

test("Correct WhatsApp replaces the number; returning matching follows it", { skip }, async () => {
  const p = await player("Wrong Number Fix");
  await entry(p.id, OLD, "approved");
  // An open number change for this player is cancelled by the correction.
  const [{ id: changeId }] = await sql<{ id: string }[]>`
    insert into contact_change(player_id,tournament_id,route,new_contact_hash,new_contact_cipher,
      from_contact_version,requested_by,expires_at)
    values(${p.id},${OLD},'established_channel',${pd.fingerprint("whatsapp:+919820099999")},
      ${pd.encrypt("+919820099999")},1,${admin.id},now() + interval '1 hour') returning id`;
  await sql`update player set contact_verified_at=now(),
    contact_verification_method='organizer_attested_established_channel' where id=${p.id}`;

  const fresh = "+91 98200 77777";
  const out = await fixes.correctWhatsApp(
    p.id,
    { whatsapp: fresh, reason: "Initial wrong number fix" },
    asAdmin,
  );
  assert.equal(out.ok, true);
  assert.equal(out.xgId, p.code);
  assert.equal(out.contactVersion, 2);
  assert.equal(out.cancelledChanges, 1);
  assert.match(out.masked, /^\+91 •+77$/);

  const [row] = await sql`select contact_hash,contact_cipher,contact_version,contact_verified_at,
      contact_verification_method from player where id=${p.id}`;
  assert.equal(row.contact_hash, pd.fingerprint("whatsapp:+919820077777"));
  assert.equal(pd.decrypt(row.contact_cipher), "+919820077777");
  assert.equal(row.contact_version, 2);
  // A correction is not an organizer attestation.
  assert.equal(row.contact_verified_at, null);
  assert.equal(row.contact_verification_method, null);
  const [change] = await sql`select status,new_contact_cipher,finished_at from contact_change where id=${changeId}`;
  assert.equal(change.status, "cancelled");
  assert.equal(change.new_contact_cipher, "erased");
  assert.ok(change.finished_at);

  // Audit: one row, the reason, versions, and no digits of either number.
  const audit = await auditOf("player.whatsapp_correct", p.id);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].affected, p.code);
  assert.equal(audit[0].actor, admin.id);
  assert.deepEqual(audit[0].before_value, { contact_version: 1, attested: true });
  assert.deepEqual(audit[0].after_value, {
    contact_version: 2,
    attested: false,
    cancelled_changes: 1,
    reason: "Initial wrong number fix",
  });
  const everything = JSON.stringify(
    await sql`select summary,affected,before_value,after_value from audit_event
      where entity in (${p.id}, ${changeId})`,
  );
  for (const digits of ["9820077777", "77777", p.phone.slice(-6), "99999"])
    assert.ok(!everything.includes(digits), `audit leaks ${digits}`);
  assert.equal((await auditOf("contact.change_cancel", changeId)).length, 1);

  // Returning-player matching: the new number is accepted, the old one refused.
  await assert.rejects(
    returning(
      { action: "returning.add", tournament: OPEN, xgId: p.code, teamName: "Night Owls",
        verifiedPhone: p.phone, ...VERIFIED },
      asAdmin,
    ),
    rejects(409, /not the WhatsApp number on file/),
  );
  const added = await returning(
    { action: "returning.add", tournament: OPEN, xgId: p.code, teamName: "Night Owls",
      verifiedPhone: "9820077777", ...VERIFIED },
    asAdmin,
  );
  assert.equal((added as { ok: boolean }).ok, true);
  const [joined] = await sql`select status from application where player_id=${p.id} and tournament_id=${OPEN}`;
  assert.equal(joined.status, "approved");
});

test("Correct WhatsApp: duplicate 409; invalid, unchanged or missing reason 400", { skip }, async () => {
  const p = await player("Fix Target");
  const other = await player("Number Owner");
  await assert.rejects(
    fixes.correctWhatsApp(p.id, { whatsapp: other.phone, reason: "Initial wrong number fix" }, asAdmin),
    rejects(409, new RegExp(`belongs to ${other.code}`)),
  );
  // A number reserved by another player's live change.
  const reservedPhone = "+919820066666";
  await sql`insert into contact_change(player_id,tournament_id,route,new_contact_hash,new_contact_cipher,
      from_contact_version,requested_by,expires_at)
    values(${other.id},${OLD},'established_channel',${pd.fingerprint("whatsapp:" + reservedPhone)},
      ${pd.encrypt(reservedPhone)},1,${admin.id},now() + interval '1 hour')`;
  await assert.rejects(
    fixes.correctWhatsApp(p.id, { whatsapp: reservedPhone, reason: "Initial wrong number fix" }, asAdmin),
    rejects(409, /reserved by an open WhatsApp change/),
  );
  for (const [input, message] of [
    [{ whatsapp: "12345", reason: "Initial wrong number fix" }, /Indian|valid/],
    [{ whatsapp: "98-ab-12", reason: "Initial wrong number fix" }, /digits/],
    [{ whatsapp: p.phone, reason: "Initial wrong number fix" }, /already this player's number/],
    [{ whatsapp: "+919820055555" }, /reason of 3 to 200/],
    [{ whatsapp: "+919820055555", reason: "ok" }, /reason of 3 to 200/],
    [{ whatsapp: "+919820055555", reason: "x".repeat(201) }, /reason of 3 to 200/],
    [{ whatsapp: "+919820055555", reason: "Use 98200 55555 now" }, /phone numbers/],
    [{ whatsapp: "+919820055555", reason: "Fix", extra: 1 }, /./],
  ] as const)
    await assert.rejects(fixes.correctWhatsApp(p.id, input, asAdmin), rejects(400, message));
  const [unchanged] = await sql`select contact_version from player where id=${p.id}`;
  assert.equal(unchanged.contact_version, 1);
  assert.equal((await auditOf("player.whatsapp_correct", p.id)).length, 0);
});

test("Correct WhatsApp: coordinators and non-organizer sessions get 403", { skip }, async () => {
  const p = await player("Guarded Number");
  const input = { whatsapp: "+919820044444", reason: "Initial wrong number fix" };
  await assert.rejects(fixes.correctWhatsApp(p.id, input, asCoordinator), rejects(403));
  await assert.rejects(fixes.correctWhatsApp(p.id, input, signedOut), rejects(403));
  // Not one of the two configured main admins.
  await assert.rejects(
    fixes.correctWhatsApp(p.id, input, async () => ({ ...admin, id: "759756138437809999" })),
    rejects(403),
  );
  // Over HTTP with only a player session cookie: the organizer check refuses it.
  const res = await routes.whatsapp(
    new Request(`${ORIGIN}/api/admin/players/${p.id}/whatsapp`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        cookie: "xg_player_session=forged.token",
      },
      body: JSON.stringify(input),
    }),
    { params: Promise.resolve({ id: p.id }) },
  );
  assert.equal(res.status, 403);
  // The kill switch for number editing applies here too.
  process.env.CONTACT_EDITING = "off";
  try {
    await assert.rejects(fixes.correctWhatsApp(p.id, input, asAdmin), rejects(403, /switched off/));
  } finally {
    process.env.CONTACT_EDITING = "on";
  }
  const [row] = await sql`select contact_version from player where id=${p.id}`;
  assert.equal(row.contact_version, 1);
});

/* ───────────────────────── Remove a rejected entry ───────────────────────── */

test("Remove rejected entry: clears a 0-match rejected entry and logs it", { skip }, async () => {
  const p = await player("Ghost Entry");
  const ghost = await entry(p.id, OLD, "rejected");
  const live = await entry(p.id, OPEN, "approved");
  const before = await details(OPEN, p.id, asAdmin);
  assert.deepEqual(
    before.entries.map((e) => [e.id, e.status, e.matches]),
    [[ghost, "rejected", 0], [live, "approved", 0]],
  );
  assert.equal(before.canEdit.clearRejected, true);
  assert.equal(before.canEdit.correctWhatsApp, true);

  const out = await fixes.clearRejectedEntry(p.id, ghost, { reason: "Old registration on a reserved ID" }, asAdmin);
  assert.deepEqual(out, { ok: true, xgId: p.code, tournament: OLD });
  const [row] = await sql`select status,deleted_at from application where id=${ghost}`;
  assert.equal(row.status, "rejected");
  assert.ok(row.deleted_at);
  const audit = await auditOf("application.clear_rejected", ghost);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].affected, p.code);
  assert.deepEqual(audit[0].after_value, {
    status: "rejected",
    removed: true,
    player_id: p.id,
    reason: "Old registration on a reserved ID",
  });
  // Gone from the drawer; the other entry stays.
  const afterwards = await details(OPEN, p.id, asAdmin);
  assert.deepEqual(afterwards.entries.map((e) => e.id), [live]);
  await assert.rejects(
    fixes.clearRejectedEntry(p.id, ghost, { reason: "Again" }, asAdmin),
    rejects(409, /already removed/),
  );
});

test("Remove rejected entry: approved, pending or played entries stay (409)", { skip }, async () => {
  const p = await player("Kept Entries");
  const opponent = await player("Opponent");
  const approved = await entry(p.id, OLD, "approved");
  const pending = await entry(p.id, OPEN, "pending");
  const played = await entry(p.id, PLAYED, "rejected");
  await entry(opponent.id, PLAYED, "approved");
  await sql`insert into fixture(tournament_id,stage,round,home,away,home_score,away_score)
    values(${PLAYED},'league',1,${p.id},${opponent.id},1,0)`;
  const reason = { reason: "Cleaning up" };
  await assert.rejects(fixes.clearRejectedEntry(p.id, approved, reason, asAdmin), rejects(409, /approved/));
  await assert.rejects(fixes.clearRejectedEntry(p.id, pending, reason, asAdmin), rejects(409, /pending/));
  await assert.rejects(fixes.clearRejectedEntry(p.id, played, reason, asAdmin), rejects(409, /matches/));
  // Another player's entry, and a missing reason.
  await assert.rejects(fixes.clearRejectedEntry(opponent.id, played, reason, asAdmin), rejects(404));
  await assert.rejects(fixes.clearRejectedEntry(p.id, played, {}, asAdmin), rejects(400));
  const details2 = await details(PLAYED, p.id, asAdmin);
  assert.equal(details2.entries.find((e) => e.id === played)?.matches, 1);
  const rows = await sql`select deleted_at from application where id in (${approved},${pending},${played})`;
  assert.ok(rows.every((r) => r.deleted_at === null));
});

test("Remove rejected entry: non-main-admins get 403", { skip }, async () => {
  const p = await player("Guarded Entry");
  const ghost = await entry(p.id, OLD, "rejected");
  const reason = { reason: "Old registration" };
  await assert.rejects(fixes.clearRejectedEntry(p.id, ghost, reason, asCoordinator), rejects(403));
  await assert.rejects(fixes.clearRejectedEntry(p.id, ghost, reason, signedOut), rejects(403));
  const coordinatorView = await details(OLD, p.id, asCoordinator).catch(() => null);
  assert.equal(coordinatorView?.canEdit.clearRejected ?? false, false);
  const res = await routes.clear(
    new Request(`${ORIGIN}/api/admin/players/${p.id}/rejected-entries/${ghost}`, {
      method: "DELETE",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        cookie: "xg_player_session=forged.token",
      },
      body: JSON.stringify(reason),
    }),
    { params: Promise.resolve({ id: p.id, entryId: ghost }) },
  );
  assert.equal(res.status, 403);
  const [row] = await sql`select deleted_at from application where id=${ghost}`;
  assert.equal(row.deleted_at, null);
});

test("a cleared rejected entry is gone from the Player Hub, public profile and OM", { skip }, async () => {
  const { hubData } = await import("../src/lib/player-account");
  const { getProfile } = await import("../src/lib/profile");
  const { snapshot } = await import("../src/lib/control");
  const p = await player("Hub Visibility");
  const ghost = await entry(p.id, OLD, "rejected");
  await entry(p.id, OPEN, "approved");
  const [hubPlayer] = await sql<import("../src/lib/player-account").HubPlayer[]>`
    select id,public_no,gaming_name,team_name,display_nickname,nickname_locked,efootball_cipher
    from player where id=${p.id}`;
  const inOld = async () => (await snapshot(OLD, asAdmin)).applications.some((a) => a.player_id === p.id);

  // Before: the hub and OM list the rejected entry; the public profile never does.
  assert.deepEqual((await hubData(hubPlayer)).entries.map((e) => [e.tournamentId, e.status]).sort(), [
    [OLD, "rejected"],
    [OPEN, "approved"],
  ]);
  assert.equal(await inOld(), true);
  const profileBefore = await getProfile(p.code);
  assert.ok(profileBefore);
  assert.ok(!JSON.stringify(profileBefore).includes("Fixes Old Cup"));

  await fixes.clearRejectedEntry(p.id, ghost, { reason: "Old registration" }, asAdmin);

  // After: gone from the hub's entries, OM's tournament roster and the drawer.
  const hub = await hubData(hubPlayer);
  assert.deepEqual(hub.entries.map((e) => [e.tournamentId, e.status]), [[OPEN, "approved"]]);
  assert.ok(!JSON.stringify(hub).includes("Fixes Old Cup"));
  assert.equal(await inOld(), false);
  assert.deepEqual((await details(OPEN, p.id, asAdmin)).entries.map((e) => e.tournament), [OPEN]);
  // The public profile and its counts are unchanged.
  const profileAfter = await getProfile(p.code);
  assert.deepEqual(profileAfter?.totals, profileBefore.totals);
  assert.ok(!JSON.stringify(profileAfter).includes("Fixes Old Cup"));
});

test("Remove rejected entry: a podium place counts as playing (409)", { skip }, async () => {
  const p = await player("Podium Rejected");
  const ghost = await entry(p.id, OLD, "rejected");
  await sql`insert into podium(tournament_id,place,player_id) values(${OLD},3,${p.id})`;
  await assert.rejects(
    fixes.clearRejectedEntry(p.id, ghost, { reason: "Old registration" }, asAdmin),
    rejects(409, /matches/),
  );
  await sql`delete from podium where tournament_id=${OLD} and player_id=${p.id}`;
});
