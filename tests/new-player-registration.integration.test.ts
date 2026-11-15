import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { testDatabaseUrl } from "./helpers/test-database";

const base = testDatabaseUrl();
const skip = !base && "TEST_DATABASE_URL not set";
const ORIGIN = "http://localhost:3000";
const CUP = "new-player-cup";
const OTHER = "other-player-cup";
const LEGACY = "legacy-player-cup";
const PAST = "historical-cup";
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
  tournaments: [CUP],
  operations: ["registrations"],
};
const verification = {
  identityVerified: true,
  contactVerified: true,
  reason: "Verified the applicant and contact in a live call.",
};

let sql: ReturnType<typeof import("../src/lib/db").db>;
let register: typeof import("../src/app/api/registrations/route").POST;
let execute: typeof import("../src/lib/new-player-registration").executeNewPlayerRegistration;
let control: typeof import("../src/lib/control");
let getTournament: typeof import("../src/lib/tournaments").getTournament;
let getRecords: typeof import("../src/lib/records").getRecords;
let legacy: { player: string; entry: string; number: number }[];
let preMigration: Awaited<ReturnType<typeof wholeData>>;
let historical: Awaited<ReturnType<typeof history>>;

before(async () => {
  if (!base) return;
  const dbUrl = new URL(base);
  const name = dbUrl.pathname.slice(1) + "_newplayers";
  if (!/^[a-z0-9_]{1,50}$/.test(name))
    throw new Error("Unsafe test database name.");
  const setup = postgres(base, { ssl: false, max: 1, onnotice: () => {} });
  try {
    await setup`drop database if exists ${setup(name)} with (force)`;
    await setup`create database ${setup(name)}`;
  } finally {
    await setup.end();
  }
  dbUrl.pathname = "/" + name;
  process.env.DATABASE_URL = dbUrl.toString();
  process.env.PRIVATE_DATA_KEY = "ed".repeat(32);
  process.env.REGISTRATION_ENABLED = "true";
  process.env.APP_ORIGIN = ORIGIN;
  process.env.MAIN_ADMIN_DISCORD_IDS = `${admin.id},${otherAdmin.id}`;
  sql = (await import("../src/lib/db")).db();
  ({ POST: register } = await import("../src/app/api/registrations/route"));
  ({ executeNewPlayerRegistration: execute } =
    await import("../src/lib/new-player-registration"));
  control = await import("../src/lib/control");
  ({ getTournament } = await import("../src/lib/tournaments"));
  ({ getRecords } = await import("../src/lib/records"));
  const { applyMigrations, migrationFiles } =
    await import("../src/lib/migrations");
  const files = await migrationFiles();
  await applyMigrations(
    sql,
    files.filter((f) => f.name < "012"),
    () => {},
  );

  await sql`insert into tournament(id,name,status,published,format) values
    (${CUP},'New Player Cup','open',true,'league'),
    (${OTHER},'Other Cup','open',true,'league'),
    (${LEGACY},'Older Pending Cup','locked',true,'league'),
    (${PAST},'Historical Cup','completed',true,'league')`;
  const { encrypt, fingerprint } = await import("../src/lib/private-data");
  legacy = [];
  for (const [i, name] of [
    "Legacy One",
    "Legacy Two",
    "Retired Player",
  ].entries()) {
    const phone = `+91980000100${i}`;
    const [p] =
      await sql`insert into player(gaming_name,team_name,contact_hash,contact_cipher,consent_version,deleted_at)
      values(${name},'Historical Club',${fingerprint("whatsapp:" + phone)},${encrypt(phone)},'test',
        ${i === 2 ? new Date() : null}) returning id,public_no`;
    if (i === 2) continue;
    const [a] =
      await sql`insert into application(tournament_id,player_id,status,team_name,team_name_source)
      values(${LEGACY},${p.id},'pending','Legacy Club','registration'),
            (${PAST},${p.id},'approved','Historical Club','registration') returning id`;
    legacy.push({ player: p.id, entry: a.id, number: p.public_no });
  }
  await sql`insert into fixture(tournament_id,stage,round,slot,home,away,home_score,away_score)
    values(${PAST},'league',1,1,${legacy[0].player},${legacy[1].player},2,1)`;
  await sql`insert into podium(tournament_id,player_id,place) values(${PAST},${legacy[0].player},1)`;
  await sql`insert into qualification(tournament_id,player_id,rank) values(${PAST},${legacy[0].player},1)`;
  await sql`insert into audit_event(actor,action,entity,tournament_id,summary)
    values(${admin.id},'score',${PAST},${PAST},'Synthetic historical score')`;
  preMigration = await wholeData();
  historical = await history();
  await applyMigrations(sql, files, () => {});
});

