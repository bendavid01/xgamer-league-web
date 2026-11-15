/**
 * Regression tests for the registration security review of 8ecf5d2
 * (findings H1, M1–M4, L1, L4 and the reviewer probes P1–P7).
 * Disposable local database only (see tests/helpers/test-database.ts).
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { testDatabaseUrl } from "./helpers/test-database";

const base = testDatabaseUrl();
const skip = !base && "TEST_DATABASE_URL not set";
const ORIGIN = "http://localhost:3000";
const CUP = "remedy-cup";
const TWO = "remedy-two";
const PAST = "remedy-past";
const CAPPED = "remedy-capped";
const VICTIM_PHONE = "+919800009001";
const STRANGER_PHONE = "+919811112222";
const admin = {
  id: "759756138437804042",
  name: "First Organizer",
  role: "admin" as const,
  tournaments: [],
  operations: [],
};
const otherAdmin = { ...admin, id: "759756138437804043", name: "Second" };
const coordinator = {
  ...admin,
  id: "759756138437804044",
  name: "Coordinator",
  role: "coordinator" as const,
  tournaments: [CUP, TWO],
  operations: ["registrations"],
};
const VERIFIED = {
  identityVerified: true,
  contactVerified: true,
  reason: "Verified the player in a live call on their number.",
};

let sql: ReturnType<typeof import("../src/lib/db").db>;
let returning: typeof import("../src/lib/returning-registration");
let newPlayers: typeof import("../src/lib/new-player-registration");
let registration: typeof import("../src/lib/registration");
let control: typeof import("../src/lib/control");
let api: typeof import("../src/lib/api");
let access: typeof import("../src/lib/access");
let privateData: typeof import("../src/lib/private-data");
let contactLock: typeof import("../src/lib/contact-lock");
let victim: { id: string; public_no: number };
let victimCode: string;

before(async () => {
  if (!base) return;
  const url = new URL(base);
  const name = url.pathname.slice(1) + "_remediation";
  if (!/^[a-z0-9_]{1,50}$/.test(name))
    throw new Error("Unsafe test database name.");
  const setup = postgres(base, { ssl: false, max: 1, onnotice: () => {} });
  try {
    await setup`drop database if exists ${setup(name)} with (force)`;
    await setup`create database ${setup(name)}`;
  } finally {
    await setup.end();
  }
  url.pathname = "/" + name;
  Object.assign(process.env, {
    DATABASE_URL: url.toString(),
    PRIVATE_DATA_KEY: "ae".repeat(32),
    REGISTRATION_ENABLED: "true",
    APP_ORIGIN: ORIGIN,
    MAIN_ADMIN_DISCORD_IDS: `${admin.id},${otherAdmin.id}`,
  });
  sql = (await import("../src/lib/db")).db();
  returning = await import("../src/lib/returning-registration");
  newPlayers = await import("../src/lib/new-player-registration");
  registration = await import("../src/lib/registration");
  control = await import("../src/lib/control");
  api = await import("../src/lib/api");
  access = await import("../src/lib/access");
  privateData = await import("../src/lib/private-data");
  contactLock = await import("../src/lib/contact-lock");
  const { applyMigrations, migrationFiles } =
    await import("../src/lib/migrations");
  await applyMigrations(sql, await migrationFiles(), () => {});
  await sql`insert into tournament(id,name,status,published,format) values
    (${CUP},'Remedy Cup','open',true,'league'),
    (${TWO},'Remedy Two','open',true,'league'),
    (${CAPPED},'Capped Cup','open',true,'league'),
    (${PAST},'Remedy Past Cup','completed',true,'league')`;
  [victim] = await sql<{ id: string; public_no: number }[]>`
    insert into player(gaming_name,team_name,contact_hash,contact_cipher,consent_version)
    values('Victim Star','Victim FC',${privateData.fingerprint("whatsapp:" + VICTIM_PHONE)},
      ${privateData.encrypt(VICTIM_PHONE)},'test') returning id,public_no`;
  victimCode = "XG-" + String(victim.public_no).padStart(4, "0");
  await sql`insert into application(tournament_id,player_id,status,team_name,team_name_source)
    values(${PAST},${victim.id},'approved','Victim FC','registration')`;
});

after(async () => {
  if (sql) await sql.end();
});

/** Mirrors api.actor(): the permission check happens before any data access. */
const as =
  (who: typeof admin | typeof coordinator, seen: string[] = []) =>
  async (operation: Parameters<typeof access.allowed>[1], t: string) => {
    seen.push(operation);
    if (!access.allowed(who, operation, t))
      throw new api.HttpError(403, "This operation is not assigned to you.");
    return who;
  };
