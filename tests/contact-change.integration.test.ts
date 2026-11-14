/**
 * WhatsApp number editing and disclosure (plan revision 2): W-* tests against a real
 * PostgreSQL server (PostgreSQL 18 in CI). Uses its OWN disposable database next to
 * TEST_DATABASE_URL (name + "_contacts"); local servers only (same guard).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { isLocalTestDatabase, testDatabaseUrl } from "./helpers/test-database";

// W-L1: capture every console line written while these tests run.
const logs: string[] = [];
for (const m of ["log", "info", "warn", "error", "debug"] as const)
  console[m] = (...args: unknown[]) => {
    logs.push(
      args.map((a) => (a instanceof Error ? a.stack : String(a))).join(" "),
    );
  };

const A = { id: "759756138437804042", role: "admin" as const, name: "David" };
const B = { id: "759756138437804043", role: "admin" as const, name: "Ben" };
const ADMINS = `${A.id},${B.id}`;
const base = testDatabaseUrl();
const skip = !base && "TEST_DATABASE_URL not set";
let dbName = "";
if (base) {
  const u = new URL(base);
  dbName = `${u.pathname.slice(1)}_contacts`;
  if (!/^[a-z0-9_]{1,50}$/.test(dbName))
    throw new Error("Unexpected test database name.");
  u.pathname = `/${dbName}`;
  if (!isLocalTestDatabase(u.toString()))
    throw new Error("Not a local test database.");
  process.env.DATABASE_URL = u.toString();
  process.env.PRIVATE_DATA_KEY = "a1".repeat(32);
  process.env.REGISTRATION_ENABLED = "true";
  process.env.APP_ORIGIN = "http://localhost:3000";
  process.env.MAIN_ADMIN_DISCORD_IDS = ADMINS;
  process.env.CONTACT_EDITING = "on";
  delete process.env.TEAM_DISPLAY;
}

type CC = typeof import("../src/lib/contact-change");
type Who = Parameters<CC["runContact"]>[0] &
  Partial<
    Pick<import("../src/lib/access").Actor, "operations" | "tournaments">
  >;
let cc: CC;
let control: typeof import("../src/lib/control");
let details: typeof import("../src/lib/player-details");
let register: typeof import("../src/lib/registration").register;
let registrationInput: typeof import("../src/lib/registration").registrationInput;
let pd: typeof import("../src/lib/private-data");
let sql: ReturnType<typeof import("../src/lib/db").db>;

const coordAll: Who = {
  id: "222222222222222222",
  role: "coordinator",
  name: "Coord",
  operations: ["registrations"],
  tournaments: ["*"],
};
let coordW: Who; // registrations, scoped to the Open Cup only
const coordResults: Who = {
  ...coordAll,
  id: "222222222222222224",
  operations: ["results"],
};
const strangerAdmin: Who = {
  id: "333333333333333333",
  role: "admin",
  name: "Not configured",
};

const as = (u: Who) => async () => ({ operations: [], tournaments: [], ...u });
/** Every response and error, for the leak scan (W-L1). */
const seen: { action: string; out?: unknown; error?: string }[] = [];
async function send(u: Who, c: Record<string, unknown>) {
  try {
    const out = await cc.executeContact(
      { requestId: randomUUID(), ...c },
      as(u),
    );
    seen.push({ action: String(c.action), out });
    return out as Record<string, unknown>;
  } catch (e) {
    seen.push({ action: String(c.action), error: (e as Error).message });
    throw e;
  }
}
const status = (code: number, message?: RegExp) => (e: unknown) => {
  const err = e as { status?: number; message: string };
  assert.equal(err.status, code, err.message);
  if (message) assert.match(err.message, message);
  return true;
};
const auditCount = async () =>
  (await sql`select count(*)::int n from audit_event`)[0].n as number;
const resetLimits = () => sql`delete from rate_limit`;
/** Registration exactly as the API route does it: registrationInput first, then register(). */
const reg = (
  f: {
    playerName: string;
    teamName: string;
    phone: string;
    tournament: string;
  },
  ip: string,
) =>
  register(registrationInput.parse({ ...f, consent: true, website: "" }), ip);

let H = ""; // "Number Cup": completed, with results and a podium
let W = ""; // "Open Cup": registration open
type P = { id: string; code: string; phone: string };
const ply: Record<string, P> = {};
let baseline: Record<string, unknown>;
let firstAudit = 0;
let auditBefore = "";

const evidence = (extra: Record<string, unknown> = {}) => ({
  route: "independent_evidence",
  evidenceType: "known_person_live_video",
  evidenceNote:
    "Live video call with the player; both organizers recognised him",
  evidenceObservedAt: new Date(Date.now() - 3600_000).toISOString(),
  ...extra,
});
const start = (
  u: Who,
  p: P,
  newPhone: string,
  extra: Record<string, unknown> = {},
  t = H,
) =>
  send(u, {
    action: "contact.change_start",
    tournament: t,
    playerId: p.id,
    expectedContactVersion: 1,
    newPhone,
    route: "established_channel",
    confirm: true,
    reason: "Player changed phone",
    ...extra,
  });
const code = (
  u: Who,
  changeId: string,
  value: string,
  extra: Record<string, unknown> = {},
  t = H,
) =>
  send(u, {
    action: "contact.change_code",
    tournament: t,
    changeId,
    code: value,
    attest: true,
    ...extra,
  });
const approve = (u: Who, changeId: string, t = H) =>
  send(u, {
    action: "contact.change_approve",
    tournament: t,
    changeId,
    reviewed: true,
    reason: "Evidence reviewed by the second admin",
  });
const cancel = (u: Who, changeId: string, t = H) =>
  send(u, {
    action: "contact.change_cancel",
    tournament: t,
    changeId,
    reason: "Not needed any more",
  });
const version = async (p: P) =>
  (await sql`select contact_version from player where id=${p.id}`)[0]
    .contact_version as number;
const hashOf = (phone: string) => pd.fingerprint("whatsapp:" + phone);

async function fingerprints() {
  const [f] = await sql`select
    (select md5(string_agg(id::text||':'||public_no, ',' order by id)) from player where id = any(${Object.values(ply).map((p) => p.id)})) as identities,
    (select md5(string_agg(id::text||':'||tournament_id||':'||player_id||':'||status||':'||coalesce(deleted_at::text,'-'), ',' order by id)) from application where tournament_id=${H}) as entries,
    (select md5(string_agg(id::text||':'||round||':'||home||':'||coalesce(away::text,'-')||':'||coalesce(home_score::text,'-')||':'||coalesce(away_score::text,'-')||':'||revision, ',' order by id)) from fixture) as fixtures,
    (select md5(coalesce(string_agg(tournament_id||':'||player_id||':'||rank, ','),'')) from qualification) as qualification,
    (select md5(string_agg(tournament_id||':'||place||':'||player_id, ',' order by tournament_id, place)) from podium) as podium`;
  const { getTournament } = await import("../src/lib/tournaments");
  const t = await getTournament(H);
  if (!t)
    throw new Error(`Tournament unavailable: ${logs.slice(-5).join(" | ")}`);
  const table = t.standings.map((r) => [r.id, r.pts, r.gd, r.played]);
  return { ...f, table };
}