after(async () => {
  if (sql) await sql.end();
});

const sequence = async () =>
  (await sql`select last_value::int as value from player_public_no_seq`)[0]
    .value;

async function wholeData() {
  return {
    sequence: await sequence(),
    players: await sql`select * from player order by id`,
    entries: await sql`select * from application order by id`,
    audit: await sql`select * from audit_event order by id`,
  };
}

async function history() {
  return {
    entries:
      await sql`select * from application where tournament_id=${PAST} order by id`,
    matches:
      await sql`select * from fixture where tournament_id=${PAST} order by id`,
    podium:
      await sql`select * from podium where tournament_id=${PAST} order by place`,
    qualification:
      await sql`select * from qualification where tournament_id=${PAST} order by rank`,
    audits:
      await sql`select * from audit_event where tournament_id=${PAST} order by id`,
    standings: (await getTournament(PAST))?.standings,
    ranking: (await getRecords())?.players.filter((p) =>
      legacy.some((l) => l.player === p.id),
    ),
  };
}

function payload(i: number, extra: Record<string, unknown> = {}) {
  return {
    kind: "new",
    tournament: CUP,
    playerName: `Applicant ${i}`,
    teamName: `Club ${i}`,
    phone: `98000100${String(i).padStart(2, "0")}`,
    consent: true,
    website: "",
    ...extra,
  };
}

