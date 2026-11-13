/**
 * OM "Edit player details": approved regression tests (A, T, C, K, P, U, AU, D)
 * against a real PostgreSQL server (PostgreSQL 18 in CI).
 *
 * Uses its OWN disposable database next to TEST_DATABASE_URL (name + "_edits"),
 * because the other integration test file wipes TEST_DATABASE_URL's schema and the
 * test runner runs files in parallel. Local servers only (same guard).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";
import { isLocalTestDatabase, testDatabaseUrl } from "./helpers/test-database";

const base = testDatabaseUrl();
const skip = !base && "TEST_DATABASE_URL not set";
let url = "";
let dbName = "";
if (base) {
  const u = new URL(base);
  dbName = `${u.pathname.slice(1)}_edits`;
  if (!/^[a-z0-9_]{1,50}$/.test(dbName))
    throw new Error("Unexpected test database name.");
  u.pathname = `/${dbName}`;
  url = u.toString();
  if (!isLocalTestDatabase(url)) throw new Error("Not a local test database.");
  process.env.DATABASE_URL = url;
  process.env.PRIVATE_DATA_KEY = "cd".repeat(32);
  process.env.REGISTRATION_ENABLED = "true";
  process.env.APP_ORIGIN = "http://localhost:3000";
  delete process.env.MAIN_ADMIN_DISCORD_IDS;
  delete process.env.TEAM_DISPLAY;
}

type Edits = typeof import("../src/lib/player-details");
type Who = Parameters<Edits["runEdit"]>[0];
let edits: Edits;
let control: typeof import("../src/lib/control");
let register: typeof import("../src/lib/registration").register;
let tournaments: typeof import("../src/lib/tournaments");
let getProfile: typeof import("../src/lib/profile").getProfile;
let getRecords: typeof import("../src/lib/records").getRecords;
let healthReport: typeof import("../src/lib/health").healthReport;
let sql: ReturnType<typeof import("../src/lib/db").db>;

const admin: Who = { id: "759756138437804042", role: "admin", name: "David" };
const admin2: Who = { id: "759756138437804043", role: "admin", name: "Ben" };
const coordinator: Who = {
  id: "222222222222222222",
  role: "coordinator",
  name: "Coord",
  operations: ["registrations"],
  tournaments: ["*"],
};
const resultsOnly: Who = { ...coordinator, operations: ["results"] };

/** The real request path (strict schema, field permission) with a given signed-in user. */
const send = (user: Who, c: Record<string, unknown>) =>
  edits.executeEdit({ requestId: randomUUID(), ...c }, async () => ({
    operations: [],
    tournaments: [],
    ...user,
  }));
const status = (code: number, message?: RegExp) => (e: unknown) => {
  const err = e as { status?: number; message: string };
  assert.equal(err.status, code, err.message);
  if (message) assert.match(err.message, message);
  return true;
};
const auditCount = async () =>
  (await sql`select count(*)::int n from audit_event`)[0].n as number;

type Seed = { player: string; app: string; code: string };
let H = ""; // "Historic Cup": completed, results and podium
let W = ""; // "Winter Cup": open registration
const P: Record<string, Seed> = {};
let baseline: Record<string, unknown>;
let firstEditAudit = 0;
let baselineAudit = "";

/** A historical entry as the 29 Oct registration code left it: no team on the entry. */
async function historic(
  t: string,
  name: string,
  team: string,
  opts: { recordTeam?: boolean; player?: string } = {},
): Promise<Seed> {
  const player =
    opts.player ??
    (
      await sql`insert into player(gaming_name,team_name,contact_hash,contact_cipher,consent_version)
        values(${name},${team},${"hash-" + name},'cipher','2026-10-v3') returning id`
    )[0].id;
  const [row] = await sql`select public_no from player where id=${player}`;
  const code = `XG-${String(row.public_no).padStart(4, "0")}`;
  const [app] =
    await sql`insert into application(tournament_id,player_id,status) values(${t},${player},'approved') returning id`;
  await sql`insert into audit_event(actor,actor_name,actor_role,action,entity,tournament_id,summary,affected,after_value)
    values(${"player:" + player},${name},'player','application.create',${app.id},${t},'Registered',${code},
      ${sql.json(opts.recordTeam ? { playerId: player, team, status: "pending" } : { playerId: player, status: "pending" })})`;
  return { player, app: app.id, code };
}