before(async () => {
  if (!base) return;
  const admin = postgres(base, { ssl: false, max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists "${dbName}" with (force)`);
  await admin.unsafe(`create database "${dbName}"`);
  await admin.end();
  cc = await import("../src/lib/contact-change");
  control = await import("../src/lib/control");
  details = await import("../src/lib/player-details");
  ({ register, registrationInput } = await import("../src/lib/registration"));
  pd = await import("../src/lib/private-data");
  sql = (await import("../src/lib/db")).db();
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort())
    await sql.unsafe(await readFile(new URL(f, dir), "utf8"));

  const cmd = (c: Record<string, unknown>) =>
    control.run(A, c as Parameters<typeof control.run>[1]);
  const create = async (name: string) =>
    (
      (await cmd({
        action: "create",
        name,
        format: "league",
        season: null,
        published: true,
      })) as { id: string }
    ).id;
  H = await create("Number Cup");
  W = await create("Open Cup");
  coordW = { ...coordAll, id: "222222222222222223", tournaments: [W] };
  for (const coordinator of [coordAll, coordW, coordResults])
    await sql`insert into coordinator(discord_id,operations,tournaments)
      values(${coordinator.id},${coordinator.operations!},${coordinator.tournaments!})`;
  await cmd({ action: "registration", tournament: H, open: true });
  await cmd({ action: "registration", tournament: W, open: true });
  const join = async (
    key: string,
    name: string,
    phone: string,
    t: string,
    ip: string,
  ) => {
    const r = await reg(
      { playerName: name, teamName: `${name} FC`, phone, tournament: t },
      ip,
    );
    ply[key] = { id: r.playerId, code: r.code, phone: `+91${phone}` };
  };
  for (const [i, [key, name]] of [
    ["ann", "Ann"],
    ["ben", "Ben"],
    ["cal", "Cal"],
    ["eve", "Eve"],
  ].entries())
    await join(key, name, `981110000${i === 3 ? 5 : i + 1}`, H, `10.1.0.${i}`);
  // Dee has no fixtures (a removed player who played would break the public table; see the report).
  await join("dee", "Dee", "9811100004", W, "10.1.0.9");
  for (let i = 0; i < 7; i++)
    await join(`w${i}`, `Wplayer${i}`, `982220000${i}`, W, `10.2.0.${i}`);
  const apps =
    await sql`select id,revision from application where tournament_id=${H}`;
  await cmd({
    action: "review",
    tournament: H,
    status: "approved",
    verified: true,
    items: apps.map((a) => ({ id: a.id, revision: a.revision })),
  });
  await cmd({
    action: "efootball",
    tournament: H,
    playerId: ply.ann.id,
    efootballId: "ANN-0001",
  });
  await cmd({ action: "registration", tournament: H, open: false });
  await cmd({ action: "generate", tournament: H, shuffle: false });
  const order = ["ann", "ben", "cal", "eve"].map((k) => ply[k].id);
  for (const f of await sql`select * from fixture where tournament_id=${H}`)
    await cmd({
      action: "score",
      tournament: H,
      id: f.id,
      revision: f.revision,
      homeScore: order.indexOf(f.home) < order.indexOf(f.away) ? 3 : 0,
      awayScore: order.indexOf(f.home) < order.indexOf(f.away) ? 0 : 3,
    });
  await cmd({ action: "complete", tournament: H, podium: order.slice(0, 3) });
  // Dee's record is removed (soft delete): her number stays reserved.
  await sql`update player set deleted_at=now() where id=${ply.dee.id}`;

  baseline = await fingerprints();
  firstAudit =
    ((await sql`select max(id)::int m from audit_event`)[0].m as number) + 1;
  auditBefore = (
    await sql`select md5(string_agg(id||actor||action||entity||coalesce(before_value::text,'')||coalesce(after_value::text,'')||created_at, ',' order by id)) h from audit_event`
  )[0].h;
});
after(async () => {
  if (base) await sql.end();
});

/* ─────────────────────────── Authorization ─────────────────────────── */

test(
  "W-A1 and W-A3: only configured main admins may change numbers; strict schemas reject extra fields",
  { skip },
  async () => {
    const n = await auditCount();
    for (const who of [coordAll, coordResults, strangerAdmin])
      await assert.rejects(
        start(who, ply.ann, "+44 7911 123456", evidence()),
        status(403),
      );
    for (const extra of [
      { publicNo: 1 },
      { contact_version: 2 },
      { contactHash: "x" },
      { status: "completed" },
      { playerCode: "XG-0001" },
    ])
      await assert.rejects(
        start(A, ply.ann, "+44 7911 123456", evidence(extra)),
        status(400),
      );
    await assert.rejects(
      start(A, ply.ann, "+44 7911 123456", evidence({ route: "discord" })),
      status(400),
    );
    assert.equal(await auditCount(), n);
  },
);

test(
  "W-A2: with CONTACT_EDITING off, every change command is refused; disclosure still works",
  { skip },
  async () => {
    for (const value of [undefined, "true", "ON", "1"]) {
      if (value === undefined) delete process.env.CONTACT_EDITING;
      else process.env.CONTACT_EDITING = value;
      const id = randomUUID();
      await assert.rejects(
        start(A, ply.ann, "+44 7911 123456", evidence()),
        status(403, /switched off/),
      );
      await assert.rejects(code(A, id, "123456"), status(403, /switched off/));
      await assert.rejects(approve(B, id), status(403, /switched off/));
      await assert.rejects(cancel(A, id), status(403, /switched off/));
      await assert.rejects(
        send(A, {
          action: "contact.change_resend",
          tournament: H,
          changeId: id,
        }),
        status(403, /switched off/),
      );
    }
    const d = await send(A, {
      action: "contact.disclose",
      tournament: H,
      playerId: ply.ben.id,
      purpose: "admin_review",
    });
    assert.equal(d.phone, ply.ben.phone);
    process.env.CONTACT_EDITING = "on";
  },
);

/* ─────────────────────────── Masking and disclosure ─────────────────────────── */

test(
  "W-V1: OM snapshot and player details are masked on the server; no full number or wa.me link anywhere",
  { skip },
  async () => {
    for (const who of [A, coordAll]) {
      const snap = await control.snapshot(H, as(who));
      const json = JSON.stringify(snap);
      for (const a of snap.applications)
        assert.match(
          String((a as { contact?: string }).contact),
          /^\+91 •{8}\d{2}$/,
        );
      for (const p of Object.values(ply))
        assert.ok(!json.includes(p.phone.slice(3)), "no full number");
      assert.doesNotMatch(json, /wa\.me|contact_cipher|contact_hash/);
      const view = await details.playerDetails(H, ply.ann.id, as(who));
      assert.match(view.contact!.masked, /^\+91 •{8}01$/);
      assert.doesNotMatch(JSON.stringify(view), /9811100001|wa\.me|cipher/);
    }
    const results = await control.snapshot(H, as(coordResults)).catch((e) => e);
    assert.ok(
      results instanceof Error || !JSON.stringify(results).includes("•"),
      "results coordinators get no contact",
    );
  },
);

test(
  "W-V2: disclosure is scoped by role, tournament and purpose, and audited without the number",
  { skip },
  async () => {
    const n = await auditCount();
    const d = (who: Who, p: P, purpose: string, t = H) =>
      send(who, {
        action: "contact.disclose",
        tournament: t,
        playerId: p.id,
        purpose,
      });
    const out = await d(A, ply.cal, "admin_review");
    assert.equal(out.phone, ply.cal.phone);
    assert.equal(out.waUrl, `https://wa.me/${ply.cal.phone.slice(1)}`);
    assert.equal(
      (await d(coordW, ply.w0, "registration_check", W)).phone,
      ply.w0.phone,
    );
    await assert.rejects(d(coordW, ply.cal, "registration_check"), status(403)); // other tournament
    await assert.rejects(d(coordW, ply.w0, "admin_review", W), status(403)); // purpose not allowed
    await assert.rejects(d(coordW, ply.w0, "contact_change", W), status(403));
    await assert.rejects(
      d(coordResults, ply.cal, "registration_check"),
      status(403),
    );
    await assert.rejects(d(A, ply.w0, "admin_review"), status(404)); // not in this tournament
    await assert.rejects(d(A, ply.dee, "admin_review"), status(404)); // removed player
    await assert.rejects(d(A, ply.cal, "curiosity"), status(400));
    const rows =
      await sql`select * from audit_event where id > ${firstAudit - 1} and action='contact.disclose' order by id desc limit 2`;
    assert.equal(await auditCount(), n + 2);
    for (const r of rows) {
      assert.match(r.after_value.purpose, /admin_review|registration_check/);
      assert.match(r.affected, /^XG-\d{4}$/);
      assert.doesNotMatch(JSON.stringify(r), /98111|98222|\+91/);
    }
  },
);

test(
  "W-V3: disclosure rate limits: 5 per player and 30 per admin per hour",
  { skip },
  async () => {
    await resetLimits();
    const d = (p: P, t = W) =>
      send(B, {
        action: "contact.disclose",
        tournament: t,
        playerId: p.id,
        purpose: "tournament_coordination",
      });
    for (let i = 0; i < 5; i++) await d(ply.w1);
    await assert.rejects(d(ply.w1), status(429));
    // 5 + 25 more across other players = 30; the 31st is refused.
    for (const k of ["w2", "w3", "w4", "w5", "w6"])
      for (let i = 0; i < 5; i++) await d(ply[k]);
    await assert.rejects(d(ply.w0), status(429));
    await resetLimits();
  },
);

/* ─────────────────────────── Routes ─────────────────────────── */

test(
  "W-R1a and W-R1b: legacy numbers can't use the established-channel route; Discord is never a route",
  { skip },
  async () => {
    const n = await auditCount();
    await assert.rejects(
      start(A, ply.ben, "+44 7911 123456"),
      status(409, /never organizer-attested/),
    );
    await assert.rejects(
      start(A, ply.ben, "+44 7911 123456", { route: "discord" }),
      status(400),
    );
    await assert.rejects(
      start(A, ply.ben, "+44 7911 123456", { evidenceNote: "x".repeat(30) }),
      status(409),
    );
    assert.equal(await auditCount(), n);
  },
);

test(
  "W-R2a and W-L2: evidence is required and checked; no phone numbers in free text",
  { skip },
  async () => {
    const n = await auditCount();
    await assert.rejects(
      start(A, ply.ben, "+44 7911 123456", { route: "independent_evidence" }),
      status(400),
    );
    await assert.rejects(
      start(
        A,
        ply.ben,
        "+44 7911 123456",
        evidence({
          evidenceType: "efootball_possession",
          evidenceObservedAt: undefined,
        }),
      ),
      status(409, /no eFootball ID/),
    );
    await assert.rejects(
      start(
        A,
        ply.ben,
        "+44 7911 123456",
        evidence({ evidenceObservedAt: undefined }),
      ),
      status(400, /when you saw/),
    );
    await assert.rejects(
      start(
        A,
        ply.ben,
        "+44 7911 123456",
        evidence({
          evidenceObservedAt: new Date(
            Date.now() - 8 * 86_400_000,
          ).toISOString(),
        }),
      ),
      status(400),
    );
    await assert.rejects(
      start(
        A,
        ply.ben,
        "+44 7911 123456",
        evidence({
          evidenceObservedAt: new Date(Date.now() + 3600_000).toISOString(),
        }),
      ),
      status(400),
    );
    await assert.rejects(
      start(
        A,
        ply.ben,
        "+44 7911 123456",
        evidence({ evidenceNote: "too short" }),
      ),
      status(400),
    );
    for (const leak of [
      "Called him on 98111 00002 to confirm it",
      "Old number +91 was unreachable today",
      "Player said 981-110-0002 is dead",
    ])
      await assert.rejects(
        start(A, ply.ben, "+44 7911 123456", evidence({ evidenceNote: leak })),
        status(400, /phone numbers/),
      );
    await assert.rejects(
      start(
        A,
        ply.ben,
        "+44 7911 123456",
        evidence({ reason: "New number +447911123456" }),
      ),
      status(400, /phone numbers/),
    );
    for (const bad of ["0091 98333 00001", "98333abc00001", "+44 20 7946 0958"])
      await assert.rejects(start(A, ply.ben, bad, evidence()), status(400));
    assert.equal(await auditCount(), n);
  },
);

let annChange = "";
test(
  "W-R2b, W-R2c, W-R2d and W-R2e: eFootball-possession evidence, code from the new number, then a second, different main admin",
  { skip },
  async () => {
    const s = await start(
      A,
      ply.ann,
      "+44 7911 123456",
      evidence({
        evidenceType: "efootball_possession",
        evidenceObservedAt: undefined,
      }),
    );
    annChange = String(s.changeId);
    assert.match(String(s.code), /^\d{6}$/);
    assert.match(String(s.challenge), /^[A-Z2-9]{6}$/);
    assert.equal(s.newNumber, "+44 ••••••••56");
    assert.match(String(s.sendUrl), /^https:\/\/wa\.me\/447911123456\?text=/);
    // A selected evidence type proves nothing: the challenge and the right account must match.
    await assert.rejects(
      code(A, annChange, String(s.code)),
      status(400, /eFootball ID/),
    );
    await assert.rejects(
      code(A, annChange, String(s.code), {
        efootballId: "ANN-0001",
        challenge: "ZZZZZZ",
      }),
      status(409, /4 attempts left/),
    );
    await assert.rejects(
      code(A, annChange, String(s.code), {
        efootballId: "OTHER-0001",
        challenge: String(s.challenge),
      }),
      status(409, /3 attempts left/),
    );
    const before = (
      await sql`select contact_hash,contact_cipher,contact_version,contact_verified_at from player where id=${ply.ann.id}`
    )[0];
    const ok = await code(A, annChange, String(s.code), {
      efootballId: "ann-0001",
      challenge: String(s.challenge).toLowerCase(),
    });
    assert.equal(ok.status, "awaiting_second_admin");
    // W-R2b: nothing on the player row has changed yet.
    assert.deepEqual(
      (
        await sql`select contact_hash,contact_cipher,contact_version,contact_verified_at from player where id=${ply.ann.id}`
      )[0],
      before,
    );
    // W-R2c: the requester can't approve, and the database refuses it too.
    await assert.rejects(
      approve(A, annChange),
      status(403, /second, different/),
    );
    await assert.rejects(
      sql`update contact_change set approved_by=requested_by where id=${annChange}`,
      /check/,
    );
    // W-R2d: the requester is no longer a configured main admin.
    process.env.MAIN_ADMIN_DISCORD_IDS = `${B.id},759756138437804044`;
    await assert.rejects(
      approve(B, annChange),
      status(409, /no longer a main admin/),
    );
    process.env.MAIN_ADMIN_DISCORD_IDS = ADMINS;
    // W-R2e: a different, current main admin approves.
    const done = await approve(B, annChange);
    assert.equal(done.status, "completed");
    const p = (await sql`select * from player where id=${ply.ann.id}`)[0];
    assert.equal(p.contact_hash, hashOf("+447911123456"));
    assert.equal(pd.decrypt(p.contact_cipher), "+447911123456");
    assert.equal(p.contact_version, 2);
    assert.equal(
      p.contact_verification_method,
      "organizer_attested_independent_evidence",
    );
    assert.ok(p.contact_verified_at);
    const ch = (
      await sql`select * from contact_change where id=${annChange}`
    )[0];
    assert.equal(ch.status, "completed");
    assert.equal(ch.approved_by, B.id);
    assert.equal(ch.new_contact_cipher, "erased");
    assert.equal(ch.code_hash, null);
    assert.equal(ch.challenge_hash, null);
    assert.ok(ch.challenge_confirmed_at);
    const audit = (
      await sql`select * from audit_event where entity=${annChange} and action='contact.change_approve'`
    )[0];
    assert.equal(audit.actor, B.id);
    assert.equal(audit.after_value.requested_by, A.id);
    assert.equal(
      audit.after_value.method,
      "organizer_attested_independent_evidence",
    );
    ply.ann.phone = "+447911123456";
  },
);

test(
  "W-R1c, W-P2 and W-X1: established-channel change on an attested number (one admin)",
  { skip },
  async () => {
    const row = async () => {
      const [p] = await sql`select * from player where id=${ply.ann.id}`;
      const {
        contact_hash: _h,
        contact_cipher: _c,
        contact_version: _v,
        contact_verified_at: _a,
        contact_verification_method: _m,
        ...rest
      } = p;
      return rest;
    };
    const before = await row();
    const s = await start(B, ply.ann, "9833300001", {
      expectedContactVersion: 2,
    });
    const done = await code(B, String(s.changeId), String(s.code));
    assert.equal(done.status, "completed");
    assert.equal(
      (
        await sql`select status from contact_change where id=${String(s.changeId)}`
      )[0].status,
      "completed",
    );
    const [p] = await sql`select * from player where id=${ply.ann.id}`;
    assert.equal(p.contact_hash, hashOf("+919833300001"));
    assert.equal(p.contact_version, 3);
    assert.equal(
      p.contact_verification_method,
      "organizer_attested_established_channel",
    );
    // W-P2: nothing else on the row changed.
    assert.deepEqual(await row(), before);
    // W-X1: other edits never change the contact version.
    await details.runEdit(
      { ...A },
      {
        action: "player.edit_team",
        tournament: H,
        playerId: ply.ann.id,
        expected: "Ann FC",
        team: "Ann United",
        reason: "Team renamed",
        requestId: randomUUID(),
      },
    );
    assert.equal(await version(ply.ann), 3);
    ply.ann.phone = "+919833300001";
  },
);

test(
  "W-K2 and W-X2: a stale contact_version is refused at start and at completion",
  { skip },
  async () => {
    await assert.rejects(
      start(A, ply.ann, "9833300002", { expectedContactVersion: 2 }),
      status(409, /someone else/),
    );
    const s = await start(A, ply.ann, "9833300002", {
      expectedContactVersion: 3,
    });
    await sql`update player set contact_version=4 where id=${ply.ann.id}`; // simulates a concurrent change
    await assert.rejects(
      code(A, String(s.changeId), String(s.code)),
      status(409, /someone else/),
    );
    await sql`update player set contact_version=3 where id=${ply.ann.id}`;
    await cancel(A, String(s.changeId));
    assert.equal(
      (await sql`select contact_hash from player where id=${ply.ann.id}`)[0]
        .contact_hash,
      hashOf("+919833300001"),
    );
  },
);

test(
  "W-R2f: an independent-evidence change not approved within 72 hours expires and is erased",
  { skip },
  async () => {
    const s = await start(A, ply.ben, "+44 7911 123457", evidence());
    assert.equal(
      (await code(A, String(s.changeId), String(s.code))).status,
      "awaiting_second_admin",
    );
    const [ch] =
      await sql`select approve_by, code_checked_at from contact_change where id=${String(s.changeId)}`;
    const hours =
      (new Date(ch.approve_by).getTime() -
        new Date(ch.code_checked_at).getTime()) /
      3600_000;
    assert.ok(Math.abs(hours - 72) < 0.01, `approval window ${hours} h`);
    await sql`update contact_change set approve_by=now() - interval '1 second' where id=${String(s.changeId)}`; // time passes
    await assert.rejects(
      approve(B, String(s.changeId)),
      status(409, /expired/),
    );
    const [after] =
      await sql`select status,new_contact_cipher,new_contact_hash from contact_change where id=${String(s.changeId)}`;
    assert.equal(after.status, "expired");
    assert.equal(after.new_contact_cipher, "erased");
    assert.match(after.new_contact_hash, /^erased:/);
    await assert.rejects(
      approve(B, String(s.changeId)),
      status(409, /already ended/),
    );
    assert.equal(await version(ply.ben), 1);
  },
);

test(
  "W-R3: admins can cancel; the second admin can reject with an audit record and no player change",
  { skip },
  async () => {
    const s = await start(A, ply.cal, "+44 7911 123458", evidence());
    await cancel(B, String(s.changeId));
    const [ch] =
      await sql`select status,new_contact_cipher,code_hash from contact_change where id=${String(s.changeId)}`;
    assert.deepEqual(
      { ...ch },
      { status: "cancelled", new_contact_cipher: "erased", code_hash: null },
    );
    assert.equal(await version(ply.cal), 1);

    const before = (
      await sql`select to_jsonb(player) as row from player where id=${ply.cal.id}`
    )[0].row;
    const review = await start(A, ply.cal, "+44 7911 123588", evidence());
    const changeId = String(review.changeId);
    const rejection = {
      action: "contact.change_reject",
      tournament: H,
      changeId,
      requestId: randomUUID(),
      reason: "Supporting evidence was insufficient",
    };
    await assert.rejects(send(B, rejection), status(409, /waiting for review/));
    await code(A, changeId, String(review.code));
    await assert.rejects(send(A, rejection), status(403));
    await assert.rejects(send(coordAll, rejection), status(403));
    await assert.rejects(send(strangerAdmin, rejection), status(403));
    await assert.rejects(send(B, { ...rejection, reason: "No" }), status(400));
    try {
      process.env.MAIN_ADMIN_DISCORD_IDS = `${B.id},759756138437804044`;
      await assert.rejects(
        send(B, rejection),
        status(409, /no longer a main admin/),
      );
    } finally {
      process.env.MAIN_ADMIN_DISCORD_IDS = ADMINS;
    }
    assert.equal((await send(B, rejection)).status, "rejected");
    assert.equal((await send(B, rejection)).repeated, true);
    await assert.rejects(approve(B, changeId), status(409, /already ended/));
    assert.deepEqual(
      (
        await sql`select to_jsonb(player) as row from player where id=${ply.cal.id}`
      )[0].row,
      before,
    );
    const [closed] =
      await sql`select status,new_contact_hash,new_contact_cipher,
      code_hash,challenge_hash,approved_by,finished_at from contact_change where id=${changeId}`;
    assert.equal(closed.status, "cancelled");
    assert.equal(closed.new_contact_hash, `erased:${changeId}`);
    assert.equal(closed.new_contact_cipher, "erased");
    assert.equal(closed.code_hash, null);
    assert.equal(closed.challenge_hash, null);
    assert.equal(closed.approved_by, null);
    assert.ok(closed.finished_at);
    const decisions = await sql`select action,actor,after_value from audit_event
      where entity=${changeId} and action in ('contact.change_approve','contact.change_reject')`;
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].action, "contact.change_reject");
    assert.equal(decisions[0].actor, B.id);
    assert.deepEqual(decisions[0].after_value, {
      request_id: rejection.requestId,
      change_id: changeId,
      outcome: "rejected",
      requested_by: A.id,
      reason: rejection.reason,
    });
  },
);