const rejects = (status: number, message?: RegExp) => (e: unknown) => {
  assert.equal((e as { status: number }).status, status, String(e));
  if (message) assert.match((e as Error).message, message);
  return true;
};
const returningCmd = (
  command: Record<string, unknown>,
  who: typeof admin | typeof coordinator = admin,
) => returning.executeReturningRegistration({ tournament: CUP, ...command }, as(who));
const newPlayerCmd = (command: Record<string, unknown>) =>
  newPlayers.executeNewPlayerRegistration(
    { tournament: CUP, ...command },
    as(admin),
  );
let claimSeq = 0;
const claim = async (t: string, xgId: string, phone: string, team: string) => {
  await returning.submitReturningRegistration(
    returning.returningRegistrationInput.parse({
      kind: "existing",
      tournament: t,
      xgId,
      teamName: team,
      phone,
      consent: true,
      website: "",
    }),
    `198.51.100.${(++claimSeq % 250) + 1}`,
  );
  const [row] = await sql<{ id: string }[]>`
    select id from returning_registration_request
    where tournament_id=${t} and status='pending' order by created_at desc limit 1`;
  return row.id;
};
let ipSeq = 0;
const apply = async (
  t: string,
  playerName: string,
  teamName: string,
  phone: string,
) =>
  (
    await registration.register(
      registration.registrationInput.parse({
        kind: "new",
        tournament: t,
        playerName,
        teamName,
        phone,
        consent: true,
        website: "",
      }),
      `203.0.113.${++ipSeq % 250}`,
    )
  ).reference;
const entry = async (t: string, playerId: string) =>
  (
    await sql`select id,status,deleted_at,team_name,team_name_source,revision
      from application where tournament_id=${t} and player_id=${playerId}`
  )[0];

test(
  "H1/P1: a returning claim is never linked when the verified number is not the number on file",
  { skip },
  async () => {
    const requestId = await claim(CUP, victimCode, STRANGER_PHONE, "Impostor FC");
    await assert.rejects(
      returningCmd({
        action: "returning.approve",
        requestId,
        verifiedPhone: STRANGER_PHONE,
        ...VERIFIED,
      }),
      rejects(
        409,
        new RegExp(
          `not the WhatsApp number on file for ${victimCode}.*Remedy Past Cup`,
        ),
      ),
    );
    // The manual path is not a bypass either.
    await assert.rejects(
      returningCmd({
        action: "returning.add",
        xgId: victimCode,
        teamName: "Impostor FC",
        verifiedPhone: STRANGER_PHONE,
        ...VERIFIED,
      }),
      rejects(409, /not the WhatsApp number on file/),
    );
    assert.equal(await entry(CUP, victim.id), undefined);
    const [pending] =
      await sql`select status from returning_registration_request where id=${requestId}`;
    assert.equal(pending.status, "pending");
    await returningCmd({
      action: "returning.reject",
      requestId,
      reason: "The number is not the one on file for this XG ID.",
    });

    // The genuine player, on the number on file, is linked.
    const genuine = await claim(CUP, victimCode, VICTIM_PHONE, "Victim FC");
    assert.deepEqual(
      await returningCmd({
        action: "returning.approve",
        requestId: genuine,
        verifiedPhone: VICTIM_PHONE,
        ...VERIFIED,
      }),
      { ok: true },
    );
    const linked = await entry(CUP, victim.id);
    assert.equal(linked.status, "approved");
    const [audit] =
      await sql`select after_value from audit_event where entity=${linked.id} and action='application.create'`;
    assert.equal(audit.after_value.contact_matches_number_on_file, true);
    assert.ok(!JSON.stringify(audit).includes(VICTIM_PHONE));
  },
);

test(
  "H1: after an organizer changes the number on file, only the new number links the player",
  { skip },
  async () => {
    const NEW_PHONE = "+919800009002";
    // Models a completed contact-change (that workflow has its own tests).
    await sql`update player set contact_hash=${privateData.fingerprint("whatsapp:" + NEW_PHONE)},
      contact_cipher=${privateData.encrypt(NEW_PHONE)}, contact_version=contact_version+1 where id=${victim.id}`;
    try {
      const add = (verifiedPhone: string) =>
        returningCmd({
          action: "returning.add",
          tournament: TWO,
          xgId: victimCode,
          teamName: "Victim FC",
          verifiedPhone,
          ...VERIFIED,
        });
      await assert.rejects(add(VICTIM_PHONE), rejects(409, /number on file/));
      assert.deepEqual(await add(NEW_PHONE), { ok: true });
    } finally {
      await sql`update player set contact_hash=${privateData.fingerprint("whatsapp:" + VICTIM_PHONE)},
        contact_cipher=${privateData.encrypt(VICTIM_PHONE)} where id=${victim.id}`;
    }
  },
);