async function fingerprints() {
  const [f] = await sql`select
    (select md5(string_agg(id::text||':'||public_no, ',' order by id)) from player) as identities,
    (select md5(string_agg(id::text||':'||tournament_id||':'||player_id||':'||status||':'||coalesce(deleted_at::text,'-'), ',' order by id)) from application) as entries,
    (select md5(string_agg(id::text||':'||stage||':'||round||':'||slot||':'||home||':'||coalesce(away::text,'-')||':'||coalesce(home_score::text,'-')||':'||coalesce(away_score::text,'-')||':'||revision, ',' order by id)) from fixture) as fixtures,
    (select md5(coalesce(string_agg(tournament_id||':'||player_id||':'||rank, ',' order by tournament_id, rank),'')) from qualification) as qualification,
    (select md5(string_agg(tournament_id||':'||place||':'||player_id, ',' order by tournament_id, place)) from podium) as podium,
    (select md5(string_agg(id||':'||status||':'||revision, ',' order by id)) from tournament) as tournaments`;
  const table = (await tournaments.getTournament(H))!.standings.map((r) => [
    r.id,
    r.pts,
    r.gd,
    r.played,
    r.won,
  ]);
  const ranking = (await getRecords())!.players
    .map((p) => [p.id, p.ranking, p.played, p.won, p.titles])
    .sort();
  return { ...f, table, ranking };
}

before(async () => {
  if (!base) return;
  const adminSql = postgres(base, { ssl: false, max: 1, onnotice: () => {} });
  await adminSql.unsafe(`drop database if exists "${dbName}" with (force)`);
  await adminSql.unsafe(`create database "${dbName}"`);
  await adminSql.end();

  edits = await import("../src/lib/player-details");
  control = await import("../src/lib/control");
  ({ register } = await import("../src/lib/registration"));
  tournaments = await import("../src/lib/tournaments");
  ({ getProfile } = await import("../src/lib/profile"));
  ({ getRecords } = await import("../src/lib/records"));
  ({ healthReport } = await import("../src/lib/health"));
  sql = (await import("../src/lib/db")).db();
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort())
    await sql.unsafe(await readFile(new URL(f, dir), "utf8"));

  const cmd = (c: Record<string, unknown>) =>
    control.run(admin, c as Parameters<typeof control.run>[1]);
  H = (
    (await cmd({
      action: "create",
      name: "Historic Cup",
      format: "league",
      season: null,
      published: true,
    })) as { id: string }
  ).id;
  W = (
    (await cmd({
      action: "create",
      name: "Winter Cup",
      format: "league",
      season: null,
      published: true,
    })) as { id: string }
  ).id;

  P.ace = await historic(H, "Ace", "Lions");
  P.bolt = await historic(H, "Bolt", "Tigers");
  P.cruz = await historic(H, "Cruz", "Wolves");
  P.dax = await historic(H, "Dax", "Hawks");
  P.daxW = await historic(W, "Dax", "Hawks", { player: P.dax.player });
  P.echo = await historic(H, "Echo", "Falcons", { recordTeam: true });
  P.fox = await historic(H, "Fox", "Rhinos", { recordTeam: true });
  // Fox: what 007 recovers from a record that holds the team (like XG-0010).
  await sql`update application set team_name='Rhinos', team_name_source='registration_record' where id=${P.fox.app}`;
  P.hal = await historic(W, "Hal", "Owls");
  await sql`update player set deleted_at=now() where id=${P.hal.player}`;

  await cmd({ action: "registration", tournament: H, open: false });
  await cmd({ action: "generate", tournament: H, shuffle: false });
  const order = [P.ace, P.bolt, P.cruz, P.dax, P.echo, P.fox].map(
    (p) => p.player,
  );
  for (const f of await sql`select * from fixture where tournament_id=${H}`)
    await cmd({
      action: "score",
      tournament: H,
      id: f.id,
      revision: f.revision,
      homeScore: order.indexOf(f.home) < order.indexOf(f.away) ? 2 : 1,
      awayScore: order.indexOf(f.home) < order.indexOf(f.away) ? 1 : 2,
    });
  await cmd({ action: "complete", tournament: H, podium: order.slice(0, 3) });

  await cmd({ action: "registration", tournament: W, open: true });
  const gus = await register(
    {
      playerName: "Gus",
      teamName: "Bears",
      phone: "9822200011",
      consent: true,
      website: "",
      tournament: W,
    },
    "10.20.0.1",
  );
  const [gusApp] =
    await sql`select id,revision from application where player_id=${gus.playerId}`;
  await cmd({
    action: "review",
    tournament: W,
    status: "approved",
    verified: true,
    items: [{ id: gusApp.id, revision: gusApp.revision }],
  });
  P.gus = { player: gus.playerId, app: gusApp.id, code: gus.code };

  baseline = await fingerprints();
  firstEditAudit =
    ((await sql`select max(id)::int m from audit_event`)[0].m as number) + 1;
  baselineAudit = (
    await sql`select md5(string_agg(id||actor||action||entity||coalesce(after_value::text,'')||created_at, ',' order by id)) h from audit_event where id < ${firstEditAudit}`
  )[0].h;
});
after(async () => {
  if (base) await sql.end();
});