/* ─────────────────────────── Code limits and rate limits ─────────────────────────── */

test(
  "W-C1: five wrong codes close the change; parallel guessing never exceeds five",
  { skip },
  async () => {
    await resetLimits();
    const s = await start(A, ply.cal, "+44 7911 123459", evidence());
    const wrong = String((Number(s.code) + 1) % 1_000_000).padStart(6, "0");
    for (let i = 4; i >= 1; i--)
      await assert.rejects(
        code(A, String(s.changeId), wrong),
        status(409, new RegExp(`${i} attempt`)),
      );
    await assert.rejects(
      code(A, String(s.changeId), wrong),
      status(409, /closed after 5/),
    );
    await assert.rejects(
      code(A, String(s.changeId), String(s.code)),
      status(409, /already ended/),
    );
    const s2 = await start(A, ply.cal, "+44 7911 123460", evidence());
    const w2 = String((Number(s2.code) + 7) % 1_000_000).padStart(6, "0");
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => code(A, String(s2.changeId), w2)),
    );
    assert.ok(results.every((r) => r.status === "rejected"));
    const [ch] =
      await sql`select attempts,status from contact_change where id=${String(s2.changeId)}`;
    assert.deepEqual({ ...ch }, { attempts: 5, status: "failed" });
    assert.equal(await version(ply.cal), 1);
  },
);

