import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
import { testDatabaseUrl } from "./helpers/test-database";

const base = testDatabaseUrl();
const skip = !base && "TEST_DATABASE_URL not set";
const url = base ? new URL(base) : undefined;
const dbName = url ? url.pathname.slice(1) + "_returning" : "";
const ORIGIN = "http://localhost:3000";
const PAST = "past-cup";
const CUP = "return-cup";
const OTHER = "another-cup";
const OLD_PHONE = "+919899800001";
const CLAIM_PHONE = "+447911123456";
const FORMATTED_CLAIM_PHONE = "+44 7911 123456";
const ELLIS_PHONE = "+919899800002";
const VERIFIED = {
  identityVerified: true,
  contactVerified: true,
  reason:
    "Confirmed the player in a live call and checked control of their contact.",
};
const admin = {
  id: "759756138437804042",
  name: "First Organizer",
  role: "admin" as const,
  tournaments: [],
  operations: [],
};
const otherAdmin = {
  ...admin,
  id: "759756138437804043",
  name: "Second Organizer",
};
const coordinator = {
  ...admin,
  id: "759756138437804044",
  role: "coordinator" as const,
  operations: ["registrations"],
  tournaments: [CUP],
};

if (url) {
  if (!/^[a-z0-9_]{1,50}$/.test(dbName))
    throw new Error("Unsafe test database name.");
  url.pathname = "/" + dbName;
  process.env.DATABASE_URL = url.toString();
  process.env.PRIVATE_DATA_KEY = "ac".repeat(32);
  process.env.REGISTRATION_ENABLED = "true";
  process.env.APP_ORIGIN = ORIGIN;
  process.env.MAIN_ADMIN_DISCORD_IDS = `${admin.id},${otherAdmin.id}`;
  process.env.TEAM_DISPLAY = "entry";
}

let sql: ReturnType<typeof import("../src/lib/db").db>;
let submit: typeof import("../src/app/api/registrations/route").POST;
let execute: typeof import("../src/lib/returning-registration").executeReturningRegistration;
let snapshot: typeof import("../src/lib/control").snapshot;
let getTournament: typeof import("../src/lib/tournaments").getTournament;
let getProfile: typeof import("../src/lib/profile").getProfile;
let getRecords: typeof import("../src/lib/records").getRecords;
let players: { id: string; public_no: number }[];
let historicalBefore: Awaited<ReturnType<typeof history>>;
let ledger: Awaited<
  ReturnType<typeof import("../src/lib/migrations").readLedger>
>;
const code = (index: number) =>
  "XG-" + String(players[index].public_no).padStart(4, "0");