/* ─────────────────────────── Authorization ─────────────────────────── */

test(
  "A1: coordinators can't edit name, current team or tournament teams; registrations coordinators can edit the eFootball ID",
  { skip },
  async () => {
    const n = await auditCount();
    const name = {
      action: "player.edit_name",
      tournament: H,
      playerId: P.ace.player,
      expected: "Ace",
      name: "Ace Two",
      reason: "Coordinator attempt",
    };
    for (const who of [coordinator, resultsOnly]) {
      await assert.rejects(send(who, name), status(403));
      await assert.rejects(
        send(who, {
          action: "player.edit_team",
          tournament: H,
          playerId: P.ace.player,
          expected: "Lions",
          team: "Lions FC",
          reason: "Coordinator attempt",
        }),
        status(403),
      );
      await assert.rejects(
        send(who, {
          action: "application.team_attest",
          tournament: H,
          applicationId: P.ace.app,
          expectedTeam: "Lions",
          confirm: true,
          reason: "Coordinator attempt",
        }),
        status(403),
      );
      await assert.rejects(
        send(who, {
          action: "application.team_correct",
          tournament: H,
          applicationId: P.ace.app,
          expectedTeam: null,
          expectedSource: null,
          team: "Lions",
          evidence: "WhatsApp message",
          reason: "Coordinator attempt",
          confirmOverwrite: false,
        }),
        status(403),
      );
    }
    const efootball = {
      action: "player.edit_efootball",
      tournament: H,
      playerId: P.ace.player,
      expectedHadId: false,
      efootballId: "ACE-1001",
      reason: "Added from the player's message",
    };
    await assert.rejects(send(resultsOnly, efootball), status(403));
    await assert.rejects(
      send({ ...coordinator, tournaments: ["another-cup"] }, efootball),
      status(403),
    );
    assert.equal(await auditCount(), n, "refused commands write nothing");
    await send(coordinator, efootball);
    assert.equal(await auditCount(), n + 1);
    const [ace] =
      await sql`select gaming_name,team_name from player where id=${P.ace.player}`;
    assert.deepEqual({ ...ace }, { gaming_name: "Ace", team_name: "Lions" });
  },
);

test(
  "A2: no session, an expired session or a non-admin is refused before anything is written",
  { skip },
  async () => {
    const n = await auditCount();
    const name = {
      action: "player.edit_name",
      tournament: H,
      playerId: P.ace.player,
      expected: "Ace",
      name: "Ace Two",
      reason: "Session check",
      requestId: randomUUID(),
    };
    const { HttpError } = await import("../src/lib/api");
    const asked: string[] = [];
    for (const code of [401, 403])
      await assert.rejects(
        edits.executeEdit(name, async (op) => {
          asked.push(op);
          throw new HttpError(code, "refused");
        }),
        status(code),
      );
    assert.deepEqual(
      asked,
      ["players", "players"],
      "names need the admin-only permission",
    );
    await edits
      .executeEdit(
        {
          action: "player.edit_efootball",
          tournament: H,
          playerId: P.ace.player,
          expectedHadId: true,
          efootballId: "ACE-1002",
          reason: "Session check",
          requestId: randomUUID(),
        },
        async (op) => {
          asked.push(op);
          throw new HttpError(403, "refused");
        },
      )
      .catch(() => {});
    assert.equal(asked.at(-1), "registrations");
    // The real sign-in check: with no admins configured, everything is refused.
    await assert.rejects(
      edits.executeEdit(name),
      status(403, /awaiting configuration/),
    );
    assert.equal(await auditCount(), n);
  },
);

test(
  "A3 and strict schemas: WhatsApp editing is off; fixed fields can't be sent",
  { skip },
  async () => {
    const n = await auditCount();
    const [before] =
      await sql`select contact_hash,public_no from player where id=${P.ace.player}`;
    assert.equal(edits.isEditCommand({ action: "player.edit_contact" }), false);
    await assert.rejects(
      control.execute({
        action: "player.edit_contact",
        tournament: H,
        playerId: P.ace.player,
        phone: "9800000099",
      }),
      status(400),
    );
    for (const extra of [
      { public_no: 99 },
      { status: "rejected" },
      { tournament_id: W },
      { contact_hash: "x" },
    ])
      await assert.rejects(
        send(admin, {
          action: "player.edit_name",
          tournament: H,
          playerId: P.ace.player,
          expected: "Ace",
          name: "Ace Two",
          reason: "Tries an extra field",
          ...extra,
        }),
        status(400),
      );
    const [now] =
      await sql`select contact_hash,public_no from player where id=${P.ace.player}`;
    assert.deepEqual({ ...now }, { ...before });
    assert.equal(await auditCount(), n);
  },
);

