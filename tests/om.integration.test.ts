/**
 * Full organizer flow against a real PostgreSQL server.
 * Runs only when TEST_DATABASE_URL points at a disposable LOCAL database, e.g.
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres DATABASE_SSL=disable npm test
 * CI sets REQUIRE_DATABASE_TESTS=1, so there a missing database fails instead of skipping.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { testDatabaseUrl } from "./helpers/test-database";

// WHY: this test wipes its database. Refuse anything that is not a local server.
const url = testDatabaseUrl();
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
let getChampions: typeof import("../src/lib/tournaments").getChampions;
let getProfile: typeof import("../src/lib/profile").getProfile;
const admin = {
  id: "759756138437804042",
  role: "admin" as const,
  name: "David",
};

before(async () => {
  if (!url) return;
  ({ run } = await import("../src/lib/control"));
  ({ register, openTournaments } = await import("../src/lib/registration"));
  ({ getTournament, listTournaments, getChampions } =
    await import("../src/lib/tournaments"));
  ({ getProfile } = await import("../src/lib/profile"));
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
const asAdmin = async () => ({ ...admin, operations: [], tournaments: [] });
const newOpenCup = async (name: string) => {
  const { id } = (await cmd({
    action: "create",
    name,
    format: "league",
    season: null,
    published: true,
  })) as { id: string };
  await cmd({ action: "registration", tournament: id, open: true });
  return id;
};
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
    name: row.competition ?? row.name,
    season: row.season,
    published: row.published,
    format:
      row.format === "knockout"
        ? "knockout"
        : row.knockout
          ? "league_knockout"
          : "league",
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
      season: null,
      published: false,
    })) as { id: string };
    const night = (await cmd({
      action: "create",
      name: "Knockout Night",
      format: "knockout",
      season: null,
      published: false,
    })) as { id: string };
    assert.match(cup.id, /^november-cup-[0-9a-f]{4}$/);
    assert.equal((await tour(cup.id)).status, "draft");

    await configure(cup.id, {
      legs: 2,
      format: "league_knockout",
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
      /Registration needs organizer review/,
    );
    await assert.rejects(
      () => join(night.id, 3, "10.9.9.8"),
      /Registration needs organizer review/,
    );
    for (let i = 10; i < 15; i++) await join(night.id, i);

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
      format: "league_knockout",
      qualifiers: 4,
    }); // rename is fine
    // eFootball IDs can be added after fixtures exist.
    const { executeEdit, playerDetails } =
      await import("../src/lib/player-details");
    const { player } = await playerDetails(cup.id, p0.player_id, asAdmin);
    assert.equal(player.code, "XG-0001");
    await executeEdit(
      {
        action: "player.edit_efootball",
        tournament: cup.id,
        playerId: p0.player_id,
        expectedVersion: player.efootballVersion,
        efootballId: "XG-1000",
        reason: "Added the verified game ID",
        requestId: randomUUID(),
      },
      asAdmin,
    );

    // Public data: no private fields, the other tournament's players are separate.
    const pub = await getTournament(cup.id);
    assert.equal(pub!.players.length, 6);
    const json = JSON.stringify(pub);
    assert(
      !json.includes("+91") && !json.includes("XG-1000"),
      "no phone numbers or eFootball IDs in public data",
    );
    assert.deepEqual(
      (await listTournaments())!.live.map((t) => t.name).sort(),
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
        (l) => l.summary === "Added eFootball ID" && l.affected === player.code,
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
    season: null,
    published: true,
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

test(
  "seasons, publish, run again, final positions, delete & restore, career profile",
  { skip },
  async () => {
    const s1 = (await cmd({
      action: "create",
      name: "Pro League",
      format: "league",
      season: 1,
      published: false,
    })) as { id: string };
    await assert.rejects(
      () =>
        cmd({
          action: "create",
          name: "pro league",
          format: "league",
          season: 1,
          published: false,
        }),
      /already has a Season 1/,
    );
    // Unpublished: not on the website, and nobody can register.
    assert(
      !JSON.stringify(await listTournaments()).includes(s1.id),
      "unpublished tournaments stay private",
    );
    await configure(s1.id, { published: true });
    assert.equal(
      (await listTournaments())!.upcoming.find((t) => t.id === s1.id)!.label,
      "Pro League · Season 1",
    );
    await cmd({ action: "registration", tournament: s1.id, open: true });
    for (let i = 40; i < 44; i++) await join(s1.id, i, `10.4.${i}.1`);
    const all = await apps(s1.id);
    await cmd({
      action: "review",
      tournament: s1.id,
      status: "approved",
      verified: true,
      items: all.map(({ id, revision }) => ({ id, revision })),
    });
    await cmd({ action: "registration", tournament: s1.id, open: false });
    await cmd({ action: "generate", tournament: s1.id, shuffle: false });
    const order = (await apps(s1.id)).map((a) => a.player_id); // P40..P43 by name
    const f = await sql`select * from fixture where tournament_id=${s1.id}`;
    for (const m of f)
      await cmd({
        action: "score",
        tournament: s1.id,
        id: m.id,
        revision: m.revision,
        homeScore: order.indexOf(m.home) < order.indexOf(m.away) ? 3 : 1,
        awayScore: order.indexOf(m.home) < order.indexOf(m.away) ? 1 : 3,
      });
    // League only: the table only PROPOSES the podium; an organizer must confirm it.
    await assert.rejects(
      () => cmd({ action: "complete", tournament: s1.id }),
      /Confirm the final positions/,
    );
    await assert.rejects(
      () =>
        cmd({
          action: "complete",
          tournament: s1.id,
          podium: [order[0], order[0], null],
        }),
      /one place/,
    );
    assert.equal((await tour(s1.id)).status, "league", "nothing changed");
    await cmd({
      action: "complete",
      tournament: s1.id,
      podium: order.slice(0, 3),
    });
    const confirmLog =
      await sql`select summary, after_value from audit_event where tournament_id=${s1.id} and action='complete'`;
    assert.equal(
      confirmLog[0].summary,
      "Finished league and confirmed final positions",
    );
    assert.equal(confirmLog[0].after_value.sameAsTable, true);
    const podium =
      await sql`select place,player_id from podium where tournament_id=${s1.id} order by place`;
    assert.deepEqual(
      podium.map((p) => p.player_id),
      order.slice(0, 3),
    );
    const champs = await getChampions();
    const c = champs.find((x) => x.id === s1.id)!;
    assert.equal(c.places[0].name, "P40");
    assert.equal(c.label, "Pro League · Season 1");

    // Run again as Season 2: same settings, season number editable.
    await assert.rejects(
      () =>
        cmd({
          action: "rerun",
          tournament: s1.id,
          name: "Pro League",
          season: 1,
          published: false,
        }),
      /already has a Season 1/,
    );
    const s2 = (await cmd({
      action: "rerun",
      tournament: s1.id,
      name: "Pro League",
      season: 2,
      published: true,
    })) as { id: string };
    const row = await tour(s2.id);
    assert.equal(row.season, 2);
    assert.equal(row.status, "draft");
    assert.equal(row.legs, (await tour(s1.id)).legs);

    // A one-off cup run again becomes Season 1, the new one Season 2.
    const night = (
      await sql`select id from tournament where name='Knockout Night'`
    )[0].id;
    const k2 = (await cmd({
      action: "rerun",
      tournament: night,
      name: "Knockout Night",
      season: 2,
      published: false,
    })) as { id: string };
    assert.equal((await tour(night)).season, 1);
    assert.equal((await tour(k2.id)).format, "knockout");

    // Updates appear on the website, newest first.
    await cmd({
      action: "announce",
      tournament: night,
      title: "Draw is out",
      message: "Check the app.",
    });
    await cmd({
      action: "announce",
      tournament: night,
      title: "Final tonight",
      message: "9 pm IST.",
    });
    const pubNight = await getTournament(night);
    assert.deepEqual(
      pubNight!.updates.map((u) => u.title),
      ["Final tonight", "Draw is out"],
    );

    // Knockout: final positions entered by an admin.
    const nightApps = await apps(night);
    await cmd({
      action: "podium",
      tournament: night,
      places: [nightApps[2].player_id, nightApps[0].player_id, null],
    });
    await assert.rejects(
      () =>
        cmd({
          action: "podium",
          tournament: night,
          places: [nightApps[0].player_id, nightApps[0].player_id, null],
        }),
      /one place/,
    );

    // Career profile by permanent ID; no private data.
    const winner = (
      await sql`select public_no from player where gaming_name='P40'`
    )[0].public_no;
    const profile = (await getProfile(
      `XG-${String(winner).padStart(4, "0")}`,
    ))!;
    assert.equal(profile.trophies.gold, 1);
    assert.equal(profile.totals.matches, 3);
    assert.equal(profile.totals.won, 3);
    assert.equal(profile.totals.best, 1);
    assert.equal(profile.career[0].podium, 1);
    assert.equal(profile.form.join(""), "WWW");
    assert(!JSON.stringify(profile).includes("+91"));

    // Data health: read-only report, no private data.
    const { healthReport } = await import("../src/lib/health");
    const before = await sql`select count(*)::int n from audit_event`;
    const report = JSON.stringify(await healthReport());
    assert.match(report, /Permanent player IDs/);
    assert(!report.includes("+91"), "no phone numbers in the health report");
    assert.deepEqual(
      (await sql`select count(*)::int n from audit_event`)[0].n,
      before[0].n,
      "health report writes nothing",
    );
    // Tournament Champions data: podium official only once completed.
    const { getChampionsTournament } = await import("../src/lib/champions");
    const champ = (await getChampionsTournament(s1.id))!;
    assert.equal(champ.official, true);
    assert.equal(champ.status[order[0]], "Champion");
    const live = (await getChampionsTournament(s2.id))!;
    assert.equal(
      live.official,
      false,
      "no podium for an unfinished tournament",
    );

    // Delete (type the name), hidden everywhere, then restore.
    await assert.rejects(
      () =>
        cmd({
          action: "delete_tournament",
          tournament: s2.id,
          confirm: "nope",
        }),
      /exactly/,
    );
    await assert.rejects(
      () =>
        run(
          { id: "123456789012345678", role: "coordinator" },
          {
            action: "delete_tournament",
            tournament: s2.id,
            confirm: "Pro League · Season 2",
          },
        ),
      /Only admins/,
    );
    await cmd({
      action: "delete_tournament",
      tournament: s2.id,
      confirm: "pro league · season 2",
    });
    assert(!JSON.stringify(await listTournaments()).includes(s2.id));
    await cmd({ action: "restore_tournament", tournament: s2.id });
    assert.equal((await tour(s2.id)).deleted_at, null);
    const log =
      await sql`select summary from audit_event where tournament_id=${s2.id} order by id`;
    assert.deepEqual(log.map((l) => l.summary).slice(-2), [
      "Deleted tournament",
      "Restored tournament",
    ]);
  },
);

test(
  "team names stay with each tournament; the player ID never changes",
  { skip },
  async () => {
    const ids: string[] = [];
    for (const name of ["Team Cup One", "Team Cup Two", "Team Cup Three"]) {
      const t = (await cmd({
        action: "create",
        name,
        format: "league",
        season: null,
        published: true,
      })) as { id: string };
      await cmd({ action: "registration", tournament: t.id, open: true });
      ids.push(t.id);
    }
    const teams = ["Real Madrid", "Barcelona", "Arsenal"];
    const { playerId, code } = await register(
      {
        playerName: "Seven",
        teamName: teams[0],
        phone: "9811100077",
        consent: true,
        website: "",
        tournament: ids[0],
      },
      "10.77.0.1",
    );
    // Model the entries and audit records made by the earlier registration system.
    for (let i = 1; i < ids.length; i++) {
      const [entry] = await sql`
        insert into application(tournament_id,player_id,status,team_name,team_name_source)
        values(${ids[i]},${playerId},'pending',${teams[i]},'registration') returning id`;
      await sql`insert into audit_event(actor,action,entity,tournament_id,after_value)
        values(${"player:" + playerId},'application.create',${entry.id},${ids[i]},
          ${sql.json({ playerId, team: teams[i], status: "pending" })})`;
    }
    const { executeEdit } = await import("../src/lib/player-details");
    await executeEdit(
      {
        action: "player.edit_team",
        tournament: ids[0],
        playerId,
        expected: teams[0],
        team: teams[2],
        reason: "Club confirmed in the latest entry",
        requestId: randomUUID(),
      },
      asAdmin,
    );
    for (const t of ids) {
      const mine = (await apps(t)).filter((a) => a.player_id === playerId);
      await cmd({
        action: "review",
        tournament: t,
        status: "approved",
        verified: true,
        items: mine.map(({ id, revision }) => ({ id, revision })),
      });
    }
    const shown = async (t: string) =>
      (await getTournament(t))!.players.find((p) => p.code === code)!.team;
    // Rollout default (TEAM_DISPLAY=current): the public site shows the current
    // team everywhere, exactly as before 007.
    for (const t of ids) assert.equal(await shown(t), "Arsenal");
    let profile = (await getProfile(code))!;
    assert.equal(profile.player.team, "Arsenal"); // current team
    assert.ok(profile.career.every((c) => c.team === null));
    // TEAM_DISPLAY=entry: each tournament shows its own stored team.
    process.env.TEAM_DISPLAY = "entry";
    try {
      for (const [i, t] of ids.entries())
        assert.equal(await shown(t), teams[i]);
      profile = (await getProfile(code))!;
      assert.equal(profile.player.team, "Arsenal");
      for (const [i, t] of ids.entries())
        assert.equal(profile.career.find((c) => c.id === t)!.team, teams[i]);
    } finally {
      delete process.env.TEAM_DISPLAY;
    }
    const stored =
      await sql`select player_id,team_name_source from application where player_id=${playerId}`;
    assert.ok(
      stored.length === 3 &&
        stored.every(
          (r) =>
            r.player_id === playerId && r.team_name_source === "registration",
        ),
    );
  },
);

test(
  "public registration protects active and retired identities with the same generic response",
  { skip },
  async () => {
    const { POST } = await import("../src/app/api/registrations/route");
    const originalCup = await newOpenCup("Registration Security");
    const otherCup = await newOpenCup("Registration Test Cup");
    const current = await join(originalCup, 86);
    const retired = await join(originalCup, 87);
    await sql`update player set deleted_at=now() where id=${retired.playerId}`;
    const readState = async () => ({
      players: await sql`select * from player order by id`,
      entries: await sql`select * from application order by id`,
      audit: await sql`select * from audit_event order by id`,
      seq: await sql`select last_value from player_public_no_seq`,
    });
    const previous = await readState();
    const send = (phone: string, tournament = otherCup) =>
      POST(
        new Request("http://localhost:3000/api/registrations", {
          method: "POST",
          headers: {
            origin: "http://localhost:3000",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            phone,
            tournament,
            consent: true,
            website: "",
            playerName: "Impostor",
            teamName: "Other Team",
          }),
        }),
      );
    for (const [phone, tournament] of [
      ["09800000086", otherCup],
      ["+91 9800000086", originalCup],
      ["980-000-0087", otherCup],
    ]) {
      const response = await send(phone, tournament);
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        error:
          "Registration needs organizer review. Contact an organizer to continue.",
      });
    }
    assert.deepEqual(await readState(), previous);

    process.env.REGISTRATION_ENABLED = "false";
    try {
      const closed = await send("9800000088");
      assert.equal(closed.status, 503);
      assert.deepEqual(await readState(), previous);
    } finally {
      process.env.REGISTRATION_ENABLED = "true";
    }
    assert.notEqual(current.code, retired.code);
  },
);

test(
  "simultaneous public registrations create one identity, entry, and audit row",
  { skip },
  async () => {
    const cups = [
      await newOpenCup("Concurrent Cup A"),
      await newOpenCup("Concurrent Cup B"),
    ];
    const input = {
      phone: "9800000088",
      consent: true as const,
      website: "",
      playerName: "New Player １２３４５６",
      teamName: "Team 98000_00088",
    };
    const results = await Promise.allSettled(
      cups.map((tournament, i) =>
        register({ ...input, tournament }, `10.88.0.${i + 1}`),
      ),
    );
    const passed = results.filter((r) => r.status === "fulfilled");
    assert.equal(passed.length, 1);
    const failed = results.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    assert.equal(failed.reason.status, 409);
    assert.match(failed.reason.message, /^Registration needs organizer review/);
    const player = passed[0].value;
    const players =
      await sql`select id from player where gaming_name=${input.playerName}`;
    const entries =
      await sql`select * from application where tournament_id=any(${cups})`;
    assert.deepEqual([...players], [{ id: player.playerId }]);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].player_id, player.playerId);
    assert.equal(entries[0].status, "pending");
    assert.equal(entries[0].team_name, input.teamName);
    const registered =
      await sql`select actor_name, affected, after_value from audit_event
    where tournament_id=any(${cups}) and action='application.create'`;
    assert.deepEqual(
      [...registered],
      [
        {
          actor_name: "[REDACTED]",
          affected: player.code,
          after_value: {
            status: "pending",
            playerId: player.playerId,
            team: null,
          },
        },
      ],
    );
  },
);

test(
  "tournament history stays intact when a player is retired or a recorded entry is withdrawn",
  { skip },
  async () => {
    const { getChampionsTournament } = await import("../src/lib/champions");
    const { snapshot } = await import("../src/lib/control");
    const { getRecords } = await import("../src/lib/records");
    const tournament = await newOpenCup("Historical Results Test");
    const [retired, withdrawn, active, rejected, absent] = await Promise.all(
      [90, 91, 92, 93, 94].map((i) => join(tournament, i)),
    );
    const ids = [
      retired.playerId,
      withdrawn.playerId,
      active.playerId,
      absent.playerId,
    ];
    await sql`update application set status='approved' where player_id=any(${ids})`;
    await sql`update application set status='rejected' where player_id=${rejected.playerId}`;
    await sql`update player set deleted_at=now() where id=${absent.playerId}`;
    await sql`update tournament set status='completed' where id=${tournament}`;
    await sql`insert into fixture(tournament_id,stage,round,slot,home,away,home_score,away_score)
    values(${tournament},'league',1,1,${retired.playerId},${withdrawn.playerId},3,1),
      (${tournament},'league',2,1,${withdrawn.playerId},${active.playerId},2,0),
      (${tournament},'league',3,1,${active.playerId},${retired.playerId},null,null)`;
    await sql`insert into qualification(tournament_id,player_id,rank)
    values(${tournament},${retired.playerId},1)`;
    await sql`insert into podium(tournament_id,player_id,place)
    values(${tournament},${withdrawn.playerId},1)`;
    const history = async () => ({
      ids: await sql`select id, public_no from player order by id`,
      entries:
        await sql`select id, player_id, team_name, team_name_source from application
      where tournament_id=${tournament} order by id`,
      matches:
        await sql`select * from fixture where tournament_id=${tournament} order by round`,
      qualifications:
        await sql`select * from qualification where tournament_id=${tournament}`,
      podium: await sql`select * from podium where tournament_id=${tournament}`,
      audit: await sql`select * from audit_event order by id`,
    });
    const publicHistory = async () => ({
      tournament: await getTournament(tournament),
      championsDetail: await getChampionsTournament(tournament),
      championsShelf: (await getChampions()).find(
        (item) => item.id === tournament,
      ),
      records: await getRecords(),
    });
    process.env.TEAM_DISPLAY = "entry";
    try {
      const originalRows = await history();
      const before = await publicHistory();
      assert.equal(before.tournament?.fixtures.length, 3);
      assert.equal(before.championsDetail?.records.matches, 2);
      assert.equal(
        before.championsDetail?.records.lines[retired.playerId].gf,
        3,
      );
      assert.equal(before.championsShelf?.places[0]?.team, "Team 91");
      assert.equal(
        before.records?.players.find((p) => p.id === retired.playerId)?.ranking,
        4,
      );
      assert.equal(
        before.records?.players.find((p) => p.id === withdrawn.playerId)
          ?.ranking,
        11,
      );
      const careerBefore = await getProfile(withdrawn.code);
      const opponentsBefore = (await getProfile(active.code))?.history;

      await sql`update player set deleted_at=now() where id=${retired.playerId}`;
      await sql`update application set status='withdrawn',deleted_at=now()
      where tournament_id=${tournament} and player_id=${withdrawn.playerId}`;
      const after = await publicHistory();
      assert.deepEqual(after, before);
      assert.deepEqual(await history(), originalRows);
      assert.deepEqual(await getProfile(withdrawn.code), careerBefore);
      assert.deepEqual(
        (await getProfile(active.code))?.history,
        opponentsBefore,
      );
      const retiredCareer = await getProfile(retired.code);
      assert.equal(retiredCareer?.player.code, retired.code);
      assert.equal(retiredCareer?.player.team, null);
      assert.equal(retiredCareer?.player.since, null);
      assert.equal(retiredCareer?.history[0]?.opponent.code, withdrawn.code);
      assert.equal(await getProfile(absent.code), null);
      assert.ok(
        !after.tournament?.players.some((p) =>
          [absent.code, rejected.code].includes(p.code),
        ),
      );
      const organizer = await snapshot(tournament, asAdmin);
      assert.deepEqual(
        organizer.standings.map((r) => [r.id, r.pts]),
        [
          [retired.playerId, 3],
          [withdrawn.playerId, 3],
          [active.playerId, 0],
        ],
      );
      assert.deepEqual(
        organizer.applications.map((a) => a.player_id).sort(),
        [active.playerId, rejected.playerId].sort(),
      );
    } finally {
      delete process.env.TEAM_DISPLAY;
    }
  },
);

test(
  "a wrong migration 006 checksum blocks the runner before any pending SQL and fails Data health",
  { skip },
  async () => {
    const { applyMigrations, readLedger } =
      await import("../src/lib/migrations");
    const { healthReport } = await import("../src/lib/health");
    const name = "006_mcp_oauth";
    await sql`create table xgamer_migration(name text primary key, hash text not null, applied_at timestamptz not null default now())`;
    await sql`insert into xgamer_migration(name,hash) values(${name},${"a".repeat(64)})`;
    const source = "create table gate_d_probe(id integer primary key)";
    const pending = {
      name: "099_test_probe",
      source,
      hash: createHash("sha256").update(source).digest("hex"),
    };
    const logs: string[] = [];
    const before = await readLedger(sql);
    const check = async () =>
      (await healthReport()).find((s) => s.title === "Database migrations")!
        .checks[0];

    await assert.rejects(
      applyMigrations(sql, [pending], (line) => logs.push(line)),
      /checksum differs: 006_mcp_oauth/,
    );
    assert.equal(logs.length, 0);
    assert.equal(
      (await sql`select to_regclass('public.gate_d_probe') as probe`)[0].probe,
      null,
    );
    assert.deepEqual(await readLedger(sql), before);
    const mismatch = await check();
    assert.equal(mismatch.level, "error");
    assert.match(mismatch.detail, /checksum differs: 006_mcp_oauth/);

    // Restore the verified value in the disposable ledger and verify the runner
    // handles an external migration without running its (deliberately invalid) file.
    const hash =
      "ae5529b1a747ca3ba6fe30da75ed1d3b368bbb57462a9917c3162468cddde2d1";
    await sql`update xgamer_migration set hash=${hash} where name=${name}`;
    const matched = await check();
    assert.equal(matched.level, "ok");
    assert.match(matched.detail, /1 recognized from another branch/);
    await applyMigrations(
      sql,
      [{ name, hash, source: "not valid sql" }, pending],
      (line) => logs.push(line),
    );
    assert.deepEqual(logs, [`Applied ${pending.name}.`]);
    assert.deepEqual(await readLedger(sql), [
      { name, hash },
      { name: pending.name, hash: pending.hash },
    ]);
  },
);