function post(path: string, body: object, ip: string) {
  return new Request(ORIGIN + path, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      "x-vercel-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

const submit = (i: number, extra?: Record<string, unknown>) =>
  register(post("/api/registrations", payload(i, extra), `192.0.2.${i}`));

async function intake(i: number, extra?: Record<string, unknown>) {
  const r = await submit(i, extra);
  assert.equal(r.status, 202);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const receipt = await r.json();
  assert.deepEqual(Object.keys(receipt), ["reference"]);
  assert.match(receipt.reference, /^[0-9a-f-]{36}$/);
  return receipt.reference as string;
}

const state = async (reference: string) =>
  (
    await sql`select * from new_player_registration_request where id=${reference}`
  )[0];

const review = (
  input: Record<string, unknown>,
  who: typeof admin | typeof coordinator = admin,
) =>
  execute({ tournament: CUP, ...input }, async (op, t) => {
    assert.equal(op, "players");
    assert.equal(t, input.tournament ?? CUP);
    return who;
  });

const approve = (
  reference: string,
  n: number,
  extra: Record<string, unknown> = {},
  who = admin,
) =>
  review(
    {
      action: "newPlayer.approve",
      reference,
      verifiedPhone: payload(n).phone,
      ...verification,
      ...extra,
    },
    who,
  );

const rejects = (status: number, message?: RegExp) => (error: unknown) => {
  const { status: actual, message: text } = error as {
    status: number;
    message: string;
  };
  assert.equal(actual, status);
  if (message) assert.match(text, message);
  return true;
};

test(
  "012 is additive and keeps existing pending rows, permanent IDs and tournament records",
  { skip },
  async () => {
    const { readLedger } = await import("../src/lib/migrations");
    assert.ok(
      (await readLedger(sql)).some(
        (m) => m.name === "012_new_player_registration_approval",
      ),
    );
    assert.deepEqual(await wholeData(), preMigration);
    assert.deepEqual(await history(), historical);
  },
);

test(
  "intake gives only a temporary reference, deduplicates exact retries and does not store the raw number",
  { skip },
  async () => {
    const before = await wholeData();
    process.env.VERCEL = "1";
    try {
      const refs = await Promise.all([
        intake(11),
        intake(11, { phone: "+91-" + payload(11).phone }),
      ]);
      assert.equal(refs[0], refs[1]);
      assert.notEqual(
        await intake(11, { playerName: "Other Claimant" }),
        refs[0],
      );
      const record = await state(refs[0]);
      assert.equal(record.status, "pending");
      assert.equal(record.application_id, null);
      assert.match(record.contact_proof, /^[a-f0-9]{64}$/);
      assert.ok(!JSON.stringify(record).includes(String(payload(11).phone)));
      assert.deepEqual(await wholeData(), before);
    } finally {
      delete process.env.VERCEL;
    }
  },
);

test(
  "public intake stays closed when registration is disabled or the tournament is locked",
  { skip },
  async () => {
    const before = await wholeData();
    const count = (
      await sql`select count(*)::int as n from new_player_registration_request`
    )[0].n;
    process.env.REGISTRATION_ENABLED = "false";
    try {
      assert.equal((await submit(12)).status, 503);
    } finally {
      process.env.REGISTRATION_ENABLED = "true";
    }
    assert.equal((await submit(12, { tournament: LEGACY })).status, 409);
    assert.deepEqual(await wholeData(), before);
    assert.equal(
      (
        await sql`select count(*)::int as n from new_player_registration_request`
      )[0].n,
      count,
    );
  },
);

test(
  "the queue is private and holder of a reference cannot approve or read it",
  { skip },
  async () => {
    const ref = await intake(13);
    const plain = async () => coordinator;
    assert.equal(
      (await control.snapshot(CUP, plain)).newPlayerRequests,
      undefined,
    );
    const queue = (await control.snapshot(CUP, async () => admin))
      .newPlayerRequests!;
    assert.deepEqual(
      Object.keys(queue.find((r) => r.reference === ref)!).sort(),
      ["createdAt", "name", "reference", "team"],
    );
    assert.ok(!JSON.stringify(queue).includes(String(payload(13).phone)));
    for (const who of [coordinator, { ...admin, id: coordinator.id }]) {
      await assert.rejects(
        review(
          {
            action: "newPlayer.approve",
            reference: ref,
            verifiedPhone: payload(13).phone,
            ...verification,
          },
          who,
        ),
        rejects(403),
      );
      await assert.rejects(
        review(
          {
            action: "newPlayer.reject",
            reference: ref,
            reason: "Insufficient verification.",
          },
          who,
        ),
        rejects(403),
      );
    }
    await assert.rejects(
      approve(ref, 13, { tournament: OTHER }),
      rejects(409, /no longer pending/),
    );
    const { POST } = await import("../src/app/api/admin/route");
    const anonymous = await POST(
      post(
        "/api/admin",
        {
          tournament: CUP,
          action: "newPlayer.approve",
          reference: ref,
          verifiedPhone: payload(13).phone,
          ...verification,
        },
        "192.0.2.13",
      ),
    );
    assert.equal(anonymous.status, 403);
    assert.equal((await state(ref)).status, "pending");
  },
);

test(
  "approval needs both checks, the exact verified number and an audit-safe reason",
  { skip },
  async () => {
    const ref = await intake(14);
    const before = await wholeData();
    for (const extra of [
      { identityVerified: false },
      { contactVerified: false },
      { reason: "" },
      { reason: "Player gave code 748365" },
      { public_no: 1 },
    ])
      await assert.rejects(approve(ref, 14, extra), rejects(400));
    await assert.rejects(
      approve(ref, 14, { verifiedPhone: payload(15).phone }),
      rejects(409, /does not match/),
    );
    assert.equal((await state(ref)).status, "pending");
    assert.deepEqual(await wholeData(), before);
  },
);

test(
  "rejection audits the organizer and reason, clears unverified details and allocates no player ID",
  { skip },
  async () => {
    const ref = await intake(15);
    const before = await wholeData();
    const reason = "The applicant did not complete verification.";
    await review(
      { action: "newPlayer.reject", reference: ref, reason },
      otherAdmin,
    );
    await assert.rejects(approve(ref, 15), rejects(409, /no longer pending/));
    const row = await state(ref);
    assert.equal(row.status, "rejected");
    for (const column of [
      "gaming_name",
      "team_name",
      "contact_proof",
      "application_id",
    ])
      assert.equal(row[column], null);
    const after = await wholeData();
    assert.deepEqual({ ...after, audit: before.audit }, before);
    assert.deepEqual(after.audit.slice(0, -1), [...before.audit]);
    const event = after.audit.at(-1)!;
    assert.equal(event.actor, otherAdmin.id);
    assert.equal(event.entity, ref);
    assert.equal(event.action, "newPlayer.reject");
    assert.deepEqual(event.after_value, { reason });
  },
);

test(
  "approval assigns one permanent ID, creates the approved tournament entry and keeps previous history",
  { skip },
  async () => {
    const ref = await intake(16);
    const request = await state(ref);
    const before = await sequence();
    await control.run(admin, {
      action: "registration",
      tournament: CUP,
      open: false,
    });
    try {
      const result = await approve(ref, 16, {
        verifiedPhone: "+91 " + payload(16).phone,
      });
      const [p] = await sql`select * from player where id=${result.playerId!}`;
      const [a] =
        await sql`select * from application where id=${result.applicationId!}`;
      const { decrypt } = await import("../src/lib/private-data");
      assert.equal(p.public_no, before + 1);
      assert.equal(result.code, `XG-${String(p.public_no).padStart(4, "0")}`);
      assert.equal(decrypt(p.contact_cipher), "+91" + payload(16).phone);
      assert.equal(p.consent_at.getTime(), request.created_at.getTime());
      assert.equal(p.contact_verified_at, null);
      assert.equal(a.player_id, p.id);
      assert.equal(a.team_name, payload(16).teamName);
      assert.equal(a.team_name_source, "registration");
      assert.equal(a.status, "approved");
      assert.ok(a.verified_at);
      assert.equal((await state(ref)).contact_proof, null);
      assert.equal((await state(ref)).application_id, a.id);
      const [audit] =
        await sql`select * from audit_event where action='application.create' and entity=${a.id}`;
      assert.equal(audit.actor, admin.id);
      assert.equal(audit.affected, result.code);
      assert.equal(audit.after_value.reason, verification.reason);
      assert.equal(audit.after_value.new_player_request_id, ref);
      assert.ok(!JSON.stringify(audit).includes(String(payload(16).phone)));
      assert.deepEqual(await history(), historical);
    } finally {
      await control.run(admin, {
        action: "registration",
        tournament: CUP,
        open: true,
      });
    }
  },
);

test(
  "simultaneous reviews of the same reference allocate one ID and one decision",
  { skip },
  async () => {
    const ref = await intake(17);
    const before = await sequence();
    const results = await Promise.allSettled([
      approve(ref, 17),
      approve(ref, 17, {}, otherAdmin),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const failure = results.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    rejects(409)(failure.reason);
    assert.equal(await sequence(), before + 1);
    const audits =
      await sql`select 1 from audit_event where after_value->>'new_player_request_id'=${ref}`;
    assert.equal(audits.length, 1);
    const row = await state(ref);
    assert.equal(row.status, "approved");
    assert.ok(row.application_id);
  },
);

test(
  "audit failure rolls back the player, entry and decision while leaving a retryable application",
  { skip },
  async () => {
    const ref = await intake(18);
    const pending = await state(ref);
    const before = await wholeData();
    await sql.unsafe(`
    create function test_fail_new_player_audit() returns trigger language plpgsql as $$
    begin raise exception 'Synthetic audit failure'; end $$;
    create trigger test_fail_new_player_audit before insert on audit_event
    for each row when (new.summary='Approved new-player application')
    execute function test_fail_new_player_audit()
  `);
    try {
      await assert.rejects(approve(ref, 18), /Synthetic audit failure/);
      assert.deepEqual(await state(ref), pending);
      const after = await wholeData();
      assert.deepEqual({ ...after, sequence: before.sequence }, before);
    } finally {
      await sql.unsafe(
        "drop trigger test_fail_new_player_audit on audit_event; drop function test_fail_new_player_audit()",
      );
    }
    const attempted = await sequence();
    const result = await approve(ref, 18);
    assert.ok(
      Number(result.code?.slice(3)) > attempted,
      "the failed sequence number is never reused",
    );
  },
);

test(
  "already-numbered pending entries can be approved or rejected in place with no new IDs",
  { skip },
  async () => {
    const before = await sequence();
    const existing = (await control.snapshot(LEGACY, async () => admin))
      .applications;
    assert.deepEqual(
      existing.map((a) => a.status),
      ["pending", "pending"],
    );
    assert.deepEqual(
      (await control.snapshot(LEGACY, async () => admin)).newPlayerRequests,
      [],
    );
    for (const [i, status] of (["approved", "rejected"] as const).entries()) {
      const row = existing.find((a) => a.id === legacy[i].entry)!;
      await control.run(admin, {
        action: "review",
        tournament: LEGACY,
        status,
        verified: status === "approved",
        items: [{ id: row.id, revision: row.revision }],
      });
      const [actual] = await sql`select p.public_no,a.id,a.player_id,a.status
      from application a join player p on p.id=a.player_id where a.id=${row.id}`;
      assert.equal(actual.id, legacy[i].entry);
      assert.equal(actual.player_id, legacy[i].player);
      assert.equal(actual.public_no, legacy[i].number);
      assert.equal(actual.status, status);
    }
    assert.equal(await sequence(), before);
    // These changes concern the older pending cup only.
    const after = await history();
    const expected = historical.ranking?.map((p) => ({
      ...p,
      tournaments: p.tournaments + (p.id === legacy[0].player ? 1 : 0),
    }));
    assert.deepEqual(after, { ...historical, ranking: expected });
  },
);

test(
  "starting fixtures prevents approval and still permits rejection",
  { skip },
  async () => {
    const ref = await intake(19, { tournament: OTHER });
    await sql`update tournament set status='league' where id=${OTHER}`;
    const before = await sequence();
    await assert.rejects(
      approve(ref, 19, { tournament: OTHER }),
      rejects(409, /fixtures/),
    );
    await review({
      action: "newPlayer.reject",
      tournament: OTHER,
      reference: ref,
      reason: "The roster is now frozen.",
    });
    assert.equal((await state(ref)).status, "rejected");
    assert.equal(await sequence(), before);
  },
);