/* ─────────────────────────── Attestation ─────────────────────────── */

const attest = (p: Seed, expectedTeam: string, user: Who = admin, extra = {}) =>
  send(user, {
    action: "application.team_attest",
    tournament: H,
    applicationId: p.app,
    expectedTeam,
    confirm: true,
    reason: "Historical entry before 007; Owner attestation 13 Nov 2026",
    ...extra,
  });

test(
  "T1: an eligible entry is attested with the current team and one audit row holding the evidence",
  { skip },
  async () => {
    const review = await edits.teamReviewReport();
    const ace = review.entries.find((e) => e.applicationId === P.ace.app)!;
    assert.equal(ace.eligible, true);
    assert.equal(ace.currentTeam, "Lions");
    assert.deepEqual(
      [
        ace.evidence.entries,
        ace.evidence.registration_records,
        ace.evidence.record_has_team,
        ace.evidence.team_edits,
      ],
      [1, 1, false, 0],
    );
    await assert.rejects(
      attest(P.ace, "Lions", admin, { confirm: false }),
      status(400),
    );
    const n = await auditCount();
    await attest(P.ace, "Lions");
    const [app] =
      await sql`select team_name,team_name_source from application where id=${P.ace.app}`;
    assert.deepEqual(
      { ...app },
      { team_name: "Lions", team_name_source: "organizer_attested" },
    );
    assert.equal(await auditCount(), n + 1);
    const [row] = await sql`select * from audit_event order by id desc limit 1`;
    assert.equal(row.action, "application.team_attest");
    assert.equal(row.entity, P.ace.app);
    assert.equal(row.affected, P.ace.code);
    assert.deepEqual(row.before_value, {
      team_name: null,
      team_name_source: null,
    });
    assert.equal(row.after_value.team_name, "Lions");
    assert.equal(row.after_value.evidence.entries, 1);
    assert.equal(row.after_value.evidence.registration_records, 1);
    assert.equal(row.after_value.evidence.record_has_team_field, false);
    assert.equal(row.after_value.evidence.current_team_at_attestation, "Lions");
    assert.ok(row.after_value.evidence.registration_audit_id > 0);
  },
);