test(
  "W-C2 and W-C3: expired, replaced and foreign codes are refused; resends are capped and don't reset anything",
  { skip },
  async () => {
    await resetLimits();
    const s = await start(A, ply.eve, "+44 7911 123461", evidence());
    const other = await start(A, ply.cal, "+44 7911 123462", evidence());
    await assert.rejects(
      code(A, String(s.changeId), String(other.code)),
      status(409, /Wrong code/),
    ); // attempt 1
    await sql`update contact_change set code_expires_at=now() - interval '1 second' where id=${String(s.changeId)}`;
    await assert.rejects(
      code(A, String(s.changeId), String(s.code)),
      status(409, /code expired/),
    );
    const [before] =
      await sql`select expires_at,attempts from contact_change where id=${String(s.changeId)}`;
    const r1 = await send(A, {
      action: "contact.change_resend",
      tournament: H,
      changeId: s.changeId,
    });
    const r2 = await send(A, {
      action: "contact.change_resend",
      tournament: H,
      changeId: s.changeId,
    });
    await assert.rejects(
      send(A, {
        action: "contact.change_resend",
        tournament: H,
        changeId: s.changeId,
      }),
      status(429),
    );
    const [now] =
      await sql`select expires_at,attempts,resends,code_expires_at from contact_change where id=${String(s.changeId)}`;
    assert.equal(now.attempts, before.attempts, "resends don't reset attempts");
    assert.equal(
      new Date(now.expires_at).getTime(),
      new Date(before.expires_at).getTime(),
      "or extend the change",
    );
    assert.ok(new Date(now.code_expires_at) <= new Date(now.expires_at));
    assert.equal(now.resends, 2);
    if (r1.code !== r2.code)
      await assert.rejects(
        code(A, String(s.changeId), String(r1.code)),
        status(409, /Wrong code/),
      ); // replaced code
    assert.equal(
      (await code(A, String(s.changeId), String(r2.code))).status,
      "awaiting_second_admin",
    );
    await cancel(A, String(s.changeId));
    await cancel(A, String(other.changeId));
  },
);

