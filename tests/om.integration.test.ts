/**
 * Full organizer flow against a real PostgreSQL server.
 * Runs only when TEST_DATABASE_URL points at a disposable database, e.g.
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres DATABASE_SSL=disable npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
}

type Run = typeof import("../src/lib/control").run;
let run: Run, sql: ReturnType<typeof import("../src/lib/db").db>;
let register: typeof import("../src/lib/registration").register;
let getCup: typeof import("../src/lib/cup").getCup;
const T = "xgamer-2026-10";
const admin = "12345678901234567";

before(async () => {
  if (!url) return;
  ({ run } = await import("../src/lib/control"));
  ({ register } = await import("../src/lib/registration"));
  ({ getCup } = await import("../src/lib/cup"));
  sql = (await import("../src/lib/db")).db();
  await sql.unsafe(
    "drop schema public cascade; create schema public; create extension if not exists pgcrypto;",
  );
  for (const f of ["001_control_center.sql", "002_open_registration.sql"])
    await sql.unsafe(
      await readFile(new URL(`../migrations/${f}`, import.meta.url), "utf8"),
    );
});
after(async () => {
  if (url) await sql.end();
});

const cmd = (c: Record<string, unknown>) =>
  run(admin, T, c as Parameters<Run>[2]);
const tournament = async () =>
  (await sql`select * from tournament where id=${T}`)[0];
const apps = () =>
  sql`select a.id,a.revision,a.status,p.id as player_id,p.gaming_name from application a join player p on p.id=a.player_id where a.tournament_id=${T} order by p.gaming_name`;

test(
  "register → approve → add IDs → League + Knockout → champion",
  { skip },
  async () => {
    await assert.rejects(
      () =>
        register(
          {
            playerName: "Early",
            teamName: "FC",
            phone: "+919800000099",
            consent: true,
            website: "",
          },
          "1.1.1.1",
        ),
      /closed/,
    );
    let t = await tournament();
    await cmd({
      action: "configure",
      revision: t.revision,
      name: "XGamer Test Cup",
      status: "open",
      format: "league_knockout",
      qualifiers: 4,
      opponents: null,
    });

    for (let i = 0; i < 9; i++)
      await register(
        {
          playerName: `P${i}`,
          teamName: `Team ${i}`,
          phone: `+9198000000${10 + i}`,
          consent: true,
          website: "",
        },
        `10.0.0.${i}`,
      );
    await assert.rejects(
      () =>
        register(
          {
            playerName: "Again",
            teamName: "FC",
            phone: "+919800000010",
            consent: true,
            website: "",
          },
          "10.0.1.1",
        ),
      /already registered/,
    );

    const all = await apps();
    await cmd({
      action: "review",
      status: "approved",
      verified: false,
      items: [{ id: all[0].id, revision: all[0].revision }],
    }).then(
      () => assert.fail("approval without verification must fail"),
      (e) => assert.match(e.message, /verified/),
    );
    const keep = all.slice(0, 8);
    await cmd({
      action: "review",
      status: "approved",
      verified: true,
      items: keep.map(({ id, revision }) => ({ id, revision })),
    });
    const last = all[8];
    await cmd({
      action: "review",
      status: "rejected",
      verified: false,
      items: [{ id: last.id, revision: last.revision }],
    });

    t = await tournament();
    await cmd({
      action: "configure",
      revision: t.revision,
      name: "XGamer Test Cup",
      status: "locked",
      format: "league_knockout",
      qualifiers: 4,
      opponents: null,
    });
    await assert.rejects(
      () => cmd({ action: "generate", shuffle: true }),
      /Add eFootball IDs first for: P0/,
    );

    for (const [i, a] of keep.entries())
      await cmd({
        action: "efootball",
        playerId: a.player_id,
        efootballId: `XG-${1000 + i}`,
      });
    await assert.rejects(
      () =>
        cmd({
          action: "efootball",
          playerId: keep[1].player_id,
          efootballId: "XG-1000",
        }),
      /another player/,
    );
    await assert.rejects(
      () =>
        cmd({
          action: "efootball",
          playerId: last.player_id,
          efootballId: "XG-9999",
        }),
      /Approve the player/,
    );

    await cmd({ action: "generate", shuffle: true });
    t = await tournament();
    assert.equal(t.status, "league");
    const league =
      await sql`select * from fixture where tournament_id=${T} and stage='league'`;
    assert.equal(league.length, 28);

    // Public data is live and contains no private fields.
    const cup = await getCup();
    assert.equal(cup!.players.length, 8);
    const publicJson = JSON.stringify(cup);
    assert(!publicJson.includes("+91"), "phone numbers must never be public");
    assert(!publicJson.includes("XG-10"), "eFootball IDs must never be public");

    await assert.rejects(
      () => cmd({ action: "qualify" }),
      /every league score/,
    );
    const rank = (id: string) => keep.findIndex((a) => a.player_id === id);
    for (const f of league)
      await cmd({
        action: "score",
        id: f.id,
        revision: f.revision,
        homeScore: rank(f.home) < rank(f.away) ? 2 : 0,
        awayScore: rank(f.home) < rank(f.away) ? 0 : 2,
      });
    await assert.rejects(() => cmd({ action: "reset" }), /no longer be reset/);

    await cmd({ action: "qualify" });
    t = await tournament();
    assert.equal(t.status, "knockout");
    const qualified =
      await sql`select player_id from qualification where tournament_id=${T} order by rank`;
    assert.deepEqual(
      qualified.map((q) => q.player_id),
      keep.slice(0, 4).map((a) => a.player_id),
    );

    for (let round = 1; round <= 2; round++) {
      const ko =
        await sql`select * from fixture where tournament_id=${T} and stage='knockout' and round=${round}`;
      for (const f of ko) {
        // A drawn knockout needs a tiebreak winner.
        await assert.rejects(
          () =>
            cmd({
              action: "score",
              id: f.id,
              revision: f.revision,
              homeScore: 1,
              awayScore: 1,
            }),
          /tiebreak/,
        );
        await cmd({
          action: "score",
          id: f.id,
          revision: f.revision,
          homeScore: 1,
          awayScore: 1,
          winner: f.home,
        });
      }
      await cmd({ action: "advance" });
    }
    t = await tournament();
    assert.equal(t.status, "completed");

    const audit = await sql`select action from audit_event`;
    for (const action of [
      "application.create",
      "review",
      "efootball",
      "configure",
      "generate",
      "score",
      "qualify",
      "advance",
    ])
      assert(
        audit.some((a) => a.action === action),
        `audit missing ${action}`,
      );
    await assert.rejects(() => sql`delete from audit_event`, /immutable/);
    const redacted =
      await sql`select after_value from audit_event where action='efootball'`;
    assert(redacted.every((r) => r.after_value.efootballId === "[REDACTED]"));
  },
);

test(
  "knockout with an odd field: byes advance, reset works before scores",
  { skip },
  async () => {
    await sql`update tournament set status='draft',format='knockout',revision=revision+1 where id=${T}`;
    await sql`delete from qualification where tournament_id=${T}`;
    await sql`delete from fixture where tournament_id=${T}`;
    const all = await apps();
    const five = all.filter((a) => a.status === "approved").slice(0, 5);
    const others = all.filter((a) => a.status === "approved").slice(5);
    await cmd({
      action: "review",
      status: "rejected",
      verified: false,
      items: others.map(({ id, revision }) => ({ id, revision })),
    });
    let t = await tournament();
    await cmd({
      action: "configure",
      revision: t.revision,
      name: "Knockout Night",
      status: "locked",
      format: "knockout",
      qualifiers: 4,
      opponents: null,
    });

    await cmd({ action: "generate", shuffle: false });
    let r1 =
      await sql`select * from fixture where tournament_id=${T} and round=1 order by slot`;
    assert.equal(r1.length, 4);
    assert.equal(r1.filter((f) => f.away === null).length, 3);
    assert(r1.filter((f) => f.away === null).every((f) => f.winner === f.home));
    await assert.rejects(
      () =>
        cmd({
          action: "score",
          id: r1.find((f) => !f.away)!.id,
          revision: 0,
          homeScore: 1,
          awayScore: 0,
        }),
      /bye/,
    );

    await cmd({ action: "reset" });
    t = await tournament();
    assert.equal(t.status, "locked");
    await cmd({ action: "generate", shuffle: true });
    r1 =
      await sql`select * from fixture where tournament_id=${T} and round=1 and away is not null`;
    assert.equal(r1.length, 1);
    await assert.rejects(() => cmd({ action: "advance" }), /Enter every score/);
    await cmd({
      action: "score",
      id: r1[0].id,
      revision: r1[0].revision,
      homeScore: 3,
      awayScore: 1,
    });
    for (let i = 0; i < 3; i++) {
      await cmd({ action: "advance" });
      t = await tournament();
      if (t.status === "completed") break;
      const open =
        await sql`select * from fixture where tournament_id=${T} and home_score is null and away is not null`;
      for (const f of open)
        await cmd({
          action: "score",
          id: f.id,
          revision: f.revision,
          homeScore: 2,
          awayScore: 0,
        });
    }
    assert.equal((await tournament()).status, "completed");
    void five;
  },
);