test(
  "M1/P2: only main admins make legacy review decisions, always with an audited reason",
  { skip },
  async () => {
    const e = await entry(CUP, victim.id);
    const review = {
      action: "review",
      tournament: CUP,
      items: [{ id: e.id, revision: e.revision }],
      verified: false,
      status: "rejected",
      reason: "Rejected after the organizer checked the entry.",
    };
    const seen: string[] = [];
    await assert.rejects(
      control.execute(review, as(coordinator, seen)),
      rejects(403),
    );
    assert.deepEqual(seen, ["players"]);
    // Defense in depth: run() refuses coordinators even when called directly.
    await assert.rejects(
      control.run(coordinator, review as Parameters<typeof control.run>[1]),
      rejects(403, /main admins/),
    );
    const { reason: _reason, ...noReason } = review;
    await assert.rejects(control.execute(noReason, as(admin)), rejects(400));
    await assert.rejects(
      control.execute(
        { ...review, reason: "Code 123456 was confirmed." },
        as(admin),
      ),
      rejects(400),
    );
    await assert.rejects(
      control.execute({ ...review, status: "approved" }, as(admin)),
      rejects(400, /verified/),
    );
    assert.equal((await entry(CUP, victim.id)).status, "approved");

    await control.execute(review, as(admin));
    const rejected = await entry(CUP, victim.id);
    assert.equal(rejected.status, "rejected");
    await control.execute(
      {
        ...review,
        items: [{ id: e.id, revision: rejected.revision }],
        status: "approved",
        verified: true,
        reason: "Re-approved after confirming the player again.",
      },
      as(otherAdmin),
    );
    assert.equal((await entry(CUP, victim.id)).status, "approved");
    const audits = await sql`select actor,after_value from audit_event
      where action='review' and tournament_id=${CUP} order by id`;
    assert.deepEqual(
      audits.map((a) => [a.actor, a.after_value.status, a.after_value.reason]),
      [
        [admin.id, "rejected", review.reason],
        [otherAdmin.id, "approved", "Re-approved after confirming the player again."],
      ],
    );
  },
);

test(
  "M2/P3: a removed entry is restored in place, verified against the number on file, with history kept",
  { skip },
  async () => {
    const e = await entry(CUP, victim.id);
    await control.run(admin, {
      action: "remove",
      tournament: CUP,
      id: e.id,
      revision: e.revision,
    });
    const historyBefore =
      await sql`select * from application where tournament_id=${PAST} order by id`;
    // A request's approval does not silently revive it; the message says how to.
    const requestId = await claim(CUP, victimCode, VICTIM_PHONE, "New Club");
    await assert.rejects(
      returningCmd({
        action: "returning.approve",
        requestId,
        verifiedPhone: VICTIM_PHONE,
        ...VERIFIED,
      }),
      rejects(409, /removed from this tournament earlier.*Add a verified existing player/),
    );
    const restore = {
      action: "returning.add",
      xgId: victimCode,
      teamName: "New Club",
      verifiedPhone: VICTIM_PHONE,
      ...VERIFIED,
    };
    await assert.rejects(
      returningCmd({ ...restore, verifiedPhone: STRANGER_PHONE }),
      rejects(409, /number on file/),
    );
    await assert.rejects(returningCmd(restore, coordinator), rejects(403));
    assert.deepEqual(await returningCmd(restore), {
      ok: true,
      restored: true,
      team: e.team_name,
    });
    const restored = await entry(CUP, victim.id);
    assert.equal(restored.id, e.id);
    assert.equal(restored.status, "approved");
    assert.equal(restored.deleted_at, null);
    assert.equal(restored.team_name, e.team_name);
    assert.equal(restored.team_name_source, e.team_name_source);
    const [audit] = await sql`select actor,before_value,after_value from audit_event
      where entity=${e.id} and action='application.restore'`;
    assert.equal(audit.actor, admin.id);
    assert.equal(audit.before_value.status, "withdrawn");
    assert.equal(audit.after_value.method, "restore_removed_entry");
    assert.equal(audit.after_value.reason, VERIFIED.reason);
    assert.deepEqual(
      await sql`select * from application where tournament_id=${PAST} order by id`,
      historyBefore,
    );
    // The duplicate request can now be rejected.
    await returningCmd({
      action: "returning.reject",
      requestId,
      reason: "Duplicate of the restored entry.",
    });
  },
);