before(async () => {
  if (!base) return;
  const bootstrap = postgres(base, { ssl: false, max: 1, onnotice: () => {} });
  try {
    await bootstrap`drop database if exists ${bootstrap(dbName)} with (force)`;
    await bootstrap`create database ${bootstrap(dbName)}`;
  } finally {
    await bootstrap.end();
  }
  sql = (await import("../src/lib/db")).db();
  ({ POST: submit } = await import("../src/app/api/registrations/route"));
  ({ executeReturningRegistration: execute } =
    await import("../src/lib/returning-registration"));
  ({ snapshot } = await import("../src/lib/control"));
  ({ getTournament } = await import("../src/lib/tournaments"));
  ({ getProfile } = await import("../src/lib/profile"));
  ({ getRecords } = await import("../src/lib/records"));

  const { applyMigrations, migrationFiles, readLedger } =
    await import("../src/lib/migrations");
  const files = await migrationFiles();
  await applyMigrations(
    sql,
    files.filter((f) => f.name < "011"),
    () => {},
  );
  await sql`insert into tournament(id,name,status,published,format) values
    (${PAST},'Past Cup','completed',true,'league'),
    (${CUP},'Returning Cup','open',true,'league'),
    (${OTHER},'Another Cup','open',true,'league'),
    ('hidden-cup','Hidden Cup','open',false,'league'),
    ('locked-cup','Locked Cup','locked',true,'league'),
    ('frozen-cup','Frozen Cup','open',true,'league')`;
  const { encrypt, fingerprint } = await import("../src/lib/private-data");
  players = [];
  for (const [i, name] of ["River", "Ellis", "Retired"].entries()) {
    // River's number on file is the one River claims with (H1: approvals must
    // match it). OLD_PHONE belongs to the retired record, so it is still taken.
    const phone = [CLAIM_PHONE, ELLIS_PHONE, OLD_PHONE][i];
    const [player] = await sql<{ id: string; public_no: number }[]>`
      insert into player(gaming_name,team_name,contact_hash,contact_cipher,consent_version,deleted_at)
      values(${name},'Current Club',${fingerprint("whatsapp:" + phone)},${encrypt(phone)},'test',
        ${i === 2 ? new Date() : null})
      returning id,public_no`;
    players.push(player);
  }
  const [pastEntry] =
    await sql`insert into application(tournament_id,player_id,status,team_name,team_name_source)
    values (${PAST},${players[0].id},'approved','Historic Club','registration'),
           (${PAST},${players[1].id},'approved','Another Club','registration')
    returning id`;
  await sql`insert into fixture(tournament_id,stage,round,slot,home,away,home_score,away_score)
    values (${PAST},'league',1,1,${players[0].id},${players[1].id},3,1),
           ('frozen-cup','league',1,1,${players[0].id},${players[1].id},null,null)`;
  await sql`insert into qualification(tournament_id,player_id,rank) values(${PAST},${players[0].id},1)`;
  await sql`insert into podium(tournament_id,player_id,place) values(${PAST},${players[0].id},1)`;
  await sql`insert into audit_event(actor,action,entity,tournament_id,summary)
    values(${admin.id},'application.create',${pastEntry.id},${PAST},'Historical entry')`;

  historicalBefore = await history();
  await applyMigrations(sql, files, () => {});
  ledger = await readLedger(sql);
});

after(async () => {
  if (sql) await sql.end();
});

async function history() {
  return {
    players: await sql`select * from player order by id`,
    sequence: await sql`select last_value from player_public_no_seq`,
    apps: await sql`select * from application where tournament_id=${PAST} order by id`,
    fixtures: await sql`select * from fixture order by id`,
    podium: await sql`select * from podium order by tournament_id,place`,
    qualification:
      await sql`select * from qualification order by tournament_id,rank`,
    audit:
      await sql`select * from audit_event where tournament_id=${PAST} order by id`,
    standings: (await getTournament(PAST))?.standings,
  };
}