test(
  "W-C4: start limits per player, per number and per admin; cancel-and-restart uses a start",
  { skip },
  async () => {
    await resetLimits();
    for (let i = 0; i < 3; i++)
      await cancel(
        A,
        String(
          (await start(A, ply.ben, `+44 7911 12350${i}`, evidence())).changeId,
        ),
      );
    await assert.rejects(
      start(A, ply.ben, "+44 7911 123509", evidence()),
      status(429),
    );
    await resetLimits();
    for (const k of ["w0", "w1", "w2"])
      await cancel(
        A,
        String(
          (await start(A, ply[k], "+44 7911 123510", evidence(), W)).changeId,
        ),
        W,
      );
    await assert.rejects(
      start(A, ply.w3, "+44 7911 123510", evidence(), W),
      status(429),
    );
    await resetLimits();
    const keys = ["w0", "w1", "w2", "w3", "w4", "w5", "w6"];
    for (const [i, k] of keys.entries())
      await cancel(
        A,
        String(
          (await start(A, ply[k], `+44 7911 12352${i}`, evidence(), W))
            .changeId,
        ),
        W,
      );
    for (const [i, k] of ["ben", "cal", "eve"].entries())
      await cancel(
        A,
        String(
          (await start(A, ply[k], `+44 7911 12353${i}`, evidence())).changeId,
        ),
      );
    await assert.rejects(
      start(A, ply.ann, "9833300003", { expectedContactVersion: 3 }),
      status(429),
    );
    await resetLimits();
  },
);

test(
  "W-C5: codes and challenges are stored only as keyed hashes",
  { skip },
  async () => {
    const s = await start(A, ply.ann, "+44 7911 123540", {
      expectedContactVersion: 3,
      route: "independent_evidence",
      evidenceType: "efootball_possession",
      evidenceNote:
        "Challenge placed in the in-game profile of the registered account",
    });
    const [row] =
      await sql`select * from contact_change where id=${String(s.changeId)}`;
    for (const v of Object.values(row)) {
      assert.notEqual(String(v), s.code);
      assert.notEqual(String(v), s.challenge);
    }
    assert.match(row.code_hash, /^[0-9a-f]{64}$/);
    const audit =
      await sql`select after_value::text t from audit_event where entity=${String(s.changeId)}`;
    for (const a of audit) {
      assert.doesNotMatch(a.t, new RegExp(`\\b${s.code}\\b`));
      assert.ok(!a.t.includes(String(s.challenge)));
    }
    await cancel(A, String(s.changeId));
  },
);

/* ─────────────────────────── Uniqueness, concurrency, idempotency ─────────────────────────── */

test(
  "W-U1: numbers of other players (removed ones included), open changes and the current number are refused",
  { skip },
  async () => {
    await resetLimits();
    const n = await auditCount();
    await assert.rejects(
      start(A, ply.cal, "98111 00002", evidence()),
      status(409, new RegExp(`belongs to ${ply.ben.code}\\.`)),
    );
    await assert.rejects(
      start(A, ply.cal, "9811100004", evidence()),
      status(409, /removed player record/),
    );
    await assert.rejects(
      start(A, ply.cal, "9811100003", evidence()),
      status(400, /already this player/),
    );
    const open = await start(A, ply.ben, "+44 7911 123550", evidence());
    await assert.rejects(
      start(A, ply.cal, "+44 7911 123550", evidence()),
      status(409, /another open change/),
    );
    await assert.rejects(
      start(A, ply.ben, "+44 7911 123551", evidence()),
      status(409, /already has an open/),
    );
    await cancel(A, String(open.changeId));
    assert.equal(await auditCount(), n + 2);
    for (const e of seen.filter((x) => x.error))
      assert.doesNotMatch(e.error!, /\d{6,}/, e.error);
  },
);

