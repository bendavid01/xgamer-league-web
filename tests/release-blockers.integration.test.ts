/**
 * Regression tests for the final release blockers on d47d05b:
 * 1. same-name approvals serialized across tournaments,
 * 2. the main-admin allowlist re-read after the decision's locks are held,
 * 3. no build ever applies migrations (MIGRATE_ON_BUILD ignored).
 * (4, the preflight definitions, is in registration-preflight.integration.test.ts.)
 * Disposable local database only (see tests/helpers/test-database.ts).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { testDatabaseUrl } from "./helpers/test-database";

const base = testDatabaseUrl();
const skip = !base && "TEST_DATABASE_URL not set";
const ORIGIN = "http://localhost:3000";
const ONE = "blocker-one";
const TWO = "blocker-two";
const admin = {
  id: "759756138437804052",
  name: "First Organizer",
  role: "admin" as const,
  tournaments: [],
  operations: [],
};
const otherAdmin = { ...admin, id: "759756138437804053", name: "Second" };
const replacement = "759756138437804054";
const ADMINS = `${admin.id},${otherAdmin.id}`;
const VERIFIED = {
  identityVerified: true,
  contactVerified: true,
  reason: "Verified the player in a live call on their number.",
};

let sql: ReturnType<typeof import("../src/lib/db").db>;
let databaseUrl: string;
let returning: typeof import("../src/lib/returning-registration");
let newPlayers: typeof import("../src/lib/new-player-registration");
let registration: typeof import("../src/lib/registration");
let control: typeof import("../src/lib/control");
let api: typeof import("../src/lib/api");
let access: typeof import("../src/lib/access");
let privateData: typeof import("../src/lib/private-data");
let locks: typeof import("../src/lib/contact-lock");

before(async () => {
  if (!base) return;
  const url = new URL(base);
  const name = url.pathname.slice(1) + "_blockers";
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
  databaseUrl = url.toString();
  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    PRIVATE_DATA_KEY: "be".repeat(32),
    REGISTRATION_ENABLED: "true",
    APP_ORIGIN: ORIGIN,
    MAIN_ADMIN_DISCORD_IDS: ADMINS,
  });
  sql = (await import("../src/lib/db")).db();
  returning = await import("../src/lib/returning-registration");
  newPlayers = await import("../src/lib/new-player-registration");
  registration = await import("../src/lib/registration");
  control = await import("../src/lib/control");
  api = await import("../src/lib/api");
  access = await import("../src/lib/access");
  privateData = await import("../src/lib/private-data");
  locks = await import("../src/lib/contact-lock");
  const { applyMigrations, migrationFiles } =
    await import("../src/lib/migrations");
  await applyMigrations(sql, await migrationFiles(), () => {});
  await sql`insert into tournament(id,name,status,published,format) values
    (${ONE},'Blocker One','open',true,'league'),
    (${TWO},'Blocker Two','open',true,'league')`;
});

after(async () => {
  process.env.MAIN_ADMIN_DISCORD_IDS = ADMINS;
  if (sql) await sql.end();
});

/** Mirrors api.actor(): the permission check happens before any data access. */
const as =
  (who: typeof admin) =>
  async (operation: Parameters<typeof access.allowed>[1], t: string) => {
    if (!access.allowed(who, operation, t))
      throw new api.HttpError(403, "This operation is not assigned to you.");
    return who;
  };
const rejects = (status: number, message?: RegExp) => (e: unknown) => {
  assert.equal((e as { status: number }).status, status, String(e));
  if (message) assert.match((e as Error).message, message);
  return true;
};
const code = (no: number) => "XG-" + String(no).padStart(4, "0");
let ipSeq = 0;
const apply = async (t: string, playerName: string, phone: string) =>
  (
    await registration.register(
      registration.registrationInput.parse({
        kind: "new",
        tournament: t,
        playerName,
        teamName: "Blocker Club",
        phone,
        consent: true,
        website: "",
      }),
      `203.0.113.${(++ipSeq % 250) + 1}`,
    )
  ).reference as string;
const approve = (
  t: string,
  reference: string,
  phone: string,
  who: typeof admin = admin,
  confirmedDistinctFrom?: string[],
) =>
  newPlayers.executeNewPlayerRegistration(
    {
      action: "newPlayer.approve",
      tournament: t,
      reference,
      verifiedPhone: phone,
      ...VERIFIED,
      ...(confirmedDistinctFrom ? { confirmedDistinctFrom } : {}),
    },
    as(who),
  );
const requestStatus = async (reference: string) =>
  (
    await sql<{ status: string }[]>`
      select status from new_player_registration_request where id=${reference}`
  )[0].status;