function jsonRequest(
  path: string,
  body: object,
  ip = "198.51.100.1",
  origin = ORIGIN,
) {
  return new Request(ORIGIN + path, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "x-vercel-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

const claim = (options: Record<string, unknown> = {}) => ({
  kind: "existing",
  tournament: CUP,
  xgId: code(0),
  teamName: "Visiting Club",
  phone: CLAIM_PHONE,
  consent: true,
  website: "",
  ...options,
});
const send = (options: Record<string, unknown> = {}, ip?: string) =>
  submit(jsonRequest("/api/registrations", claim(options), ip));
const run = (
  command: Record<string, unknown>,
  who: typeof admin | typeof coordinator = admin,
) =>
  execute({ tournament: CUP, ...command }, async (op, scope) => {
    assert.equal(op, "players");
    assert.equal(scope, command.tournament ?? CUP);
    return who;
  });
const approve = (requestId: string, extra: Record<string, unknown> = {}) =>
  run({
    action: "returning.approve",
    requestId,
    verifiedPhone: CLAIM_PHONE,
    ...VERIFIED,
    ...extra,
  });
const rejects = (status: number, message?: RegExp) => (e: unknown) => {
  assert.equal((e as { status: number }).status, status);
  if (message) assert.match((e as Error).message, message);
  return true;
};
const pending = (t: string) => sql<{ id: string; claimed_public_no: number }[]>`
  select id,claimed_public_no from returning_registration_request
  where tournament_id=${t} and status='pending' order by created_at,id`;
const received = async (r: Response) => {
  assert.equal(r.status, 202);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(await r.json(), { ok: true });
};

test(
  "011 adds only a detached queue and preserves the existing records and ID sequence",
  { skip },
  async () => {
    assert.ok(ledger.some((m) => m.name === "011_returning_player_registration"));
    assert.ok(!ledger.some((m) => m.name.startsWith("010")));
    assert.deepEqual(await history(), historicalBefore);
  },
);

test(
  "public returning claims are indistinguishable and never link to a player or consume an XG ID",
  { skip },
  async () => {
    for (const options of [
      {},
      { xgId: "XG-2000000000", phone: OLD_PHONE },
      { xgId: code(2) },
    ])
      await received(await send(options));
    const [row] =
      await sql`select to_jsonb(r) as claim from returning_registration_request r
    where tournament_id=${CUP} and claimed_public_no=${players[0].public_no}`;
    assert.deepEqual(row.claim.application_id, null);
    assert.match(row.claim.contact_proof, /^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(row.claim).includes(CLAIM_PHONE));
    assert.equal((await pending(CUP)).length, 3);
    assert.equal(
      (await sql`select 1 from application where tournament_id=${CUP}`).length,
      0,
    );
    assert.equal(
      (await sql`select 1 from audit_event where tournament_id=${CUP}`).length,
      0,
    );
    assert.deepEqual(await history(), historicalBefore);
  },
);

test(
  "closed, unpublished and malformed submissions leave the queue untouched",
  { skip },
  async () => {
    const before = await pending(CUP);
    process.env.REGISTRATION_ENABLED = "false";
    try {
      assert.equal((await send()).status, 503);
    } finally {
      process.env.REGISTRATION_ENABLED = "true";
    }
    for (const tournament of ["hidden-cup", "locked-cup"])
      assert.equal((await send({ tournament })).status, 409);
    for (const options of [
      { xgId: "XG-0000" },
      { phone: "123" },
      { consent: false },
      { playerId: players[0].id },
    ])
      assert.equal((await send(options)).status, 400);
    assert.equal(
      (
        await submit(
          jsonRequest(
            "/api/registrations",
            claim(),
            undefined,
            "https://example.invalid",
          ),
        )
      ).status,
      403,
    );
    assert.deepEqual(await pending(CUP), before);
  },
);

test(
  "returning submissions share rate limits and concurrent retries produce one pending request",
  { skip },
  async () => {
    process.env.VERCEL = "1";
    try {
      const ip = "198.51.100.8";
      const request = { tournament: OTHER, teamName: "Replay Club" };
      for (const response of await Promise.all([
        send(request, ip),
        send(
          {
            ...request,
            xgId: `xg-${players[0].public_no}`,
            phone: FORMATTED_CLAIM_PHONE,
          },
          ip,
        ),
      ]))
        await received(response);
      for (let i = 2; i < 10; i++) await received(await send(request, ip));
      assert.equal((await pending(OTHER)).length, 1);
      assert.equal((await send(request, ip)).status, 429);
      const newPlayer = await submit(
        jsonRequest(
          "/api/registrations",
          {
            tournament: OTHER,
            kind: "new",
            playerName: "Fresh",
            teamName: "Fresh Club",
            phone: "9899800090",
            consent: true,
            website: "",
          },
          ip,
        ),
      );
      assert.equal(newPlayer.status, 429);
    } finally {
      delete process.env.VERCEL;
    }
  },
);

test(
  "only current main admins see the queue and can link player identities in OM",
  { skip },
  async () => {
    const queue = (await snapshot(CUP, async () => admin)).returningRequests!;
    assert.equal(queue.length, 3);
    assert.deepEqual(Object.keys(queue[0]).sort(), [
      "code",
      "createdAt",
      "id",
      "team",
    ]);
    assert.equal(
      (await snapshot(CUP, async () => coordinator)).returningRequests,
      undefined,
    );
    assert.equal(
      (await snapshot(CUP, async () => ({ ...admin, id: coordinator.id })))
        .returningRequests,
      undefined,
    );
    await assert.rejects(
      run(
        {
          action: "returning.approve",
          requestId: queue[0].id,
          verifiedPhone: CLAIM_PHONE,
          ...VERIFIED,
        },
        coordinator,
      ),
      rejects(403),
    );
    await assert.rejects(
      run(
        {
          action: "returning.reject",
          requestId: queue[0].id,
          reason: "Cannot verify this claim.",
        },
        coordinator,
      ),
      rejects(403),
    );
    await assert.rejects(
      run(
        {
          action: "returning.add",
          xgId: code(0),
          teamName: "Club",
          verifiedPhone: CLAIM_PHONE,
          ...VERIFIED,
        },
        coordinator,
      ),
      rejects(403),
    );
    await assert.rejects(
      approve(queue[0].id, { tournament: OTHER }),
      rejects(409, /no longer pending/),
    );
    const { POST } = await import("../src/app/api/admin/route");
    const unsigned = await POST(
      jsonRequest("/api/admin", {
        action: "returning.add",
        tournament: CUP,
        xgId: code(0),
        teamName: "Club",
        verifiedPhone: CLAIM_PHONE,
        ...VERIFIED,
      }),
    );
    assert.equal(unsigned.status, 403);
  },
);

test(
  "approval needs identity and phone-control checks plus the exact independently verified number",
  { skip },
  async () => {
    const req = (await pending(CUP))[0];
    for (const extra of [
      { identityVerified: false },
      { contactVerified: false },
      { reason: "" },
      { reason: "The WhatsApp code was 123456." },
    ])
      await assert.rejects(approve(req.id, extra), rejects(400));
    await assert.rejects(
      approve(req.id, { verifiedPhone: OLD_PHONE }),
      rejects(409, /does not match/),
    );
    for (const unverified of (await pending(CUP)).slice(1))
      await assert.rejects(
        approve(unverified.id, {
          verifiedPhone:
            unverified.claimed_public_no === 2000000000
              ? OLD_PHONE
              : CLAIM_PHONE,
        }),
        rejects(404, /No active player/),
      );
    assert.equal((await pending(CUP)).length, 3);
    assert.equal(
      (await sql`select 1 from application where tournament_id=${CUP}`).length,
      0,
    );
    assert.deepEqual(await history(), historicalBefore);
  },
);

test(
  "a verified returning player keeps their UUID, permanent XG ID, contacts and tournament history",
  { skip },
  async () => {
    const [req] = await pending(CUP);
    const beforeCareer = await getProfile(code(0));
    const beforeRank = (await getRecords())!.players.find(
      (p) => p.id === players[0].id,
    )!;
    await sql`update tournament set status='locked' where id=${CUP}`;
    assert.deepEqual(
      await approve(req.id, { verifiedPhone: FORMATTED_CLAIM_PHONE }),
      { ok: true },
    );
    const [app] =
      await sql`select * from application where tournament_id=${CUP}`;
    assert.equal(app.player_id, players[0].id);
    assert.equal(app.team_name, "Visiting Club");
    assert.equal(app.team_name_source, "registration");
    assert.equal(app.status, "approved");
    assert.ok(app.verified_at);
    const [decided] =
      await sql`select * from returning_registration_request where id=${req.id}`;
    assert.equal(decided.status, "approved");
    assert.equal(decided.application_id, app.id);
    assert.equal(decided.contact_proof, null);
    const [audit] = await sql`select * from audit_event where entity=${app.id}`;
    assert.equal(audit.actor, admin.id);
    assert.equal(audit.action, "application.create");
    assert.equal(audit.after_value.reason, VERIFIED.reason);
    assert.equal(audit.after_value.returning_request_id, req.id);
    assert.ok(!JSON.stringify(audit).includes(CLAIM_PHONE));
    assert.deepEqual(await history(), historicalBefore);
    const afterCareer = await getProfile(code(0));
    assert.deepEqual(afterCareer?.player, beforeCareer?.player);
    assert.deepEqual(afterCareer?.trophies, beforeCareer?.trophies);
    assert.deepEqual(afterCareer?.history, beforeCareer?.history);
    assert.equal(
      afterCareer?.career.find((c) => c.id === PAST)?.team,
      "Historic Club",
    );
    assert.equal(
      afterCareer?.career.find((c) => c.id === CUP)?.team,
      "Visiting Club",
    );
    const afterRank = (await getRecords())!.players.find(
      (p) => p.id === players[0].id,
    )!;
    assert.deepEqual(afterRank, {
      ...beforeRank,
      tournaments: beforeRank.tournaments + 1,
    });
  },
);

test(
  "rejection is audited, clears the proof and never creates an entry or resolves the claimed identity",
  { skip },
  async () => {
    const [req] = await pending(CUP);
    const reason = "The submitted evidence did not establish ownership.";
    await assert.rejects(
      run({ action: "returning.reject", requestId: req.id, reason: "" }),
      rejects(400),
    );
    await run(
      { action: "returning.reject", requestId: req.id, reason },
      otherAdmin,
    );
    await assert.rejects(approve(req.id), rejects(409, /no longer pending/));
    const [rejected] =
      await sql`select * from returning_registration_request where id=${req.id}`;
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.application_id, null);
    assert.equal(rejected.contact_proof, null);
    assert.ok(rejected.decided_at);
    const [audit] =
      await sql`select actor,action,after_value from audit_event where entity=${req.id}`;
    assert.equal(audit.actor, otherAdmin.id);
    assert.equal(audit.action, "returning.reject");
    assert.deepEqual(audit.after_value, {
      claimed_xg_id: "XG-2000000000",
      reason,
    });
    assert.equal(
      (await sql`select 1 from application where tournament_id=${CUP}`).length,
      1,
    );
  },
);

test(
  "manual addition requires the same attestations and cannot override withdrawn entries or fixtures",
  { skip },
  async () => {
    const manual = {
      action: "returning.add",
      xgId: code(1),
      teamName: "Manual Club",
      verifiedPhone: ELLIS_PHONE,
      ...VERIFIED,
    };
    await assert.rejects(
      run({ ...manual, contactVerified: false }),
      rejects(400),
    );
    const { verifiedPhone: _phone, ...withoutPhone } = manual;
    await assert.rejects(run(withoutPhone), rejects(400));
    await assert.rejects(
      run({ ...manual, verifiedPhone: CLAIM_PHONE }),
      rejects(409, /not the WhatsApp number on file for XG-\d{4}/),
    );
    await assert.rejects(run({ ...manual, xgId: code(2) }), rejects(404));
    await assert.rejects(
      run({ ...manual, tournament: "frozen-cup" }),
      rejects(409, /fixtures/),
    );
    await received(await send({ tournament: "frozen-cup" }));
    const [frozen] = await pending("frozen-cup");
    await assert.rejects(
      approve(frozen.id, { tournament: "frozen-cup" }),
      rejects(409, /fixtures/),
    );
    await run({
      action: "returning.reject",
      tournament: "frozen-cup",
      requestId: frozen.id,
      reason: "Fixtures already started.",
    });
    await run(manual, otherAdmin);
    const [entry] =
      await sql`select id,status,team_name from application where player_id=${players[1].id} and tournament_id=${CUP}`;
    assert.equal(entry.status, "approved");
    assert.equal(entry.team_name, "Manual Club");
    const [audit] =
      await sql`select actor,after_value from audit_event where entity=${entry.id}`;
    assert.equal(audit.actor, otherAdmin.id);
    assert.equal(audit.after_value.method, "manual_existing_player");
    assert.equal(audit.after_value.reason, VERIFIED.reason);
    await assert.rejects(run(manual), rejects(409, /already has an entry/));
    // M2: a removed entry is restored in place (same row, team and provenance kept).
    await sql`update application set status='withdrawn',deleted_at=now() where id=${entry.id}`;
    const restored = await run({ ...manual, teamName: "Different Club" });
    assert.deepEqual(restored, {
      ok: true,
      restored: true,
      team: "Manual Club",
    });
    const [after] =
      await sql`select id,status,deleted_at,team_name,team_name_source from application
        where player_id=${players[1].id} and tournament_id=${CUP}`;
    assert.equal(after.id, entry.id);
    assert.equal(after.status, "approved");
    assert.equal(after.deleted_at, null);
    assert.equal(after.team_name, "Manual Club");
    assert.equal(after.team_name_source, "registration");
    const [restoreAudit] =
      await sql`select action,before_value,after_value from audit_event where entity=${entry.id} and action='application.restore'`;
    assert.equal(restoreAudit.before_value.status, "withdrawn");
    assert.equal(restoreAudit.after_value.requested_team, "Different Club");
    assert.equal(restoreAudit.after_value.contact_matches_number_on_file, true);
    assert.deepEqual(await history(), historicalBefore);
  },
);

test(
  "concurrent reviews and manual entry cannot create a duplicate or a second approval audit",
  { skip },
  async () => {
    const [request] = await pending(OTHER);
    const results = await Promise.allSettled([
      approve(request.id, { tournament: OTHER }),
      approve(request.id, { tournament: OTHER }),
      run(
        {
          action: "returning.add",
          tournament: OTHER,
          xgId: code(0),
          teamName: "Replay Club",
          verifiedPhone: CLAIM_PHONE,
          ...VERIFIED,
        },
        otherAdmin,
      ),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    for (const r of results)
      if (r.status === "rejected") rejects(409)(r.reason);
    const entries =
      await sql`select id,team_name from application where player_id=${players[0].id} and tournament_id=${OTHER}`;
    assert.equal(entries.length, 1);
    assert.equal(entries[0].team_name, "Replay Club");
    const writes =
      await sql`select 1 from audit_event where entity=${entries[0].id} and action='application.create'`;
    assert.equal(writes.length, 1);
    assert.deepEqual(await history(), historicalBefore);
  },
);

test(
  "a failed approval audit rolls back the entry and leaves the claim pending",
  { skip },
  async () => {
    await received(
      await send({ tournament: OTHER, xgId: code(1), phone: ELLIS_PHONE }),
    );
    const req = (await pending(OTHER)).find(
      (r) => r.claimed_public_no === players[1].public_no,
    )!;
    await sql.unsafe(`
      create function test_fail_returning_audit() returns trigger language plpgsql as $$
      begin
        raise exception 'Test audit unavailable';
      end $$;
      create trigger test_fail_returning_audit before insert on audit_event
      for each row when (new.summary = 'Approved returning-player request')
      execute function test_fail_returning_audit()
    `);
    try {
      await assert.rejects(
        approve(req.id, { tournament: OTHER, verifiedPhone: ELLIS_PHONE }),
        /Test audit unavailable/,
      );
      const [row] = await sql`select status, application_id, contact_proof
        from returning_registration_request where id=${req.id}`;
      assert.equal(row.status, "pending");
      assert.equal(row.application_id, null);
      assert.match(row.contact_proof, /^[a-f0-9]{64}$/);
      assert.equal(
        (
          await sql`select id from application
        where player_id=${players[1].id} and tournament_id=${OTHER}`
        ).length,
        0,
      );
    } finally {
      await sql.unsafe(
        "drop trigger test_fail_returning_audit on audit_event; drop function test_fail_returning_audit()",
      );
    }
  },
);

test(
  "New Player receives only a temporary reference and cannot use another player's saved number",
  { skip },
  async () => {
    const response = (phone: string) =>
      submit(
        jsonRequest("/api/registrations", {
          kind: "new",
          tournament: OTHER,
          playerName: "First Time",
          teamName: "Fresh Club",
          phone,
          consent: true,
          website: "",
        }),
      );
    for (const phone of [OLD_PHONE, "9899800090"]) {
      const created = await response(phone);
      assert.equal(created.status, 202);
      const body = await created.json();
      assert.deepEqual(Object.keys(body), ["reference"]);
      const [request] = await sql`select status, application_id
        from new_player_registration_request where id=${body.reference}`;
      assert.equal(request.status, "pending");
      assert.equal(request.application_id, null);
    }
    assert.deepEqual(await history(), historicalBefore);
  },
);