test(
  "W-K1: two starts for one player at the same moment: exactly one succeeds",
  { skip },
  async () => {
    await resetLimits();
    const results = await Promise.allSettled([
      start(A, ply.cal, "+44 7911 123560", evidence()),
      start(B, ply.cal, "+44 7911 123561", evidence()),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    status(409)(
      (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
        .reason,
    );
    const ok = (
      results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<
        Record<string, unknown>
      >
    ).value;
    await cancel(A, String(ok.changeId));
  },
);

test(
  "W-K3: completion racing registration with the same new number: one owner, no partial state",
  { skip },
  async () => {
    await resetLimits();
    const s = await start(A, ply.eve, "9833300009", evidence());
    await code(A, String(s.changeId), String(s.code));
    const results = await Promise.allSettled([
      approve(B, String(s.changeId)),
      reg(
        {
          playerName: "Racer",
          teamName: "Race FC",
          phone: "9833300009",
          tournament: W,
        },
        "10.9.9.9",
      ),
    ]);
    const owners =
      await sql`select id from player where contact_hash=${hashOf("+919833300009")}`;
    assert.equal(owners.length, 1);
    const [ch] =
      await sql`select status from contact_change where id=${String(s.changeId)}`;
    if (results[0].status === "fulfilled") {
      assert.equal(owners[0].id, ply.eve.id);
      assert.equal(ch.status, "completed");
      ply.eve.phone = "+919833300009";
    } else {
      assert.notEqual(owners[0].id, ply.eve.id);
      assert.equal(ch.status, "awaiting_second_admin");
      assert.equal(
        (
          await sql`select contact_version from player where id=${ply.eve.id}`
        )[0].contact_version,
        1,
      );
      await cancel(A, String(s.changeId));
    }
  },
);

test(
  "W-K4: retries with the same request ID return the first outcome; reuse for another step is refused",
  { skip },
  async () => {
    await resetLimits();
    const rid = randomUUID();
    const body = {
      action: "contact.change_start",
      tournament: H,
      playerId: ply.cal.id,
      expectedContactVersion: 1,
      newPhone: "+44 7911 123570",
      confirm: true,
      reason: "Player changed phone",
      requestId: rid,
      ...evidence(),
    };
    const first = await cc.executeContact(body, as(A));
    const n = await auditCount();
    const again = await cc.executeContact(body, as(A));
    assert.deepEqual(again, {
      ok: true,
      repeated: true,
      changeId: first.changeId,
    });
    assert.equal(await auditCount(), n);
    const codeRid = randomUUID();
    const c1 = await cc.executeContact(
      {
        action: "contact.change_code",
        tournament: H,
        changeId: first.changeId,
        code: first.code,
        attest: true,
        requestId: codeRid,
      },
      as(A),
    );
    const c2 = await cc.executeContact(
      {
        action: "contact.change_code",
        tournament: H,
        changeId: first.changeId,
        code: first.code,
        attest: true,
        requestId: codeRid,
      },
      as(A),
    );
    assert.equal(c1.status, "awaiting_second_admin");
    assert.equal(c2.repeated, true);
    await assert.rejects(
      cc.executeContact(
        {
          action: "contact.change_cancel",
          tournament: H,
          changeId: first.changeId,
          reason: "Reused request",
          requestId: rid,
        },
        as(A),
      ),
      status(409, /already used/),
    );
    await cancel(A, String(first.changeId));
  },
);

test(
  "W-K5: a failure during completion leaves the old number, version, attestation and status",
  { skip },
  async () => {
    await resetLimits();
    const s = await start(A, ply.cal, "+44 7911 123580", evidence());
    await code(A, String(s.changeId), String(s.code));
    const before = (
      await sql`select contact_hash,contact_cipher,contact_version,contact_verified_at,contact_verification_method from player where id=${ply.cal.id}`
    )[0];
    const n = await auditCount();
    await sql.unsafe(`create function fail_contact() returns trigger language plpgsql as $$ begin raise exception 'forced failure'; end $$;
    create trigger fail_contact before insert on audit_event for each row when (new.action = 'contact.change_approve') execute function fail_contact();`);
    try {
      await assert.rejects(approve(B, String(s.changeId)), /forced failure/);
    } finally {
      await sql.unsafe(
        `drop trigger fail_contact on audit_event; drop function fail_contact();`,
      );
    }
    assert.deepEqual(
      (
        await sql`select contact_hash,contact_cipher,contact_version,contact_verified_at,contact_verification_method from player where id=${ply.cal.id}`
      )[0],
      before,
    );
    assert.equal(
      (
        await sql`select status from contact_change where id=${String(s.changeId)}`
      )[0].status,
      "awaiting_second_admin",
    );
    assert.equal(await auditCount(), n);
    await cancel(A, String(s.changeId));
  },
);

/* ─────────────────────────── Gate C security regressions ─────────────────────────── */

test(
  "GC-D1: a consumed disclosure request never returns another phone number",
  { skip },
  async () => {
    await resetLimits();
    const requestId = randomUUID();
    const disclosure = {
      action: "contact.disclose",
      tournament: W,
      playerId: ply.w0.id,
      purpose: "registration_check",
      requestId,
    };
    const first = await send(coordW, disclosure);
    assert.ok(
      first.phone === ply.w0.phone,
      "first reveal must return its target",
    );
    await assert.rejects(
      send(coordW, { ...disclosure, playerId: ply.w1.id }),
      status(409),
    );
    await assert.rejects(send(coordW, disclosure), status(409));
    await assert.rejects(
      send(coordW, { ...disclosure, purpose: "tournament_coordination" }),
      status(409),
    );
    await assert.rejects(send(B, disclosure), status(409));
    await assert.rejects(
      send(B, { ...disclosure, tournament: H, playerId: ply.ann.id }),
      status(409),
    );
    await assert.rejects(
      send(coordW, { ...disclosure, requestId: requestId.toUpperCase() }),
      status(409),
    );
    const [audit] = await sql`select count(*)::int n from audit_event
      where action='contact.disclose' and after_value->>'request_id'=${requestId}`;
    const [counters] = await sql`select sum(hits)::int as hits from rate_limit`;
    assert.equal(audit.n, 1);
    assert.equal(counters.hits, 2);
    const fresh = await send(coordW, {
      ...disclosure,
      playerId: ply.w1.id,
      requestId: randomUUID(),
    });
    assert.ok(
      fresh.phone === ply.w1.phone,
      "fresh reveal must return its target",
    );
    const [after] = await sql`select sum(hits)::int as hits from rate_limit`;
    assert.equal(after.hits, 4);
  },
);

test(
  "GC-D2: concurrent disclosure calls with one ID grant at most one reveal",
  { skip },
  async () => {
    await resetLimits();
    const requestId = randomUUID();
    const disclose = (playerId: string) =>
      send(coordW, {
        action: "contact.disclose",
        tournament: W,
        purpose: "registration_check",
        playerId,
        requestId,
      });
    const results = await Promise.allSettled([
      disclose(ply.w0.id),
      disclose(ply.w0.id),
      disclose(ply.w1.id),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    for (const failure of results)
      if (failure.status === "rejected") status(409)(failure.reason);
    const [audit] = await sql`select count(*)::int n from audit_event
      where action='contact.disclose' and after_value->>'request_id'=${requestId}`;
    const [counters] = await sql`select sum(hits)::int as hits from rate_limit`;
    assert.equal(audit.n, 1);
    assert.equal(counters.hits, 2);
  },
);

test(
  "GC-D3: disclosure checks the coordinator's current database permissions",
  { skip },
  async () => {
    await resetLimits();
    const disclosure = {
      action: "contact.disclose",
      tournament: W,
      playerId: ply.w0.id,
      purpose: "registration_check",
      requestId: randomUUID(),
    };
    await send(coordW, disclosure);
    const n = await auditCount();
    try {
      await sql`update coordinator set active=false where discord_id=${coordW.id}`;
      await assert.rejects(send(coordW, disclosure), status(403));
      await assert.rejects(
        send(coordW, { ...disclosure, requestId: randomUUID() }),
        status(403),
      );
      await sql`update coordinator set active=true,tournaments=${[H]}
        where discord_id=${coordW.id}`;
      await assert.rejects(
        send(coordW, { ...disclosure, requestId: randomUUID() }),
        status(403),
      );
      await assert.rejects(
        send(strangerAdmin, { ...disclosure, requestId: randomUUID() }),
        status(403),
      );
      assert.equal(await auditCount(), n);
    } finally {
      await sql`update coordinator set active=true,tournaments=${[W]}
        where discord_id=${coordW.id}`;
    }
  },
);

test(
  "GC-D4: an edit and a disclosure cannot both consume the same UUID",
  { skip },
  async () => {
    await resetLimits();
    const requestId = randomUUID();
    const player = ply.ann;
    const [before] =
      await sql`select gaming_name from player where id=${player.id}`;
    try {
      const results = await Promise.allSettled([
        send(coordW, {
          action: "contact.disclose",
          tournament: W,
          purpose: "registration_check",
          playerId: ply.w0.id,
          requestId,
        }),
        details.runEdit(A, {
          action: "player.edit_name",
          tournament: H,
          playerId: player.id,
          expected: before.gaming_name,
          name: "Ann Backup",
          reason: "Synthetic concurrent edit",
          requestId: requestId.toUpperCase(),
        }),
      ]);
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );
      for (const result of results)
        if (result.status === "rejected") status(409)(result.reason);
      const [audit] = await sql`select count(*)::int n from audit_event
        where lower(after_value->>'request_id')=${requestId}`;
      assert.equal(audit.n, 1);
    } finally {
      await sql`update player set gaming_name=${before.gaming_name} where id=${player.id}`;
    }
  },
);

test(
  "GC-D5: a disclosure returns no contact if the audit write fails",
  { skip },
  async () => {
    await resetLimits();
    const requestId = randomUUID();
    const disclosure = {
      action: "contact.disclose",
      tournament: W,
      playerId: ply.w0.id,
      purpose: "registration_check",
      requestId,
    };
    const n = await auditCount();
    await sql.unsafe(`create function fail_disclose() returns trigger language plpgsql as $$
      begin raise exception 'forced disclosure audit failure'; end $$;
      create trigger fail_disclose before insert on audit_event for each row
      when (new.action = 'contact.disclose') execute function fail_disclose();`);
    try {
      const { endpoint, response } = await import("../src/lib/api");
      const refused = await endpoint(async () =>
        response(await cc.executeContact(disclosure, as(coordW))),
      );
      assert.equal(refused.status, 503);
      assert.equal(refused.headers.get("Cache-Control"), "no-store");
      assert.ok(
        !(await refused.text()).includes(ply.w0.phone),
        "error body exposed the number",
      );
      assert.equal(await auditCount(), n);
      assert.equal((await sql`select count(*)::int n from rate_limit`)[0].n, 0);
    } finally {
      await sql.unsafe(
        "drop trigger fail_disclose on audit_event; drop function fail_disclose();",
      );
    }
    const result = await send(coordW, disclosure);
    assert.ok(
      result.phone === ply.w0.phone,
      "a fresh transaction can retry after rollback",
    );
    assert.equal(await auditCount(), n + 1);
  },
);

test(
  "GC-A1: the second admin can review legacy proof but cannot issue or verify its code",
  { skip },
  async () => {
    await resetLimits();
    const player = ply.w0;
    const s = await start(A, player, "+44 7911 123581", evidence(), W);
    const id = String(s.changeId);
    try {
      const resend = {
        action: "contact.change_resend",
        tournament: W,
        changeId: id,
        requestId: randomUUID(),
      };
      await assert.rejects(send(B, resend), status(403));
      await assert.rejects(code(B, id, String(s.code), {}, W), status(403));
      const r = await send(A, resend);
      await assert.rejects(send(B, resend), status(403));
      const codeRequest = { requestId: randomUUID() };
      assert.equal(
        (await code(A, id, String(r.code), codeRequest, W)).status,
        "awaiting_second_admin",
      );
      await assert.rejects(
        code(B, id, String(r.code), codeRequest, W),
        status(403),
      );
      assert.equal(await version(player), 1);
      await assert.rejects(approve(A, id, W), status(403));
      await assert.rejects(
        send(B, {
          action: "contact.change_approve",
          tournament: W,
          changeId: id,
          reviewed: false,
          reason: "Review is incomplete",
        }),
        status(400),
      );
      assert.equal((await approve(B, id, W)).status, "completed");
      assert.equal(await version(player), 2);
      const approvers =
        await sql`select actor,action,after_value from audit_event
        where entity=${id} and action in ('contact.change_code','contact.change_approve')
        order by id`;
      assert.deepEqual(
        approvers.map((row) => [row.actor, row.action]),
        [
          [A.id, "contact.change_code"],
          [B.id, "contact.change_approve"],
        ],
      );
      assert.equal(approvers[1].after_value.reviewed_verification_record, true);
    } finally {
      const [change] =
        await sql`select status from contact_change where id=${id}`;
      if (["pending_code", "awaiting_second_admin"].includes(change.status))
        await cancel(A, id, W);
    }
  },
);

const setProofId = (player: P, efootballId: string, expectedHadId: boolean) =>
  details.executeEdit(
    {
      action: "player.edit_efootball",
      tournament: W,
      playerId: player.id,
      expectedHadId,
      efootballId,
      reason: "Synthetic identity edit",
      requestId: randomUUID(),
    },
    as(coordW),
  );

const startProof = (player: P, phone: string) =>
  start(
    A,
    player,
    phone,
    evidence({
      evidenceType: "efootball_possession",
      evidenceObservedAt: undefined,
    }),
    W,
  );

test(
  "GC-A2: a changed eFootball ID cannot be used to pass an already issued challenge",
  { skip },
  async () => {
    await resetLimits();
    const player = ply.w1;
    await setProofId(player, "PROOF-ONE", false);
    const s = await startProof(player, "+44 7911 123582");
    const id = String(s.changeId);
    try {
      await setProofId(player, "PROOF-TWO", true);
      await assert.rejects(
        code(
          A,
          id,
          String(s.code),
          {
            efootballId: "PROOF-TWO",
            challenge: s.challenge,
          },
          W,
        ),
        status(409, /eFootball.*changed/),
      );
      await setProofId(player, "PROOF-ONE", true);
      await assert.rejects(
        code(
          A,
          id,
          String(s.code),
          {
            efootballId: "PROOF-ONE",
            challenge: s.challenge,
          },
          W,
        ),
        status(409, /eFootball.*changed/),
      );
      const [row] =
        await sql`select status,attempts from contact_change where id=${id}`;
      assert.equal(row.status, "pending_code");
      assert.equal(row.attempts, 0);
      assert.equal(await version(player), 1);
    } finally {
      await cancel(A, id, W);
    }
  },
);

test(
  "GC-A3: eFootball evidence must still match when the second admin approves",
  { skip },
  async () => {
    await resetLimits();
    const player = ply.w2;
    const oldId = "PROOF-THREE";
    await setProofId(player, oldId, false);
    const s = await startProof(player, "+44 7911 123583");
    const id = String(s.changeId);
    try {
      assert.equal(
        (
          await code(
            A,
            id,
            String(s.code),
            {
              efootballId: oldId,
              challenge: s.challenge,
            },
            W,
          )
        ).status,
        "awaiting_second_admin",
      );
      await setProofId(player, "PROOF-FOUR", true);
      await assert.rejects(
        approve(B, id, W),
        status(409, /eFootball.*changed/),
      );
      assert.equal(await version(player), 1);
    } finally {
      const [row] = await sql`select status from contact_change where id=${id}`;
      if (row.status === "awaiting_second_admin") await cancel(A, id, W);
    }
  },
);

test(
  "GC-A4: a rejected code request consumes one attempt across retries",
  { skip },
  async () => {
    await resetLimits();
    const player = ply.w3;
    const s = await start(A, player, "+44 7911 123584", evidence(), W);
    const id = String(s.changeId);
    const requestId = randomUUID();
    const wrong = String((Number(s.code) + 1) % 1_000_000).padStart(6, "0");
    const attempts = async () =>
      (await sql`select attempts from contact_change where id=${id}`)[0]
        .attempts;
    try {
      const retries = await Promise.allSettled([
        code(A, id, wrong, { requestId }, W),
        code(A, id, wrong, { requestId }, W),
        code(A, id, wrong, { requestId }, W),
      ]);
      assert.ok(retries.every((result) => result.status === "rejected"));
      assert.equal(await attempts(), 1);
      await assert.rejects(
        code(A, id, String(s.code), { requestId }, W),
        status(409),
      );
      assert.equal(await attempts(), 1);
      await assert.rejects(code(A, id, wrong, {}, W), status(409));
      assert.equal(await attempts(), 2);
      assert.equal(await version(player), 1);
    } finally {
      await cancel(A, id, W);
    }
  },
);

test(
  "GC-A5: approval rejects older requests where the other admin handled the code",
  { skip },
  async () => {
    await resetLimits();
    const legacy = [
      { player: ply.w4, phone: "+44 7911 123585", issuer: B, verifier: A },
      { player: ply.w5, phone: "+44 7911 123586", issuer: A, verifier: B },
    ];
    const changes: string[] = [];
    try {
      for (const { player, phone, issuer, verifier } of legacy) {
        const s = await start(A, player, phone, evidence(), W);
        const id = String(s.changeId);
        changes.push(id);
        // Seed the pending state and immutable events that the previous code allowed.
        await sql`update contact_change set status='awaiting_second_admin',
          code_checked_at=now(), approve_by=now() + interval '72 hours', code_hash=null
          where id=${id}`;
        await sql`insert into audit_event(actor,actor_role,action,entity,tournament_id,after_value)
          values(${issuer.id},'admin','contact.change_resend',${id},${W},'{}'::jsonb),
            (${verifier.id},'admin','contact.change_code',${id},${W},'{"outcome":"awaiting_second_admin"}'::jsonb)`;
      }
      const results = await Promise.allSettled(
        changes.map((id) => approve(B, id, W)),
      );
      assert.equal(
        results.filter((result) => result.status === "rejected").length,
        2,
      );
      for (const result of results)
        if (result.status === "rejected") status(409)(result.reason);
      for (const { player } of legacy) assert.equal(await version(player), 1);
    } finally {
      for (const id of changes) {
        const [row] =
          await sql`select status from contact_change where id=${id}`;
        if (row.status === "awaiting_second_admin") await cancel(A, id, W);
      }
    }
  },
);

test(
  "GC-A6: losing approval authorization while waiting for a lock blocks the write",
  { skip },
  async () => {
    await resetLimits();
    const player = ply.w6;
    const s = await start(A, player, "+44 7911 123587", evidence(), W);
    const id = String(s.changeId);
    const requestId = randomUUID();
    await code(A, id, String(s.code), {}, W);
    let approval: Promise<unknown> | undefined;
    try {
      await sql.begin(async (tx) => {
        await tx`select id from tournament where id=${W} for update`;
        approval = send(B, {
          action: "contact.change_approve",
          tournament: W,
          changeId: id,
          reviewed: true,
          reason: "Synthetic approval test",
          requestId,
        });
        void approval.catch(() => {});
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const [waiter] = await tx`select 1 from pg_stat_activity
            where pid <> pg_backend_pid() and datname=current_database()
              and wait_event_type='Lock' and query like 'select id from tournament%'`;
          if (waiter) {
            process.env.MAIN_ADMIN_DISCORD_IDS = `${A.id},759756138437804044`;
            return;
          }
          await tx`select pg_stat_clear_snapshot()`;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        assert.fail("Approval did not wait for the tournament lock.");
      });
      await assert.rejects(approval!, status(403));
      assert.equal(await version(player), 1);
      const [audit] = await sql`select count(*)::int n from audit_event
        where after_value->>'request_id'=${requestId}`;
      assert.equal(audit.n, 0);
    } finally {
      process.env.MAIN_ADMIN_DISCORD_IDS = ADMINS;
      const [row] = await sql`select status from contact_change where id=${id}`;
      if (row.status === "awaiting_second_admin") await cancel(A, id, W);
    }
  },
);

/* ─────────────────────────── Registration lookup and XG-008 assumptions ─────────────────────────── */

test(
  "W-G1, W-G2 and W-G3: after a change, registration finds the player by the new number only; registration code is unchanged",
  { skip },
  async () => {
    // New number, any Indian format: same XG ID (returning player).
    const same = await reg(
      {
        playerName: "Ann",
        teamName: "Ann United",
        phone: "+91-98333-00001",
        tournament: W,
      },
      "10.7.0.1",
    );
    assert.equal(same.code, ply.ann.code);
    assert.equal(same.playerId, ply.ann.id);
    // Old number: a new player and a new XG ID; Ann is untouched.
    const annBefore = (
      await sql`select contact_hash,contact_version,gaming_name from player where id=${ply.ann.id}`
    )[0];
    const fresh = await reg(
      {
        playerName: "Newcomer",
        teamName: "New FC",
        phone: "9811100001",
        tournament: W,
      },
      "10.7.0.2",
    );
    assert.notEqual(fresh.code, ply.ann.code);
    assert.deepEqual(
      (
        await sql`select contact_hash,contact_version,gaming_name from player where id=${ply.ann.id}`
      )[0],
      annBefore,
    );
    // W-G3: registration is byte-identical to the base branch and still India-only.
    const src = await readFile(
      new URL("../src/lib/registration.ts", import.meta.url),
      "utf8",
    );
    assert.equal(
      createHash("sha256").update(src).digest("hex"),
      "43ac31eccb7efbbec5c083c357008e4ae430aa8d42bd0a37cf199f82ce781ef4",
    );
    assert.ok(
      !registrationInput.safeParse({
        playerName: "Uk",
        teamName: "Uk FC",
        phone: "+447911123456",
        consent: true,
        website: "",
        tournament: W,
      }).success,
    );
  },
);

test(
  "W-X3: attestation fields grant nothing: only the contact module and Data health read them; the column says so",
  { skip },
  async () => {
    const root = fileURLToPath(new URL("../src/", import.meta.url));
    const readers: string[] = [];
    for (const file of await readdir(root, { recursive: true })) {
      if (!/\.(t|j)sx?$/.test(file)) continue;
      if (
        /contact_verified_at|contact_verification_method/.test(
          await readFile(join(root, file), "utf8"),
        )
      )
        readers.push(file.split(sep).join("/"));
    }
    assert.deepEqual(readers.sort(), [
      "lib/contact-change.ts",
      "lib/health.ts",
    ]);
    const [c] =
      await sql`select col_description('player'::regclass, (select attnum from pg_attribute where attrelid='player'::regclass and attname='contact_verified_at')) c`;
    assert.match(c.c, /not authorization for player login/);
  },
);

/* ─────────────────────────── Preservation and leak scans ─────────────────────────── */

test(
  "W-P1: XG IDs, entries, fixtures, results, qualification, podiums, standings and earlier audit rows are unchanged",
  { skip },
  async () => {
    assert.deepEqual(await fingerprints(), baseline);
    const [h] =
      await sql`select md5(string_agg(id||actor||action||entity||coalesce(before_value::text,'')||coalesce(after_value::text,'')||created_at, ',' order by id)) h from audit_event where id < ${firstAudit}`;
    assert.equal(h.h, auditBefore);
    await assert.rejects(
      sql`update audit_event set summary='x' where action like 'contact.%'`,
      /immutable/,
    );
  },
);

test(
  "W-L1 and W-L3: no number, hash, ciphertext or code in audit rows, errors, logs, public pages or Data health",
  { skip },
  async () => {
    const numbers = [
      ...Object.values(ply).map((p) => p.phone),
      "+919811100001",
      "+919811100002",
      "+919811100003",
      "+919811100004",
      "+919811100005",
      "+447911123456",
      "+919833300001",
      "+919833300009",
    ];
    const digits = [...new Set(numbers.map((n) => n.replace(/\D/g, "")))];
    const windows = digits.flatMap((d) => [
      d,
      d.slice(-10),
      ...Array.from({ length: d.length - 5 }, (_, i) => d.slice(i, i + 6)),
    ]);
    const hashes = (
      await sql`select contact_hash, contact_cipher from player`
    ).flatMap((r) => [r.contact_hash, r.contact_cipher]);
    const codes = seen.flatMap((s) =>
      s.out && typeof s.out === "object" && "code" in (s.out as object)
        ? [String((s.out as { code: string }).code)]
        : [],
    );
    const clean = (t: string) =>
      t
        .replace(
          /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
          "<uuid>",
        )
        .replace(
          new RegExp(
            [A.id, B.id, coordAll.id, coordW.id, coordResults.id].join("|"),
            "g",
          ),
          "<organizer>",
        )
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, "<time>");
    const check = (label: string, text: string) => {
      const t = clean(text);
      for (const w of windows)
        assert.ok(!t.includes(w), `${label} contains digits of a phone number`);
      for (const h of hashes)
        assert.ok(!text.includes(h), `${label} contains a hash or ciphertext`);
      assert.doesNotMatch(t, /\d{6,}/, `${label} has a long digit run`);
    };
    // Audit: every row written by these tests (contact rows and everything else).
    for (const r of await sql`select actor_name,actor_role,action,entity,summary,affected,before_value,after_value from audit_event where id >= ${firstAudit}`) {
      check(`audit ${r.action}`, JSON.stringify(r));
      for (const c of codes)
        assert.doesNotMatch(clean(JSON.stringify(r)), new RegExp(`\\b${c}\\b`));
    }
    // Errors returned by every refused command.
    for (const e of seen.filter((s) => s.error))
      check(`error ${e.action}`, e.error!);
    // Responses, except the three that deliberately carry a number or code to the requesting admin.
    for (const s of seen.filter(
      (s) =>
        s.out &&
        ![
          "contact.change_start",
          "contact.change_resend",
          "contact.disclose",
        ].includes(s.action),
    ))
      check(`response ${s.action}`, JSON.stringify(s.out));
    // Console output.
    check("console", logs.join("\n"));
    for (const c of codes)
      assert.ok(!logs.join("\n").includes(c), "console contains a code");
    // Public pages and Data health.
    const { getTournament } = await import("../src/lib/tournaments");
    const { getProfile } = await import("../src/lib/profile");
    const { healthReport } = await import("../src/lib/health");
    const pub = JSON.stringify([
      await getTournament(H),
      await getTournament(W),
      await getProfile(ply.ann.code),
      await healthReport(),
    ]);
    check("public pages and Data health", pub);
    const changes = JSON.stringify(await cc.contactChanges(as(A)));
    check("approval list", changes.replace(/"newNumber":"[^"]*"/g, ""));
  },
);