const person = async (name: string, phone: string) => {
  const [p] = await sql<{ id: string; public_no: number }[]>`
    insert into player(gaming_name,team_name,contact_hash,contact_cipher,consent_version)
    values(${name},'Blocker Club',${privateData.fingerprint("whatsapp:" + phone)},
      ${privateData.encrypt(phone)},'test') returning id,public_no`;
  return { ...p, code: code(p.public_no) };
};
/** Starts `run` and reports whether it settled while `hold` keeps a lock. */
const whileHeld = async (
  hold: (tx: postgres.TransactionSql) => Promise<unknown>,
  run: () => Promise<unknown>,
  meanwhile: (tx: postgres.TransactionSql) => Promise<unknown> = async () => {},
) => {
  let settled = false;
  let started!: Promise<unknown>;
  await sql.begin(async (tx) => {
    await hold(tx);
    started = run().finally(() => {
      settled = true;
    });
    started.catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(settled, false, "the decision must wait for the lock");
    await meanwhile(tx);
  });
  return started;
};

/* ───────────── 1. Same-name approvals across tournaments ───────────── */

test(
  "1: an approval waits for the name lock (any spelling the match check treats as equal) and then sees the other record",
  { skip },
  async () => {
    const phone = "+919870000101";
    const reference = await apply(TWO, "Twin Name", phone);
    const outcome = whileHeld(
      // Held under another spelling: NFKC, case and spacing are normalized.
      (tx) => locks.lockPlayerName(tx, "  twin   NAME "),
      () => approve(TWO, reference, phone),
      // What a concurrent approval in another tournament would have committed.
      (tx) => tx`insert into player(gaming_name,contact_hash,contact_cipher,consent_version)
        values('Twin Name',${privateData.fingerprint("whatsapp:+919870000102")},
          ${privateData.encrypt("+919870000102")},'test')`,
    );
    await assert.rejects(
      outcome,
      rejects(409, /Possible existing identity with the same name: XG-/),
    );
    assert.equal(await requestStatus(reference), "pending");
    assert.equal(
      (await sql`select 1 from player where gaming_name='Twin Name'`).length,
      1,
    );
  },
);

test(
  "1: two same-name applicants in different tournaments approved at once: exactly one without confirmation",
  { skip },
  async () => {
    for (let round = 0; round < 6; round++) {
      const name = `Race Name ${round}`;
      const phoneOne = `+91987000020${round}`;
      const phoneTwo = `+91987000030${round}`;
      const first = await apply(ONE, name, phoneOne);
      const second = await apply(TWO, name, phoneTwo);
      const results = await Promise.allSettled([
        approve(ONE, first, phoneOne, admin),
        approve(TWO, second, phoneTwo, otherAdmin),
      ]);
      const ok = results.filter((r) => r.status === "fulfilled");
      assert.equal(ok.length, 1, `round ${round}: ${JSON.stringify(results)}`);
      for (const r of results)
        if (r.status === "rejected")
          rejects(409, /Possible existing identity with the same name/)(r.reason);
      // The reviewer confirms the other person is different; then it goes through.
      const [created] = await sql<{ public_no: number }[]>`
        select public_no from player where gaming_name=${name}`;
      const waiting = (await requestStatus(first)) === "pending" ? first : second;
      const t = waiting === first ? ONE : TWO;
      const phone = waiting === first ? phoneOne : phoneTwo;
      await approve(t, waiting, phone, admin, [code(created.public_no)]);
      assert.equal(
        (await sql`select 1 from player where gaming_name=${name}`).length,
        2,
      );
    }
  },
);

test(
  "1: a gaming-name change waits for an approval holding the same name, so neither misses the other",
  { skip },
  async () => {
    const { executeEdit } = await import("../src/lib/player-details");
    const { randomUUID } = await import("node:crypto");
    const renamed = await person("Before Rename", "+919870000701");
    await sql`insert into application(tournament_id,player_id,status,team_name,team_name_source)
      values(${TWO},${renamed.id},'approved','Blocker Club','registration')`;
    const done = await whileHeld(
      // What an approval of "Renamed Twin" in another tournament holds.
      (tx) => locks.lockPlayerName(tx, "RENAMED  twin"),
      () =>
        executeEdit(
          {
            action: "player.edit_name",
            tournament: TWO,
            playerId: renamed.id,
            expected: "Before Rename",
            name: "Renamed Twin",
            reason: "Player asked for the new gaming name.",
            requestId: randomUUID(),
          },
          as(admin),
        ),
    );
    assert.equal((done as { ok: boolean }).ok, true);
    const [after] = await sql`select gaming_name from player where id=${renamed.id}`;
    assert.equal(after.gaming_name, "Renamed Twin");
  },
);

