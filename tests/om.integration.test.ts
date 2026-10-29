/**
 * Full organizer flow against a real PostgreSQL server.
 * Runs only when TEST_DATABASE_URL points at a disposable LOCAL database, e.g.
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres DATABASE_SSL=disable npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const url = process.env.TEST_DATABASE_URL;
// WHY: this test wipes its database. Refuse anything that is not a local server.
if (url && !/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(url))
  throw new Error(
    "TEST_DATABASE_URL must point at a local disposable database.",
  );
const skip = !url && "TEST_DATABASE_URL not set";
if (url) {
  process.env.DATABASE_URL = url;
  process.env.PRIVATE_DATA_KEY = "ab".repeat(32);
  process.env.REGISTRATION_ENABLED = "true";
  process.env.APP_ORIGIN = "http://localhost:3000";
}

type Control = typeof import("../src/lib/control");
let run: Control["run"], sql: ReturnType<typeof import("../src/lib/db").db>;
let register: typeof import("../src/lib/registration").register;
let openTournaments: typeof import("../src/lib/registration").openTournaments;
let getTournament: typeof import("../src/lib/tournaments").getTournament;
let listTournaments: typeof import("../src/lib/tournaments").listTournaments;
const admin = {
  id: "759756138437804042",
  role: "admin" as const,
  name: "David",
};

before(async () => {
  if (!url) return;
  ({ run } = await import("../src/lib/control"));
  ({ register, openTournaments } = await import("../src/lib/registration"));
  ({ getTournament, listTournaments } = await import("../src/lib/tournaments"));
  sql = (await import("../src/lib/db")).db();
  await sql.unsafe("drop schema public cascade; create schema public;");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort())
    await sql.unsafe(await readFile(new URL(f, dir), "utf8"));
});
after(async () => {
  if (url) await sql.end();
});

const cmd = (c: Record<string, unknown>) =>
  run(admin, c as Parameters<Control["run"]>[1]);
const tour = async (id: string) =>
  (await sql`select * from tournament where id=${id}`)[0];
const apps = (t: string) =>
  sql`select a.id,a.revision,a.status,p.id as player_id,p.gaming_name from application a join player p on p.id=a.player_id where a.tournament_id=${t} and a.deleted_at is null order by p.gaming_name`;
const join = (t: string, i: number, ip = `10.0.${i}.1`) =>
  register(
    {
      playerName: `P${i}`,
      teamName: `Team ${i}`,
      phone: `98000000${String(i).padStart(2, "0")}`,
      consent: true,
      website: "",
      tournament: t,
    },
    ip,
  );
async function configure(t: string, patch: Record<string, unknown>) {
  const row = await tour(t);
  return cmd({
    action: "configure",
    tournament: t,
    revision: row.revision,
    name: row.name,
    format: row.format,
    knockout: row.knockout,
    qualifiers: row.qualifiers,
    legs: row.legs,
    perPlayer: row.opponents,
    startsOn: null,
    registrationCloses: null,
    entryFee: null,
    prize: null,
    description: null,
    ...patch,
  });
}

test(
  "two tournaments side by side: create, register, approve, home & away league, Top 4, completed",
  { skip },
  async () => {
    const cup = (await cmd({
      action: "create",
      name: "November Cup",
      format: "league",
    })) as { id: string };
    const night = (await cmd({
      action: "create",
      name: "Knockout Night",
      format: "knockout",
    })) as { id: string };
    assert.match(cup.id, /^november-cup-[0-9a-f]{4}$/);
    assert.equal((await tour(cup.id)).status, "draft");

    await configure(cup.id, {
      legs: 2,
      knockout: true,
      qualifiers: 4,
      entryFee: 0,
      prize: "₹5,000",
      startsOn: "2026-11-21",
      registrationCloses: "2026-11-18T21:00:00+05:30",
    });
    await assert.rejects(() => join(cup.id, 1), /closed/);
    await cmd({ action: "registration", tournament: cup.id, open: true });
    await cmd({ action: "registration", tournament: night.id, open: true });
    const open = await openTournaments();
    assert.deepEqual(open.map((t) => t.name).sort(), [
      "Knockout Night",
      "November Cup",
    ]);
    assert.equal(open.find((t) => t.id === cup.id)!.prize, "₹5,000");

    for (let i = 0; i < 7; i++) await join(cup.id, i);
    await assert.rejects(
      () => join(cup.id, 3, "10.9.9.9"),
      /already registered/,
    );
    // Same phone can join a different tournament and keeps the same player ID.
    const again = await join(night.id, 3, "10.9.9.8");
    assert.equal(again.code, "XG-0004");
    for (let i = 10; i < 14; i++) await join(night.id, i);

    const all = await apps(cup.id);
    await assert.rejects(
      () =>
        cmd({
          action: "review",
          tournament: cup.id,
          status: "approved",
          verified: false,
          items: [{ id: all[0].id, revision: all[0].revision }],
        }),
      /verified/,
    );
    await cmd({
      action: "review",
      tournament: cup.id,
      status: "approved",
      verified: true,
      items: all.map(({ id, revision }) => ({ id, revision })),
    });
    // Remove one approved player.
    const p6 = (await apps(cup.id)).find((a) => a.gaming_name === "P6")!;
    await cmd({
      action: "remove",
      tournament: cup.id,
      id: p6.id,
      revision: p6.revision,
    });
    assert.equal((await apps(cup.id)).length, 6);

    // eFootball ID is optional: generate works without any.
    await cmd({ action: "registration", tournament: cup.id, open: false });
    await cmd({ action: "generate", tournament: cup.id, shuffle: true });
    const fixtures =
      await sql`select * from fixture where tournament_id=${cup.id}`;
    assert.equal(fixtures.length, 30, "6 players, home & away = 30 matches");
    assert.equal(
      (
        await sql`select count(*)::int as n from fixture where tournament_id=${night.id}`
      )[0].n,
      0,
      "other tournament untouched",
    );
    // Player changes are locked now; settings that shape fixtures too.
    const p0 = (await apps(cup.id))[0];
    await assert.rejects(
      () =>
        cmd({
          action: "remove",
          tournament: cup.id,
          id: p0.id,
          revision: p0.revision,
        }),
      /Reset fixtures/,
    );
    await assert.rejects(() => configure(cup.id, { legs: 1 }), /locked/);
    await configure(cup.id, {
      name: "XGamer November Cup",
      legs: 2,
      knockout: true,
      qualifiers: 4,
    }); // rename is fine
    // eFootball IDs can be added after fixtures exist.
    await cmd({
      action: "efootball",
      tournament: cup.id,
      playerId: p0.player_id,
      efootballId: "XG-1000",
    });

    // Public data: no private fields, the other tournament's players are separate.
    const pub = await getTournament(cup.id);
    assert.equal(pub!.players.length, 6);
    const json = JSON.stringify(pub);
    assert(
      !json.includes("+91") && !json.includes("XG-1000"),
      "no phone numbers or eFootball IDs in public data",
    );
    assert.deepEqual(
      (await listTournaments())!.active.map((t) => t.name).sort(),
      ["Knockout Night", "XGamer November Cup"],
    );

    const players = (await apps(cup.id)).map((a) => a.player_id);
    const rank = (id: string) => players.indexOf(id);
    for (const f of fixtures)
      await cmd({
        action: "score",
        tournament: cup.id,
        id: f.id,
        revision: f.revision,
        homeScore: rank(f.home) < rank(f.away) ? 2 : 0,
        awayScore: rank(f.home) < rank(f.away) ? 0 : 2,
      });
    await assert.rejects(
      () => cmd({ action: "reset", tournament: cup.id }),
      /no longer be reset/,
    );
    await assert.rejects(
      () => cmd({ action: "complete", tournament: cup.id }),
      /qualifiers first/,
    );
    await cmd({ action: "qualify", tournament: cup.id });
    assert.equal((await tour(cup.id)).status, "knockout");
    const q =
      await sql`select player_id from qualification where tournament_id=${cup.id} order by rank`;
    assert.deepEqual(
      q.map((r) => r.player_id),
      players.slice(0, 4),
    );
    await assert.rejects(
      () =>
        cmd({
          action: "score",
          tournament: cup.id,
          id: fixtures[0].id,
          revision: 1,
          homeScore: 0,
          awayScore: 0,
        }),
      /frozen|changed/,
    );
    await cmd({ action: "complete", tournament: cup.id });
    assert.equal((await tour(cup.id)).status, "completed");
    assert.deepEqual(
      (await listTournaments())!.past.map((t) => t.name),
      ["XGamer November Cup"],
    );

    // Knockout-only: no fixtures, start then complete.
    const nightApps = await apps(night.id);
    await cmd({
      action: "review",
      tournament: night.id,
      status: "approved",
      verified: true,
      items: nightApps.map(({ id, revision }) => ({ id, revision })),
    });
    await assert.rejects(
      () => cmd({ action: "generate", tournament: night.id, shuffle: true }),
      /eFootball app/,
    );
    await cmd({ action: "registration", tournament: night.id, open: false });
    await cmd({ action: "start", tournament: night.id });
    await cmd({ action: "complete", tournament: night.id });
    assert.equal((await tour(night.id)).status, "completed");

    // Activity log is readable: names, roles, plain summaries, affected players; no phone numbers.
    const log =
      await sql`select actor_name,actor_role,summary,affected,tournament_id from audit_event order by id`;
    const reg = log.find((l) => l.summary === "Registered")!;
    assert.equal(reg.actor_role, "player");
    assert.match(reg.affected, /^XG-\d{4}$/);
    const approve = log.find((l) => l.summary === "Approved")!;
    assert.equal(approve.actor_name, "David");
    assert.match(approve.affected, /P0, P1/);
    assert(
      log.some(
        (l) =>
          l.summary === "Removed player from tournament" && l.affected === "P6",
      ),
    );
    assert(
      log.some(
        (l) =>
          l.summary === "Entered score" && /P\d \d–\d P\d/.test(l.affected),
      ),
    );
    assert(
      log.some(
        (l) => l.summary === "Added eFootball ID" && l.affected === "P0",
      ),
    );
    assert(!JSON.stringify(log).includes("+91"));
    await assert.rejects(() => sql`delete from audit_event`, /immutable/);
  },
);

test("matches-per-player and odd fields", { skip }, async () => {
  const t = (await cmd({
    action: "create",
    name: "Odd League",
    format: "league",
  })) as { id: string };
  await configure(t.id, { perPlayer: 4 });
  await cmd({ action: "registration", tournament: t.id, open: true });
  for (let i = 20; i < 29; i++) await join(t.id, i, `10.1.${i}.1`);
  const all = await apps(t.id);
  await cmd({
    action: "review",
    tournament: t.id,
    status: "approved",
    verified: true,
    items: all.map(({ id, revision }) => ({ id, revision })),
  });
  await cmd({ action: "registration", tournament: t.id, open: false });
  await cmd({ action: "generate", tournament: t.id, shuffle: true });
  const f =
    await sql`select home,away,round from fixture where tournament_id=${t.id}`;
  assert.equal(f.length, 18, "9 players × 4 matches / 2");
  const games = new Map<string, number>();
  for (const m of f)
    for (const p of [m.home, m.away]) games.set(p, (games.get(p) ?? 0) + 1);
  assert([...games.values()].every((n) => n === 4));
});