test(
  "M3/P5: same-name records must each be confirmed before a new ID; nothing is merged",
  { skip },
  async () => {
    const reference = await apply(CUP, "  victim   STAR ", "Brand New FC", "9811113333");
    const queue = (await newPlayers.pendingNewPlayerRegistrations(admin, CUP))!;
    const item = queue.find((q) => q.reference === reference)!;
    assert.deepEqual(item.possibleMatches, [
      {
        code: victimCode,
        name: "Victim Star",
        team: "Victim FC",
        retired: false,
        sameName: true,
        sameTeam: false,
      },
    ]);
    const approve = (extra: Record<string, unknown> = {}) =>
      newPlayerCmd({
        action: "newPlayer.approve",
        reference,
        verifiedPhone: "9811113333",
        ...VERIFIED,
        ...extra,
      });
    await assert.rejects(
      approve(),
      rejects(409, new RegExp(`same name: ${victimCode}`)),
    );
    // A record that appears after the page was loaded is not confirmed blindly.
    const [late] = await sql<{ public_no: number }[]>`
      insert into player(gaming_name,contact_hash,contact_cipher,consent_version,deleted_at)
      values('Victim  Star',${privateData.fingerprint("whatsapp:+919800009009")},
        ${privateData.encrypt("+919800009009")},'test',now()) returning public_no`;
    const lateCode = "XG-" + String(late.public_no).padStart(4, "0");
    await assert.rejects(
      approve({ confirmedDistinctFrom: [victimCode] }),
      rejects(409, new RegExp(`${lateCode} \\(removed record\\)`)),
    );
    const before = (await sql`select count(*)::int c from player`)[0].c;
    const result = await approve({ confirmedDistinctFrom: [victimCode, lateCode] });
    assert.notEqual(result.code, victimCode);
    assert.equal((await sql`select count(*)::int c from player`)[0].c, before + 1);
    // Never merged: the earlier identity is untouched.
    const [v] = await sql`select gaming_name,team_name,contact_hash from player where id=${victim.id}`;
    assert.equal(v.gaming_name, "Victim Star");
    assert.equal(v.contact_hash, privateData.fingerprint("whatsapp:" + VICTIM_PHONE));
    const [audit] = await sql`select after_value from audit_event
      where entity=${result.applicationId!} and action='application.create'`;
    assert.deepEqual(audit.after_value.same_name_records_confirmed_distinct, [
      victimCode,
      lateCode,
    ]);
  },
);

test(
  "M3: same-team records are shown for information and need no confirmation",
  { skip },
  async () => {
    const reference = await apply(CUP, "Someone Else", "victim fc", "9811114444");
    const item = (await newPlayers.pendingNewPlayerRegistrations(admin, CUP))!.find(
      (q) => q.reference === reference,
    )!;
    assert.ok(
      item.possibleMatches.some(
        (m) => m.code === victimCode && m.sameTeam && !m.sameName,
      ),
    );
    const result = await newPlayerCmd({
      action: "newPlayer.approve",
      reference,
      verifiedPhone: "9811114444",
      ...VERIFIED,
    });
    assert.ok(result.code);
  },
);