/* ───────────── 2. Admin authorization re-read after the locks ───────────── */

/**
 * Holds the tournament row the decision locks first, removes the admin from the
 * allowlist while the decision waits, then releases it.
 */
const revokedWhileWaiting = (t: string, run: () => Promise<unknown>) =>
  whileHeld(
    (tx) => tx`select 1 from tournament where id=${t} for update`,
    run,
    async () => {
      process.env.MAIN_ADMIN_DISCORD_IDS = `${replacement},${otherAdmin.id}`;
    },
  );
const auditCount = async (entity?: string) =>
  Number(
    (
      await sql<{ n: string }[]>`
        select count(*) as n from audit_event where ${entity ? sql`entity=${entity}` : sql`true`}`
    )[0].n,
  );

test(
  "2: a main admin removed while a new-player decision waits on its locks records nothing",
  { skip },
  async () => {
    const phone = "+919870000401";
    const reference = await apply(ONE, "Revoked Approval", phone);
    const players = (await sql`select 1 from player`).length;
    const audits = await auditCount();
    try {
      await assert.rejects(
        revokedWhileWaiting(ONE, () => approve(ONE, reference, phone)),
        rejects(403, /Only main admins/),
      );
    } finally {
      process.env.MAIN_ADMIN_DISCORD_IDS = ADMINS;
    }
    try {
      await assert.rejects(
        revokedWhileWaiting(ONE, () =>
          newPlayers.executeNewPlayerRegistration(
            {
              action: "newPlayer.reject",
              tournament: ONE,
              reference,
              reason: "Could not verify this applicant at all.",
            },
            as(admin),
          ),
        ),
        rejects(403, /Only main admins/),
      );
    } finally {
      process.env.MAIN_ADMIN_DISCORD_IDS = ADMINS;
    }
    assert.equal(await requestStatus(reference), "pending");
    assert.equal((await sql`select 1 from player`).length, players);
    assert.equal(await auditCount(), audits);
    // Still an admin after the same wait: the decision goes through.
    const done = await whileHeld(
      (tx) => tx`select 1 from tournament where id=${ONE} for update`,
      () => approve(ONE, reference, phone),
    );
    assert.equal((done as { ok: boolean }).ok, true);
    assert.equal(await requestStatus(reference), "approved");
  },
);

test(
  "2: the same holds for returning-player approval, rejection and manual addition",
  { skip },
  async () => {
    const phone = "+919870000501";
    const existing = await person("Returning Revoked", phone);
    await returning.submitReturningRegistration(
      returning.returningRegistrationInput.parse({
        kind: "existing",
        tournament: TWO,
        xgId: existing.code,
        teamName: "Blocker Club",
        phone,
        consent: true,
        website: "",
      }),
      "198.51.100.77",
    );
    const [request] = await sql<{ id: string }[]>`
      select id from returning_registration_request where tournament_id=${TWO} and status='pending'`;
    const audits = await auditCount();
    const attempts: (() => Promise<unknown>)[] = [
      () =>
        returning.executeReturningRegistration(
          {
            action: "returning.approve",
            tournament: TWO,
            requestId: request.id,
            verifiedPhone: phone,
            ...VERIFIED,
          },
          as(admin),
        ),
      () =>
        returning.executeReturningRegistration(
          {
            action: "returning.reject",
            tournament: TWO,
            requestId: request.id,
            reason: "Could not verify this applicant at all.",
          },
          as(admin),
        ),
      () =>
        returning.executeReturningRegistration(
          {
            action: "returning.add",
            tournament: TWO,
            xgId: existing.code,
            teamName: "Blocker Club",
            verifiedPhone: phone,
            ...VERIFIED,
          },
          as(admin),
        ),
    ];
    for (const attempt of attempts)
      try {
        await assert.rejects(
          revokedWhileWaiting(TWO, attempt),
          rejects(403, /Only main admins/),
        );
      } finally {
        process.env.MAIN_ADMIN_DISCORD_IDS = ADMINS;
      }
    const [still] = await sql<{ status: string }[]>`
      select status from returning_registration_request where id=${request.id}`;
    assert.equal(still.status, "pending");
    assert.equal(
      (await sql`select 1 from application where player_id=${existing.id}`).length,
      0,
    );
    assert.equal(await auditCount(), audits);
  },
);