test(
  "T2: ineligible entries can't be attested (2 entries, a record that holds a team, a removed player)",
  { skip },
  async () => {
    const review = await edits.teamReviewReport();
    const find = (p: Seed) =>
      review.entries.find((e) => e.applicationId === p.app)!;
    assert.equal(find(P.dax).eligible, false);
    assert.match(find(P.dax).reasons.join(), /2 tournament entries/);
    assert.equal(find(P.echo).eligible, false);
    assert.match(find(P.echo).reasons.join(), /holds a team/);
    assert.equal(find(P.hal).eligible, false);
    assert.match(find(P.hal).reasons.join(), /removed/);
    const n = await auditCount();
    await assert.rejects(attest(P.dax, "Hawks"), status(409, /Can't attest/));
    await assert.rejects(
      attest(P.echo, "Falcons"),
      status(409, /Can't attest/),
    );
    await assert.rejects(
      send(admin, {
        action: "application.team_attest",
        tournament: W,
        applicationId: P.hal.app,
        expectedTeam: "Owls",
        confirm: true,
        reason: "Removed player check",
      }),
      status(409),
    );
    assert.equal(await auditCount(), n);
    const [dax] =
      await sql`select team_name,team_name_source from application where id=${P.dax.app}`;
    assert.deepEqual({ ...dax }, { team_name: null, team_name_source: null });
  },
);

test(
  "T3: the current team changed between page load and submit → 409, nothing written",
  { skip },
  async () => {
    // Changed outside OM (as a registration would); then the shown value is stale.
    await sql`update player set team_name='Wolves United' where id=${P.cruz.player}`;
    const n = await auditCount();
    await assert.rejects(attest(P.cruz, "Wolves"), status(409, /someone else/));
    assert.equal(await auditCount(), n);
    const [app] =
      await sql`select team_name from application where id=${P.cruz.app}`;
    assert.equal(app.team_name, null);
    await sql`update player set team_name='Wolves' where id=${P.cruz.player}`;
  },
);

test(
  "T4 and T5: filled entries (any source) can't be attested; recovered records aren't listed",
  { skip },
  async () => {
    const n = await auditCount();
    await assert.rejects(attest(P.ace, "Lions"), status(409, /already has/));
    await assert.rejects(attest(P.fox, "Rhinos"), status(409, /already has/));
    await assert.rejects(
      send(admin, {
        action: "application.team_attest",
        tournament: W,
        applicationId: P.gus.app,
        expectedTeam: "Bears",
        confirm: true,
        reason: "Already registered check",
      }),
      status(409, /already has/),
    );
    const listed = (await edits.teamReviewReport()).entries.map(
      (e) => e.applicationId,
    );
    assert.ok(
      !listed.includes(P.fox.app),
      "registration_record entries aren't listed",
    );
    assert.ok(!listed.includes(P.ace.app) && !listed.includes(P.gus.app));
    assert.equal(await auditCount(), n);
  },
);

/* ─────────────────────────── Corrections ─────────────────────────── */

const correct = (p: Seed, t: string, extra: Record<string, unknown>) =>
  send(admin, {
    action: "application.team_correct",
    tournament: t,
    applicationId: p.app,
    evidence: "WhatsApp registration message, 29 Oct",
    reason: "Set from the player's registration message",
    confirmOverwrite: false,
    ...extra,
  });

test(
  "C1: a correction with a reason and evidence is stored as organizer_corrected; the audit holds old and new",
  { skip },
  async () => {
    await correct(P.dax, H, {
      expectedTeam: null,
      expectedSource: null,
      team: "Hawks",
    });
    const [app] =
      await sql`select team_name,team_name_source from application where id=${P.dax.app}`;
    assert.deepEqual(
      { ...app },
      { team_name: "Hawks", team_name_source: "organizer_corrected" },
    );
    const [row] =
      await sql`select * from audit_event where action='application.team_correct' and entity=${P.dax.app}`;
    assert.deepEqual(row.before_value, {
      team_name: null,
      team_name_source: null,
    });
    assert.equal(row.after_value.team_name, "Hawks");
    assert.equal(
      row.after_value.evidence,
      "WhatsApp registration message, 29 Oct",
    );
    assert.match(row.after_value.reason, /registration message/);
    // Dax's other tournament is untouched.
    const [other] =
      await sql`select team_name from application where id=${P.daxW.app}`;
    assert.equal(other.team_name, null);
  },
);

test(
  "C2: replacing a registration or registration_record team needs the extra confirmation",
  { skip },
  async () => {
    const n = await auditCount();
    await assert.rejects(
      correct(P.fox, H, {
        expectedTeam: "Rhinos",
        expectedSource: "registration_record",
        team: "Rhinos FC",
      }),
      status(409, /Confirm you're replacing/),
    );
    await assert.rejects(
      send(admin, {
        action: "application.team_correct",
        tournament: W,
        applicationId: P.gus.app,
        expectedTeam: "Bears",
        expectedSource: "registration",
        team: "Grizzlies",
        evidence: "Player's message",
        reason: "Wrong team typed",
        confirmOverwrite: false,
      }),
      status(409, /Confirm/),
    );
    // Wrong expected source = stale page.
    await assert.rejects(
      correct(P.fox, H, {
        expectedTeam: "Rhinos",
        expectedSource: "registration",
        team: "Rhinos FC",
        confirmOverwrite: true,
      }),
      status(409, /someone else/),
    );
    assert.equal(await auditCount(), n);
    await correct(P.fox, H, {
      expectedTeam: "Rhinos",
      expectedSource: "registration_record",
      team: "Rhinos FC",
      confirmOverwrite: true,
    });
    const [row] =
      await sql`select before_value from audit_event where action='application.team_correct' and entity=${P.fox.app}`;
    assert.deepEqual(row.before_value, {
      team_name: "Rhinos",
      team_name_source: "registration_record",
    });
  },
);

test(
  "C3: name and team rules match registration; reason and evidence are required",
  { skip },
  async () => {
    const n = await auditCount();
    const base = {
      action: "player.edit_name",
      tournament: H,
      playerId: P.bolt.player,
      expected: "Bolt",
      reason: "Spelling fix",
    };
    for (const name of ["B", "x".repeat(41), "<script>", "Bolt;drop"])
      await assert.rejects(send(admin, { ...base, name }), status(400));
    await assert.rejects(
      send(admin, { ...base, name: "Bolt Two", reason: "no" }),
      status(400),
    );
    await assert.rejects(
      send(admin, { ...base, name: "Bolt Two", reason: undefined }),
      status(400),
    );
    await assert.rejects(
      correct(P.cruz, H, {
        expectedTeam: null,
        expectedSource: null,
        team: "Wolves",
        evidence: "",
      }),
      status(400),
    );
    await assert.rejects(
      correct(P.cruz, H, {
        expectedTeam: null,
        expectedSource: null,
        team: "W",
      }),
      status(400),
    );
    assert.equal(await auditCount(), n);
  },
);

/* ─────────────────────────── Concurrency and idempotency ─────────────────────────── */

test(
  "K1: two admins edit the same field at once: exactly one succeeds, the other gets 409",
  { skip },
  async () => {
    const results = await Promise.allSettled([
      send(admin, {
        action: "player.edit_name",
        tournament: H,
        playerId: P.bolt.player,
        expected: "Bolt",
        name: "Bolt Prime",
        reason: "Admin one",
      }),
      send(admin2, {
        action: "player.edit_name",
        tournament: H,
        playerId: P.bolt.player,
        expected: "Bolt",
        name: "Bolt Max",
        reason: "Admin two",
      }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const lost = results.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    status(409)(lost.reason);
    const [bolt] =
      await sql`select gaming_name from player where id=${P.bolt.player}`;
    const won = results[0].status === "fulfilled" ? "Bolt Prime" : "Bolt Max";
    assert.equal(bolt.gaming_name, won);
    const rows =
      await sql`select after_value from audit_event where action='player.edit_name' and entity=${P.bolt.player}`;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].after_value.gaming_name, won);
  },
);

test(
  "K2: an attestation racing a correction on the same entry: exactly one wins",
  { skip },
  async () => {
    const results = await Promise.allSettled([
      attest(P.cruz, "Wolves"),
      correct(P.cruz, H, {
        expectedTeam: null,
        expectedSource: null,
        team: "Wolves Old",
      }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    status(409)(
      (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
        .reason,
    );
    const rows =
      await sql`select action from audit_event where entity=${P.cruz.app} and action like 'application.team_%'`;
    assert.equal(rows.length, 1);
  },
);

test(
  "K3: a retried request ID returns success without a second write; reusing it for another change is refused",
  { skip },
  async () => {
    const requestId = randomUUID();
    const c = {
      action: "player.edit_team",
      tournament: H,
      playerId: P.echo.player,
      expected: "Falcons",
      team: "Falcons FC",
      reason: "Team renamed",
      requestId,
    };
    const first = await send(admin, c);
    assert.deepEqual(first, { ok: true });
    const n = await auditCount();
    assert.deepEqual(await send(admin, c), { ok: true, repeated: true });
    assert.equal(await auditCount(), n);
    // Concurrent duplicates of a new request: one write, both succeed.
    const again = {
      ...c,
      expected: "Falcons FC",
      team: "Falcons Club",
      requestId: randomUUID(),
    };
    const both = await Promise.all([send(admin, again), send(admin, again)]);
    assert.equal(both.filter((r) => "repeated" in r).length, 1);
    assert.equal(await auditCount(), n + 1);
    const [echo] =
      await sql`select team_name from player where id=${P.echo.player}`;
    assert.equal(echo.team_name, "Falcons Club");
    await assert.rejects(
      send(admin, {
        action: "player.edit_name",
        tournament: H,
        playerId: P.echo.player,
        expected: "Echo",
        name: "Echo Two",
        reason: "Reused request",
        requestId,
      }),
      status(409, /already used/),
    );
  },
);

test(
  "K4: a failure in the middle of a command leaves no partial write and no audit row",
  { skip },
  async () => {
    await sql.unsafe(`create function fail_edit() returns trigger language plpgsql as $$ begin raise exception 'forced failure'; end $$;
    create trigger fail_edit before insert on audit_event for each row when (new.action = 'player.edit_name') execute function fail_edit();`);
    try {
      const n = await auditCount();
      await assert.rejects(
        send(admin, {
          action: "player.edit_name",
          tournament: H,
          playerId: P.cruz.player,
          expected: "Cruz",
          name: "Cruz Prime",
          reason: "Forced failure test",
        }),
        /forced failure/,
      );
      const [cruz] =
        await sql`select gaming_name from player where id=${P.cruz.player}`;
      assert.equal(cruz.gaming_name, "Cruz");
      assert.equal(await auditCount(), n);
    } finally {
      await sql.unsafe(
        `drop trigger fail_edit on audit_event; drop function fail_edit();`,
      );
    }
  },
);

/* ─────────────────────────── Preservation and uniqueness ─────────────────────────── */

test(
  "P2 and P3: a name edit changes only the name; a current-team edit never changes a tournament team",
  { skip },
  async () => {
    const table = async () =>
      (await tournaments.getTournament(H))!.standings.map((r) => ({
        id: r.id,
        pts: r.pts,
        gd: r.gd,
        played: r.played,
        name: r.name,
      }));
    const teams = async () =>
      (
        await sql`select id,team_name,team_name_source from application order by id`
      ).map((r) => ({ ...r }));
    const beforeTable = await table();
    const beforeTeams = await teams();
    const [ace] =
      await sql`select gaming_name from player where id=${P.ace.player}`;
    await send(admin, {
      action: "player.edit_name",
      tournament: H,
      playerId: P.ace.player,
      expected: ace.gaming_name,
      name: "Ace Prime",
      reason: "Player asked for a new name",
    });
    const afterTable = await table();
    assert.deepEqual(
      afterTable.map(({ name: _n, ...r }) => r),
      beforeTable.map(({ name: _n, ...r }) => r),
    );
    assert.equal(
      afterTable.find((r) => r.id === P.ace.player)!.name,
      "Ace Prime",
    );
    await send(admin, {
      action: "player.edit_team",
      tournament: H,
      playerId: P.ace.player,
      expected: "Lions",
      team: "Lions Reborn",
      reason: "Player's new club",
    });
    assert.deepEqual(await teams(), beforeTeams, "tournament teams unchanged");
    // After an OM current-team edit, that player's unrecorded entries can't be attested.
    await send(admin, {
      action: "player.edit_team",
      tournament: H,
      playerId: P.bolt.player,
      expected: "Tigers",
      team: "Tigers FC",
      reason: "Player's new club",
    });
    assert.deepEqual(await teams(), beforeTeams, "tournament teams unchanged");
    const bolt = (await edits.teamReviewReport()).entries.find(
      (e) => e.applicationId === P.bolt.app,
    )!;
    assert.equal(bolt.eligible, false);
    assert.match(bolt.reasons.join(), /edited in OM/);
    await assert.rejects(
      attest(P.bolt, "Tigers FC"),
      status(409, /Can't attest/),
    );
  },
);

test(
  "U1: an eFootball ID owned by another player → 409 without showing it; coordinators never see contacts",
  { skip },
  async () => {
    await send(admin, {
      action: "player.edit_efootball",
      tournament: H,
      playerId: P.bolt.player,
      expectedHadId: false,
      efootballId: "BOLT-2002",
      reason: "From the player's message",
    });
    const n = await auditCount();
    await assert.rejects(
      send(admin, {
        action: "player.edit_efootball",
        tournament: H,
        playerId: P.cruz.player,
        expectedHadId: false,
        efootballId: "bolt-2002",
        reason: "Duplicate check",
      }).catch((e) => {
        assert.doesNotMatch(e.message, /BOLT-2002/i);
        throw e;
      }),
      status(409, /another player/),
    );
    // Stale "had no ID" → 409.
    await assert.rejects(
      send(admin, {
        action: "player.edit_efootball",
        tournament: H,
        playerId: P.bolt.player,
        expectedHadId: false,
        efootballId: "BOLT-3003",
        reason: "Stale page",
      }),
      status(409, /someone else/),
    );
    assert.equal(await auditCount(), n);

    const as = (user: Who) => async () => ({
      operations: [],
      tournaments: [],
      ...user,
    });
    await assert.rejects(
      edits.playerDetails(H, P.bolt.player, as(resultsOnly)),
      status(403),
    );
    const coord = await edits.playerDetails(H, P.bolt.player, as(coordinator));
    assert.equal(coord.player.efootballId, "BOLT-2002");
    assert.deepEqual(coord.entries, []);
    assert.deepEqual(coord.history, []);
    assert.deepEqual(coord.canEdit, {
      name: false,
      team: false,
      tournamentTeams: false,
      efootball: true,
      whatsapp: false,
    });
    const full = await edits.playerDetails(H, P.bolt.player, as(admin));
    assert.equal(full.canEdit.whatsapp, false);
    for (const view of [coord, full]) {
      const json = JSON.stringify(view);
      assert.ok(
        !json.includes("+91") &&
          !json.includes("cipher") &&
          !json.includes("hash-"),
        "no contact data",
      );
    }
  },
);

/* ─────────────────────────── Audit ─────────────────────────── */

test(
  "AU1, AU2 and AU3: one complete audit row per edit; eFootball IDs redacted; older audit rows untouched and immutable",
  { skip },
  async () => {
    const rows =
      await sql`select * from audit_event where id >= ${firstEditAudit} and action = any(${edits.EDIT_ACTIONS}) order by id`;
    assert.ok(rows.length >= 8);
    for (const r of rows) {
      assert.match(r.actor, /^\d{17,20}$/);
      assert.ok(["admin", "coordinator"].includes(r.actor_role));
      assert.ok(r.entity && r.summary && r.tournament_id);
      assert.match(r.affected, /^XG-\d{4}$/);
      assert.ok(r.before_value && typeof r.before_value === "object");
      assert.ok(r.after_value.reason.length >= 5);
      assert.match(r.after_value.request_id, /^[0-9a-f-]{36}$/);
    }
    const ids = new Set(rows.map((r) => r.after_value.request_id));
    assert.equal(ids.size, rows.length, "one row per request");
    const ef = rows.filter((r) => r.action === "player.edit_efootball");
    assert.ok(ef.length >= 2);
    for (const r of ef) {
      const json = JSON.stringify(r);
      assert.ok(!/ACE-1001|BOLT-2002/i.test(json));
      assert.equal(r.after_value.efootballId, "[REDACTED]");
    }
    // Rows from before the edits: unchanged and still immutable.
    const old =
      await sql`select md5(string_agg(id||actor||action||entity||coalesce(after_value::text,'')||created_at, ',' order by id)) h from audit_event where id < ${firstEditAudit}`;
    assert.equal(old[0].h, baselineAudit);
    await assert.rejects(
      sql`update audit_event set summary='x' where id=${firstEditAudit}`,
      /immutable/,
    );
    await assert.rejects(
      sql`delete from audit_event where id < ${firstEditAudit}`,
      /immutable/,
    );
  },
);

/* ─────────────────────────── Public display ─────────────────────────── */

const publicJson = async (codes: string[]) =>
  JSON.stringify([
    await tournaments.getTournament(H),
    await tournaments.getTournament(W),
    await tournaments.getChampions(),
    await getRecords(),
    ...(await Promise.all(codes.map((c) => getProfile(c)))),
  ]);

test(
  "D1: TEAM_DISPLAY=current (the default): public pages show each player's current team, as before 007",
  { skip },
  async () => {
    delete process.env.TEAM_DISPLAY;
    const current = new Map(
      (await sql`select id,team_name from player`).map((r) => [
        r.id,
        r.team_name,
      ]),
    );
    const pub = (await tournaments.getTournament(H))!;
    for (const p of pub.players) assert.equal(p.team, current.get(p.id));
    const champs = (await tournaments.getChampions()).find((c) => c.id === H)!;
    assert.equal(champs.places[0].team, current.get(P.ace.player)); // "Lions Reborn", not "Lions"
    const hall = (await getRecords())!.hall.find((h) => h.id === H)!;
    assert.equal(hall.places[0]!.team, current.get(P.ace.player));
    const profile = (await getProfile(P.dax.code))!;
    assert.ok(
      profile.career.every((c) => c.team === null),
      "no per-tournament team lines",
    );
    assert.equal(profile.player.team, "Hawks");
  },
);

test(
  'D2, D3 and D4: TEAM_DISPLAY=entry shows each tournament\'s own team, "Not recorded" when unknown (never the current team); no public source badge',
  { skip },
  async () => {
    process.env.TEAM_DISPLAY = "entry";
    try {
      const entry = new Map(
        (
          await sql`select player_id,team_name from application where tournament_id=${H}`
        ).map((r) => [r.player_id, r.team_name]),
      );
      const pub = (await tournaments.getTournament(H))!;
      for (const p of pub.players)
        assert.equal(p.team, entry.get(p.id) ?? "Not recorded");
      // Ace was attested as Lions, then changed current team: the tournament keeps Lions.
      assert.equal(
        pub.players.find((p) => p.id === P.ace.player)!.team,
        "Lions",
      );
      const champs = (await tournaments.getChampions()).find(
        (c) => c.id === H,
      )!;
      assert.equal(champs.places[0].team, "Lions");
      // Dax in Winter Cup was never recorded: "Not recorded", never "Hawks".
      const winter = (await tournaments.getTournament(W))!;
      assert.equal(
        winter.players.find((p) => p.id === P.dax.player)!.team,
        "Not recorded",
      );
      const dax = (await getProfile(P.dax.code))!;
      assert.equal(dax.career.find((c) => c.id === W)!.team, "Not recorded");
      assert.equal(dax.career.find((c) => c.id === H)!.team, "Hawks");
      // D4: the public site never shows where a team came from.
      const json = await publicJson([P.ace.code, P.dax.code, P.fox.code]);
      assert.doesNotMatch(
        json,
        /organizer_|registration_record|Attested|Corrected|team_name_source/,
      );
      // Data health: 4 sources + "Not recorded" on separate lines; entry mode with gaps is flagged.
      const report = await healthReport();
      const check = report.flatMap((s) => s.checks);
      const teams = check.find((c) => c.title === "Team names per tournament")!;
      assert.deepEqual(
        teams.items!.map((i) => i.split(":")[0]),
        [
          "Stored at registration",
          "Recovered from registration records",
          "Attested by an organizer",
          "Corrected by an organizer",
          "Not recorded",
        ],
      );
      assert.equal(
        check.find((c) => c.title === "Public team display")!.level,
        "error",
      );
    } finally {
      delete process.env.TEAM_DISPLAY;
    }
  },
);

/* ─────────────────────────── Overall preservation ─────────────────────────── */

test(
  "P1: after every edit above, XG IDs, entries, fixtures, results, qualification, podiums, standings and ranking are identical",
  { skip },
  async () => {
    assert.deepEqual(await fingerprints(), baseline);
  },
);