test(
  "M4: each public queue is capped per tournament, retries still succeed and nothing is deleted",
  { skip },
  async () => {
    process.env.REGISTRATION_PENDING_LIMIT = "3";
    try {
      const first = await apply(CAPPED, "Cap One", "Cap Club", "9822220001");
      await apply(CAPPED, "Cap Two", "Cap Club", "9822220002");
      await apply(CAPPED, "Cap Three", "Cap Club", "9822220003");
      await assert.rejects(
        apply(CAPPED, "Cap Four", "Cap Club", "9822220004"),
        rejects(429, /too many applications/),
      );
      // An exact retry still returns its reference.
      assert.equal(
        await apply(CAPPED, "Cap One", "Cap Club", "9822220001"),
        first,
      );
      // The returning queue has its own limit and the same behaviour.
      for (let i = 1; i <= 3; i++)
        await claim(CAPPED, `XG-${9000 + i}`, VICTIM_PHONE, "Cap Club");
      await assert.rejects(
        claim(CAPPED, "XG-9004", VICTIM_PHONE, "Cap Club"),
        rejects(429),
      );
      await returning.submitReturningRegistration(
        returning.returningRegistrationInput.parse({
          kind: "existing",
          tournament: CAPPED,
          xgId: "XG-9001",
          teamName: "Cap Club",
          phone: VICTIM_PHONE,
          consent: true,
          website: "",
        }),
        "198.51.100.77",
      );
      const counts = await sql`select
        (select count(*)::int from new_player_registration_request where tournament_id=${CAPPED} and status='pending') as fresh,
        (select count(*)::int from returning_registration_request where tournament_id=${CAPPED} and status='pending') as back`;
      assert.deepEqual({ ...counts[0] }, { fresh: 3, back: 3 });
      // Concurrent submissions at the boundary cannot exceed the limit.
      process.env.REGISTRATION_PENDING_LIMIT = "5";
      const results = await Promise.allSettled(
        [5, 6, 7, 8].map((i) =>
          apply(CAPPED, `Cap Race ${i}`, "Cap Club", `982222000${i}`),
        ),
      );
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
      const [{ c }] = await sql`select count(*)::int c from new_player_registration_request
        where tournament_id=${CAPPED} and status='pending'`;
      assert.equal(c, 5);
    } finally {
      delete process.env.REGISTRATION_PENDING_LIMIT;
    }
    assert.equal(registration.pendingLimit({}), 200);
    for (const bad of ["0", "-1", "1.5", "abc", "999999"])
      assert.equal(
        registration.pendingLimit({ REGISTRATION_PENDING_LIMIT: bad }),
        200,
      );
  },
);

test(
  "L1/P4: an open number change reserves its number until it expires",
  { skip },
  async () => {
    const NUMBER = "+919833330001";
    const hash = privateData.fingerprint("whatsapp:" + NUMBER);
    const [change] = await sql`insert into contact_change(player_id,tournament_id,route,new_contact_hash,
        new_contact_cipher,from_contact_version,requested_by,expires_at)
      values(${victim.id},${CUP},'established_channel',${hash},${privateData.encrypt(NUMBER)},1,${admin.id},
        now() + interval '1 day') returning id`;
    const reference = await apply(CUP, "Fresh Face", "Fresh FC", "9833330001");
    const approve = () =>
      newPlayerCmd({
        action: "newPlayer.approve",
        reference,
        verifiedPhone: "9833330001",
        ...VERIFIED,
      });
    await assert.rejects(approve(), rejects(409, /open number change/));
    // Past its deadline the change no longer reserves the number (expiry is lazy).
    await sql`update contact_change set expires_at=now() - interval '1 minute',
      created_at=now() - interval '2 days' where id=${change.id}`;
    const result = await approve();
    assert.ok(result.code);
    await sql`update contact_change set status='expired', finished_at=now() where id=${change.id}`;
  },
);

test(
  "L1: approval waits for a concurrent number change on the same number and then refuses it",
  { skip },
  async () => {
    const NUMBER = "+919833330002";
    const hash = privateData.fingerprint("whatsapp:" + NUMBER);
    const reference = await apply(CUP, "Racer Two", "Race FC", "9833330002");
    let settled = false;
    let approval!: Promise<unknown>;
    await sql.begin(async (tx) => {
      // The number-change side holds the number lock and records its change.
      await contactLock.lockContactNumber(tx, hash);
      approval = newPlayerCmd({
        action: "newPlayer.approve",
        reference,
        verifiedPhone: "9833330002",
        ...VERIFIED,
      }).finally(() => {
        settled = true;
      });
      approval.catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(settled, false, "approval must wait for the number lock");
      await tx`insert into contact_change(player_id,tournament_id,route,new_contact_hash,
          new_contact_cipher,from_contact_version,requested_by,expires_at)
        values(${victim.id},${TWO},'established_channel',${hash},${privateData.encrypt(NUMBER)},1,${admin.id},
          now() + interval '1 day')`;
    });
    await assert.rejects(approval, rejects(409, /open number change/));
    assert.equal(
      (await sql`select 1 from player where contact_hash=${hash}`).length,
      0,
    );
    await sql`update contact_change set status='cancelled', finished_at=now()
      where new_contact_hash=${hash}`;
  },
);