test(
  "2: the bulk review re-reads the allowlist after locking every entry",
  { skip },
  async () => {
    const pending = await person("Bulk Revoked", "+919870000601");
    const [entry] = await sql<{ id: string; revision: number }[]>`
      insert into application(tournament_id,player_id,status) values(${ONE},${pending.id},'pending')
      returning id,revision`;
    const review = (items: { id: string; revision: number }[]) =>
      control.execute(
        {
          action: "review",
          tournament: ONE,
          items,
          status: "approved",
          verified: true,
          reason: "Verified the player in a live call on their number.",
        },
        as(admin),
      );
    const audits = await auditCount();
    try {
      // Held on the entry itself: the review has already passed its check made
      // right after the tournament lock, and must check again once it has the row.
      await assert.rejects(
        whileHeld(
          (tx) => tx`select 1 from application where id=${entry.id} for update`,
          () => review([entry]),
          async () => {
            process.env.MAIN_ADMIN_DISCORD_IDS = `${replacement},${otherAdmin.id}`;
          },
        ),
        rejects(403, /Only main admins/),
      );
    } finally {
      process.env.MAIN_ADMIN_DISCORD_IDS = ADMINS;
    }
    const [after] = await sql<{ status: string; revision: number }[]>`
      select status,revision from application where id=${entry.id}`;
    assert.deepEqual(after, { status: "pending", revision: entry.revision });
    assert.equal(await auditCount(), audits);
    // Locking first never lets a repeated entry through twice.
    await assert.rejects(review([entry, entry]), rejects(409, /changed meanwhile/));
    await review([entry]);
    const [approved] = await sql<{ status: string; revision: number }[]>`
      select status,revision from application where id=${entry.id}`;
    assert.deepEqual(approved, { status: "approved", revision: entry.revision + 1 });
  },
);

/* ───────────── 3. Builds never apply migrations ───────────── */

test(
  "3: a Vercel build with MIGRATE_ON_BUILD=true changes nothing and stops on the missing schema",
  { skip },
  async () => {
    const url = new URL(base!);
    const name = url.pathname.slice(1) + "_build";
    if (!/^[a-z0-9_]{1,50}$/.test(name))
      throw new Error("Unsafe test database name.");
    const setup = postgres(base!, { ssl: false, max: 1, onnotice: () => {} });
    try {
      await setup`drop database if exists ${setup(name)} with (force)`;
      await setup`create database ${setup(name)}`;
    } finally {
      await setup.end();
    }
    url.pathname = "/" + name;
    const target = postgres(url.toString(), { ssl: false, max: 1, onnotice: () => {} });
    try {
      const { applyMigrations, migrationFiles } =
        await import("../src/lib/migrations");
      // Production today: 001–005 applied, the registration packet pending.
      await applyMigrations(
        target as never,
        (await migrationFiles()).filter((f) => f.name < "006"),
        () => {},
      );
      const snapshot = async () => ({
        ledger: (await target`select name,hash,applied_at from xgamer_migration order by name`).map(
          (r) => ({ ...r }),
        ),
        tables: (
          await target`select table_name from information_schema.tables
            where table_schema='public' order by 1`
        ).map((r) => r.table_name),
      });
      const before = await snapshot();
      const cli = fileURLToPath(
        new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url),
      );
      const build = (env: Record<string, string>) =>
        spawnSync(process.execPath, [cli, "scripts/build-migrate.mts"], {
          cwd: fileURLToPath(new URL("..", import.meta.url)),
          encoding: "utf8",
          timeout: 120_000,
          env: {
            NODE_ENV: "production",
            PATH: process.env.PATH ?? "",
            SystemRoot: process.env.SystemRoot ?? "",
            DATABASE_URL: url.toString(),
            DATABASE_SSL: "disable",
            MIGRATE_ON_BUILD: "true",
            ...env,
          },
        });
      const production = build({ VERCEL: "1", VERCEL_ENV: "production" });
      assert.equal(production.status, 1, production.stdout + production.stderr);
      assert.match(production.stderr, /MIGRATE_ON_BUILD is set but ignored/);
      assert.match(production.stderr, /missing migration\(s\) 007_application_team_name/);
      assert.doesNotMatch(production.stdout + production.stderr, /Applied 0/);
      const preview = build({ VERCEL: "1", VERCEL_ENV: "preview" });
      assert.equal(preview.status, 0, preview.stdout + preview.stderr);
      assert.match(preview.stdout, /preview build — no database access/);
      // Outside Vercel the variable is ignored too.
      const local = build({});
      assert.equal(local.status, 1, local.stdout + local.stderr);
      assert.deepEqual(await snapshot(), before);
      assert.equal(before.ledger.length, 5);
      assert.ok(!before.tables.includes("contact_change"));
    } finally {
      await target.end();
    }
  },
);