test(
  "P7: simultaneous approvals of one number in two tournaments create exactly one player",
  { skip },
  async () => {
    const refs = [
      await apply(CUP, "Twin Racer", "Twin FC", "9844445555"),
      await apply(TWO, "Twin Racer", "Twin FC", "9844445555"),
    ];
    const results = await Promise.allSettled(
      [CUP, TWO].map((t, i) =>
        newPlayers.executeNewPlayerRegistration(
          {
            action: "newPlayer.approve",
            tournament: t,
            reference: refs[i],
            verifiedPhone: "9844445555",
            ...VERIFIED,
          },
          as(admin),
        ),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    for (const r of results)
      if (r.status === "rejected") rejects(409, /already reserved/)(r.reason);
    const players = await sql`select 1 from player where gaming_name='Twin Racer'`;
    assert.equal(players.length, 1);
  },
);

test("L4: expected database conflicts become 409, with details only for organizers", { skip }, async () => {
  const unique = { code: "23505", constraint_name: "player_contact_hash_key" };
  assert.deepEqual(
    [api.databaseConflict(unique, true)?.status, api.databaseConflict(unique, true)?.message],
    [409, "This WhatsApp number belongs to another player record."],
  );
  assert.match(api.databaseConflict(unique)!.message, /^This conflicts with an existing record/);
  assert.equal(api.databaseConflict({ code: "40P01" })?.status, 409);
  for (const other of [{ code: "57014" }, { code: "08006" }, new Error("x"), null])
    assert.equal(api.databaseConflict(other), null);

  const call = async (error: unknown, detailed?: boolean) => {
    const r = await api.endpoint(async () => {
      throw error;
    }, { detailedConflicts: detailed });
    return { status: r.status, body: await r.json() };
  };
  assert.deepEqual(await call(unique, true), {
    status: 409,
    body: { error: "This WhatsApp number belongs to another player record." },
  });
  const publicView = await call(unique);
  assert.equal(publicView.status, 409);
  assert.ok(!/WhatsApp/.test(publicView.body.error));
  assert.equal((await call(new Error("connection lost"))).status, 503);

  // A real unique violation through the organizer API path maps to 409.
  const real = await sql`insert into player(gaming_name,contact_hash,contact_cipher,consent_version)
      values('Dup',${privateData.fingerprint("whatsapp:" + VICTIM_PHONE)},'x','test')`.catch((e) => e);
  assert.equal(real.code, "23505");
  assert.equal((await call(real, true)).status, 409);
});

test(
  "Data health lists pre-fix existing-player links and old pending requests, read-only",
  { skip },
  async () => {
    const { healthReport } = await import("../src/lib/health");
    const section = async () =>
      (await healthReport()).find((s) => s.title === "Registration review")!;
    const [old] = await sql<{ id: string }[]>`
      select id from application where tournament_id=${PAST} and player_id=${victim.id}`;
    // An approval written by 8ecf5d2, before the number on file was compared.
    await sql`insert into audit_event(actor,actor_role,action,entity,tournament_id,summary,after_value)
      values(${admin.id},'admin','application.create',${old.id},${PAST},'Approved returning-player request',
        ${sql.json({ method: "returning_request", playerId: victim.id })})`;
    await sql`insert into new_player_registration_request(tournament_id,gaming_name,team_name,contact_proof,consent_version,created_at)
      values(${TWO},'Old Applicant','Old Club',${"a".repeat(64)},'test',now() - interval '45 days')`;
    const before = {
      players: await sql`select * from player order by id`,
      entries: await sql`select * from application order by id`,
      requests: await sql`select * from new_player_registration_request order by id`,
    };
    const { checks } = await section();
    const links = checks.find((c) => c.title.startsWith("Existing-player links"))!;
    assert.equal(links.level, "warn");
    assert.deepEqual(links.items, [`${victimCode} in Remedy Past Cup`]);
    const stale = checks.find((c) => c.title.startsWith("Pending applications older"))!;
    assert.equal(stale.level, "warn");
    assert.match(stale.detail, /^1 new-player and 0 returning-player/);
    assert.ok(!JSON.stringify(checks).includes(VICTIM_PHONE));
    assert.deepEqual(
      {
        players: await sql`select * from player order by id`,
        entries: await sql`select * from application order by id`,
        requests: await sql`select * from new_player_registration_request order by id`,
      },
      before,
    );
  },
);

test(
  "M2 edges: rejected entries, retired players, fixtures and simultaneous restores",
  { skip },
  async () => {
    const add = (
      t: string,
      xgId: string,
      verifiedPhone: string,
      who: typeof admin = admin,
    ) =>
      returning.executeReturningRegistration(
        {
          action: "returning.add",
          tournament: t,
          xgId,
          teamName: "Edge Club",
          verifiedPhone,
          ...VERIFIED,
        },
        as(who),
      );
    const person = async (name: string, phone: string, retired = false) => {
      const [p] = await sql<{ id: string; public_no: number }[]>`
        insert into player(gaming_name,contact_hash,contact_cipher,consent_version,deleted_at)
        values(${name},${privateData.fingerprint("whatsapp:" + phone)},${privateData.encrypt(phone)},'test',
          ${retired ? new Date() : null}) returning id,public_no`;
      return { ...p, code: "XG-" + String(p.public_no).padStart(4, "0") };
    };
    // A rejected (not removed) entry is not revived by the restore path.
    const rejected = await person("Edge Rejected", "+919855550001");
    await sql`insert into application(tournament_id,player_id,status,team_name,team_name_source)
      values(${TWO},${rejected.id},'rejected','Edge Club','registration')`;
    await assert.rejects(
      add(TWO, rejected.code, "+919855550001"),
      rejects(409, /already has an entry for this tournament \(rejected\)/),
    );
    // A retired record is never restored.
    const retired = await person("Edge Retired", "+919855550002", true);
    await sql`insert into application(tournament_id,player_id,status,team_name,deleted_at)
      values(${TWO},${retired.id},'withdrawn','Edge Club',now())`;
    await assert.rejects(
      add(TWO, retired.code, "+919855550002"),
      rejects(404, /No active player/),
    );
    // Two admins restoring the same removed entry at once: one restore, one 409.
    const twice = await person("Edge Twice", "+919855550003");
    const [removed] = await sql`insert into application(tournament_id,player_id,status,team_name,team_name_source,deleted_at)
      values(${TWO},${twice.id},'withdrawn','Edge Club','registration',now()) returning id`;
    const results = await Promise.allSettled([
      add(TWO, twice.code, "+919855550003"),
      add(TWO, twice.code, "+919855550003", otherAdmin),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    for (const r of results)
      if (r.status === "rejected") rejects(409, /already has an entry/)(r.reason);
    assert.equal(
      (await sql`select 1 from audit_event where entity=${removed.id} and action='application.restore'`).length,
      1,
    );
    // Once fixtures exist the roster is locked: no restore.
    const late = await person("Edge Late", "+919855550004");
    await sql`insert into application(tournament_id,player_id,status,team_name,deleted_at)
      values(${PAST},${late.id},'withdrawn','Edge Club',now())`;
    await sql`insert into fixture(tournament_id,stage,round,slot,home,away)
      values(${PAST},'league',1,1,${victim.id},${late.id})`;
    await assert.rejects(
      add(PAST, late.code, "+919855550004"),
      rejects(409, /fixtures/),
    );
    // The legacy review cannot approve a retired record either.
    const [retiredEntry] = await sql`select id,revision from application
      where tournament_id=${TWO} and player_id=${retired.id}`;
    await sql`update application set deleted_at=null,status='pending' where id=${retiredEntry.id}`;
    await assert.rejects(
      control.execute(
        {
          action: "review",
          tournament: TWO,
          items: [{ id: retiredEntry.id, revision: retiredEntry.revision }],
          status: "approved",
          verified: true,
          reason: "Trying to approve a removed player record.",
        },
        as(admin),
      ),
      rejects(409, /removed player record/),
    );
  },
);

test(
  "M3: the review queue carries no contact data and summarizes long same-team lists",
  { skip },
  async () => {
    for (let i = 0; i < 7; i++) {
      const phone = "+91986666000" + i;
      await sql`insert into player(gaming_name,team_name,contact_hash,contact_cipher,consent_version)
        values(${"Common Member " + i},'Common FC',${privateData.fingerprint("whatsapp:" + phone)},
          ${privateData.encrypt(phone)},'test')`;
    }
    const reference = await apply(TWO, "Unrelated Name", "COMMON  fc", "9866660099");
    const queue = (await newPlayers.pendingNewPlayerRegistrations(admin, TWO))!;
    const item = queue.find((q) => q.reference === reference)!;
    assert.equal(item.possibleMatches.length, 5);
    assert.ok(item.possibleMatches.every((m) => m.sameTeam && !m.sameName));
    assert.equal(item.moreMatches, 2);
    const text = JSON.stringify(queue);
    for (const h of await sql`select contact_hash, contact_cipher from player`) {
      assert.ok(!text.includes(h.contact_hash));
      assert.ok(!text.includes(h.contact_cipher));
    }
    assert.ok(!text.includes("986666"));
    // Team-only matches never block approval.
    const result = await newPlayerCmd({
      action: "newPlayer.approve",
      tournament: TWO,
      reference,
      verifiedPhone: "9866660099",
      ...VERIFIED,
    });
    assert.ok(result.code);
  },
);

test(
  "M4/L4: a full queue answers the public with a generic 429 that reveals nothing",
  { skip },
  async () => {
    const { POST } = await import("../src/app/api/registrations/route");
    await sql`insert into tournament(id,name,status,published,format)
      values('remedy-full','Full Cup','open',true,'league')`;
    const send = (body: Record<string, unknown>, ip: string) =>
      POST(
        new Request(ORIGIN + "/api/registrations", {
          method: "POST",
          headers: {
            origin: ORIGIN,
            "content-type": "application/json",
            "x-vercel-forwarded-for": ip,
          },
          body: JSON.stringify({
            tournament: "remedy-full",
            consent: true,
            website: "",
            ...body,
          }),
        }),
      );
    const fresh = (i: number) => ({
      kind: "new",
      playerName: `Full ${i}`,
      teamName: "Full Club",
      phone: `987777000${i}`,
    });
    const back = (no: string, phone: string) => ({
      kind: "existing",
      xgId: no,
      teamName: "Full Club",
      phone,
    });
    process.env.VERCEL = "1";
    process.env.REGISTRATION_PENDING_LIMIT = "1";
    try {
      assert.equal((await send(fresh(1), "192.0.2.1")).status, 202);
      assert.equal(
        (await send(back(victimCode, VICTIM_PHONE), "192.0.2.2")).status,
        202,
      );
      const bodies: { error: string }[] = [];
      const attempts: [Record<string, unknown>, string][] = [
        [fresh(2), "192.0.2.3"],
        // A known identity and an unknown one get the same answer.
        [back(victimCode, STRANGER_PHONE), "192.0.2.4"],
        [back("XG-999999", STRANGER_PHONE), "192.0.2.5"],
      ];
      for (const [body, ip] of attempts) {
        const r = await send(body, ip);
        assert.equal(r.status, 429);
        assert.equal(r.headers.get("cache-control"), "no-store");
        bodies.push(await r.json());
      }
      assert.deepEqual(bodies[1], bodies[2]);
      assert.deepEqual(bodies[0], bodies[1]);
      assert.match(bodies[0].error, /too many applications waiting for review/);
      assert.ok(!/XG-|WhatsApp|player record/i.test(bodies[0].error));
    } finally {
      delete process.env.VERCEL;
      delete process.env.REGISTRATION_PENDING_LIMIT;
    }
  },
);

test(
  "L1: a real number-change start waits for an approval holding the number and then refuses it",
  { skip },
  async () => {
    const { executeContact } = await import("../src/lib/contact-change");
    const { randomUUID } = await import("node:crypto");
    const NUMBER = "+919833330003";
    const hash = privateData.fingerprint("whatsapp:" + NUMBER);
    const [{ contact_version }] =
      await sql`select contact_version from player where id=${victim.id}`;
    process.env.CONTACT_EDITING = "on";
    // The established-channel route needs an organizer-attested number on file.
    await sql`update player set contact_verified_at=now(),
      contact_verification_method='organizer_attested_established_channel' where id=${victim.id}`;
    let settled = false;
    let start!: Promise<unknown>;
    try {
      await sql.begin(async (tx) => {
        // The approval side: holds the number, then creates its player record.
        await contactLock.lockContactNumber(tx, hash);
        start = executeContact(
          {
            action: "contact.change_start",
            tournament: PAST,
            playerId: victim.id,
            expectedContactVersion: contact_version,
            newPhone: NUMBER,
            route: "established_channel",
            confirm: true,
            reason: "Player changed phone",
            requestId: randomUUID(),
          },
          as(admin),
        ).finally(() => {
          settled = true;
        });
        start.catch(() => {});
        await new Promise((r) => setTimeout(r, 300));
        assert.equal(settled, false, "the number change must wait for the lock");
        await tx`insert into player(gaming_name,contact_hash,contact_cipher,consent_version)
          values('Lock Holder',${hash},${privateData.encrypt(NUMBER)},'test')`;
      });
      await assert.rejects(start, rejects(409, /belongs to XG-/));
      assert.equal(
        (await sql`select 1 from contact_change where new_contact_hash=${hash}`).length,
        0,
      );
    } finally {
      delete process.env.CONTACT_EDITING;
      await sql`update player set contact_verified_at=null, contact_verification_method=null
        where id=${victim.id}`;
    }
  },
);
