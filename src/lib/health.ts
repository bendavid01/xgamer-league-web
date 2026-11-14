import { db } from "./db";
import { actor } from "./api";
import { getRecords, RANKING_POINTS } from "./records";
import { getLeague } from "./league";
import { playerCode } from "./codes";
import { OUTSIDE_MIGRATIONS, outsideMigrationStatus } from "./known-migrations";
import { teamDisplay } from "./team-display";

/**
 * Data health (XG-009) — a READ-ONLY integrity report for main admins.
 * Only SELECT statements. Never merges, deletes, fixes or migrates anything.
 * Shows public identifiers (XG code, gaming name, team) only — never phone
 * numbers, eFootball IDs, Discord IDs, secrets or connection details.
 */
export type Level = "ok" | "warn" | "error" | "info";
export type Check = {
  title: string;
  level: Level;
  detail: string;
  items?: string[];
};
export type Section = { title: string; checks: Check[] };

/** Migrations that belong to this code version (keep in sync with /migrations). */
export const KNOWN_MIGRATIONS = [
  "001_control_center",
  "002_open_registration",
  "003_multi_tournament",
  "004_seasons_podium",
  "005_announcement_dates",
  "007_application_team_name",
  "008_team_name_provenance",
  "009_contact_change",
];

const n = (v: unknown) => Number(v ?? 0);
const code = (no: unknown) => playerCode(no as number);

export async function dataHealth() {
  await actor("audit", "*"); // main admins only (coordinators never get "audit")
  return healthReport();
}

export async function healthReport(): Promise<Section[]> {
  const sql = db();
  const sections: Section[] = [];

  /* ── 1. Permanent player IDs ── */
  const [ids] = await sql`select count(*) total, count(public_no) numbered,
      count(distinct public_no) distinct_nos, min(public_no) lo, max(public_no) hi,
      count(*) filter (where deleted_at is not null) removed from player`;
  const [seqName] =
    await sql`select pg_get_serial_sequence('player','public_no') as name`;
  let next: number | null = null;
  if (seqName?.name && /^[a-z0-9_."]+$/i.test(seqName.name)) {
    const [s] = await sql.unsafe(
      `select last_value, is_called from ${seqName.name}`,
    );
    next = s ? n(s.last_value) + (s.is_called ? 1 : 0) : null;
  }
  const idChecks: Check[] = [
    {
      title: "Every player has a permanent ID",
      level: n(ids.numbered) === n(ids.total) ? "ok" : "error",
      detail: `${n(ids.numbered)} of ${n(ids.total)} player records have an ID (${n(ids.removed)} removed records keep theirs).`,
    },
    {
      title: "No duplicate IDs",
      level: n(ids.distinct_nos) === n(ids.numbered) ? "ok" : "error",
      detail: `${n(ids.distinct_nos)} distinct IDs for ${n(ids.numbered)} numbered players (a unique index enforces this).`,
    },
    {
      title: "ID allocator",
      level:
        next === null
          ? "warn"
          : next > n(ids.hi) || n(ids.hi) === 0
            ? "ok"
            : "error",
      detail:
        next === null
          ? "Could not read the database sequence."
          : `Database identity sequence (concurrency-safe, never reused). Highest ID ${ids.hi ? code(ids.hi) : "—"}; next new player gets ${code(next)}. Gaps are allowed and never renumbered.`,
    },
  ];
  const sameName = await sql`select lower(trim(gaming_name)) k,
      array_agg(public_no order by public_no) nos, min(gaming_name) shown
      from player where deleted_at is null group by 1 having count(*) > 1`;
  const sameTeam = await sql`select lower(trim(team_name)) k,
      array_agg(public_no order by public_no) nos, min(team_name) shown
      from player where deleted_at is null and team_name is not null and trim(team_name) <> ''
      group by 1 having count(*) > 1`;
  idChecks.push({
    title: "Possible duplicate identities (manual review)",
    level: sameName.length + sameTeam.length ? "warn" : "ok",
    detail:
      sameName.length + sameTeam.length
        ? "Different player IDs share a gaming name or team name. They may be different people — review manually; nothing is merged automatically."
        : "No two players share a gaming name or team name.",
    items: [
      ...sameName.map(
        (r) => `Name "${r.shown}": ${(r.nos as number[]).map(code).join(", ")}`,
      ),
      ...sameTeam.map(
        (r) => `Team "${r.shown}": ${(r.nos as number[]).map(code).join(", ")}`,
      ),
    ],
  });
  sections.push({ title: "Permanent player IDs", checks: idChecks });

  /* ── 2. Tournaments and participants ── */
  const tours =
    await sql`select status, published, deleted_at is not null as deleted, count(*)::int c
      from tournament group by 1,2,3 order by 1`;
  const orphanApps = await sql`select t.name, p.public_no from application a
      join player p on p.id=a.player_id join tournament t on t.id=a.tournament_id
      where a.status='approved' and a.deleted_at is null and p.deleted_at is not null`;
  const seasonOdd = await sql`select name, competition, season from tournament
      where deleted_at is null and ((competition is null) <> (season is null))`;
  const teamRows = await sql<{ source: string; c: number }[]>`
      select coalesce(team_name_source, 'unknown') as source, count(*)::int c
      from application where deleted_at is null group by 1 order by 1`.catch(
    () => [],
  );
  const unrecordedTeams = n(teamRows.find((r) => r.source === "unknown")?.c);
  const display = teamDisplay();
  // Every source on its own line, zeros included, so nothing is merged or hidden.
  const SOURCES: [string, string][] = [
    ["registration", "Stored at registration"],
    ["registration_record", "Recovered from registration records"],
    ["organizer_attested", "Attested by an organizer"],
    ["organizer_corrected", "Corrected by an organizer"],
    ["unknown", "Not recorded"],
  ];
  sections.push({
    title: "Tournaments and participants",
    checks: [
      {
        title: "Tournaments",
        level: "info",
        detail:
          tours
            .map(
              (r) =>
                `${r.c} ${r.status}${r.deleted ? " (deleted)" : r.published ? " (published)" : " (not published)"}`,
            )
            .join(" · ") || "None yet.",
      },
      {
        title: "Season references",
        level: seasonOdd.length ? "error" : "ok",
        detail: seasonOdd.length
          ? "Competition and season must be set together."
          : "Every seasonal tournament has both a competition and a season number.",
        items: seasonOdd.map((r) => r.name),
      },
      {
        title: "Approved participants point to active players",
        level: orphanApps.length ? "warn" : "ok",
        detail: orphanApps.length
          ? "Approved entries whose player record was removed."
          : "All approved entries reference active player records.",
        items: orphanApps.map((r) => `${r.name}: ${code(r.public_no)}`),
      },
      {
        title: "Team names per tournament",
        level: unrecordedTeams ? "warn" : "ok",
        detail: unrecordedTeams
          ? `${unrecordedTeams} entries have no recorded team name for their tournament. Review them below; nothing is guessed.`
          : "Every entry has the team name recorded for its tournament.",
        items: [
          ...SOURCES.map(
            ([key, text]) =>
              `${text}: ${n(teamRows.find((r) => r.source === key)?.c)}`,
          ),
          ...teamRows
            .filter((r) => !SOURCES.some(([key]) => key === r.source))
            .map((r) => `Unexpected label "${r.source}": ${r.c}`),
        ],
      },
      {
        title: "Public team display",
        level: display === "entry" && unrecordedTeams ? "error" : "info",
        detail:
          display === "entry"
            ? unrecordedTeams
              ? `TEAM_DISPLAY=entry while ${unrecordedTeams} entries are unrecorded: those show "Not recorded" on the website.`
              : "TEAM_DISPLAY=entry: each tournament shows the team stored for that entry."
            : "TEAM_DISPLAY=current: the website shows each player's current team (as before 007). Switch to entry only once nothing is unrecorded.",
      },
    ],
  });

  /* ── WhatsApp numbers (009): counts only, never numbers ── */
  const [contacts] = await sql`select
      (select count(*)::int from player where deleted_at is null and contact_verified_at is not null) attested,
      (select count(*)::int from player where deleted_at is null and contact_verified_at is null) legacy,
      (select count(*)::int from contact_change where status='pending_code' and expires_at > now()) pending,
      (select count(*)::int from contact_change where status='awaiting_second_admin' and approve_by > now()) awaiting,
      (select count(*)::int from contact_change where (status='pending_code' and expires_at <= now())
         or (status='awaiting_second_admin' and approve_by <= now())) overdue,
      (select count(*)::int from contact_change where status='completed') completed`.catch(
    () => [null],
  );
  if (contacts)
    sections.push({
      title: "WhatsApp numbers",
      checks: [
        {
          title: "Organizer attestation",
          level: "info",
          detail: `${contacts.attested} numbers organizer-attested in OM; ${contacts.legacy} legacy numbers never attested. Attestation is a manual organizer record, not automated proof of ownership, and never authorization for login.`,
        },
        {
          title: "Open number changes",
          level: contacts.overdue ? "warn" : "info",
          detail: `${contacts.pending} waiting for the code, ${contacts.awaiting} waiting for a second admin, ${contacts.overdue} past their deadline (closed on next action), ${contacts.completed} completed in total.`,
        },
      ],
    });

  /* ── 3. Fixtures and official results ── */
  const [fx] = await sql`select count(*)::int total,
      count(*) filter (where home_score is not null)::int scored from fixture where stage='league'`;
  const strangers =
    await sql`select t.name, f.round from fixture f join tournament t on t.id=f.tournament_id
      where f.stage='league' and f.away is not null and (
        not exists (select 1 from application a where a.tournament_id=f.tournament_id and a.player_id=f.home and a.status='approved' and a.deleted_at is null)
        or not exists (select 1 from application a where a.tournament_id=f.tournament_id and a.player_id=f.away and a.status='approved' and a.deleted_at is null))`;
  const early =
    await sql`select distinct t.name from fixture f join tournament t on t.id=f.tournament_id
      where t.status in ('draft','open','locked') and t.deleted_at is null`;
  const unfinished =
    await sql`select t.name, count(*)::int c from fixture f join tournament t on t.id=f.tournament_id
      where t.status='completed' and f.stage='league' and f.home_score is null group by t.name`;
  sections.push({
    title: "Fixtures and official results",
    checks: [
      {
        title: "League fixtures",
        level: "info",
        detail: `${fx.total} fixtures, ${fx.scored} with an official score.`,
      },
      {
        title: "Fixtures only between approved participants",
        level: strangers.length ? "error" : "ok",
        detail: strangers.length
          ? "Some fixtures involve a player who is not an approved participant."
          : "Every fixture is between approved participants of its tournament.",
        items: strangers.map((r) => `${r.name} · Round ${r.round}`),
      },
      {
        title: "Fixtures only after registration closed",
        level: early.length ? "warn" : "ok",
        detail: early.length
          ? "Fixtures exist in a tournament that is still in set-up or registration."
          : "No fixtures in tournaments still in set-up or registration.",
        items: early.map((r) => r.name),
      },
      {
        title: "Finished tournaments have every score",
        level: unfinished.length ? "warn" : "ok",
        detail: unfinished.length
          ? "Completed tournaments with league fixtures that have no score."
          : "No missing scores in finished tournaments.",
        items: unfinished.map((r) => `${r.name}: ${r.c} without score`),
      },
    ],
  });

  /* ── 4. Final placements and ranking consistency ── */
  const podiumStrangers =
    await sql`select t.name, po.place from podium po join tournament t on t.id=po.tournament_id
      where not exists (select 1 from application a where a.tournament_id=po.tournament_id and a.player_id=po.player_id and a.status='approved' and a.deleted_at is null)`;
  const noChampion = await sql`select name from tournament
      where status='completed' and deleted_at is null and not exists (select 1 from podium where tournament_id=tournament.id and place=1)`;
  const pending = await sql`select name from tournament
      where status<>'completed' and deleted_at is null and exists (select 1 from podium where tournament_id=tournament.id)`;
  const qMismatch =
    await sql`select t.name, t.qualifiers, count(q.*)::int c from tournament t join qualification q on q.tournament_id=t.id
      group by t.id having count(q.*) <> t.qualifiers`;
  const records = await getRecords();
  const rankingOk =
    records?.players.every(
      (p) =>
        p.ranking ===
        p.titles * RANKING_POINTS.champion +
          p.runnerUps * RANKING_POINTS.runnerUp +
          p.thirds * RANKING_POINTS.third +
          p.knockouts * RANKING_POINTS.knockout +
          p.won * RANKING_POINTS.leagueWin,
    ) ?? false;
  const [pub] =
    await sql`select count(*) filter (where f.home_score is not null)::int scored,
      coalesce(sum(f.home_score + f.away_score),0)::int goals
      from fixture f join tournament t on t.id=f.tournament_id
      where t.published and t.deleted_at is null and f.stage='league' and f.away is not null`;
  sections.push({
    title: "Final placements and ranking",
    checks: [
      {
        title: "Placements belong to approved participants",
        level: podiumStrangers.length ? "error" : "ok",
        detail: podiumStrangers.length
          ? "A 1st/2nd/3rd place is held by someone who is not an approved participant."
          : "Every recorded placement belongs to an approved participant.",
        items: podiumStrangers.map((r) => `${r.name}: place ${r.place}`),
      },
      {
        title: "Finished tournaments with a confirmed champion",
        level: noChampion.length ? "warn" : "ok",
        detail: noChampion.length
          ? "Finished, but final positions are not confirmed yet (shown as Podium pending)."
          : "Every finished tournament has a confirmed champion.",
        items: noChampion.map((r) => r.name),
      },
      {
        title: "Placements entered before finishing",
        level: pending.length ? "info" : "ok",
        detail: pending.length
          ? "Not shown publicly until the tournament is marked completed."
          : "None.",
        items: pending.map((r) => r.name),
      },
      {
        title: "Qualifier counts",
        level: qMismatch.length ? "warn" : "ok",
        detail: qMismatch.length
          ? "Confirmed qualifiers differ from the tournament's Top N setting."
          : "Confirmed qualifiers match each tournament's Top N.",
        items: qMismatch.map((r) => `${r.name}: ${r.c} of Top ${r.qualifiers}`),
      },
      {
        title: "XGamer Ranking arithmetic",
        level: records ? (rankingOk ? "ok" : "error") : "warn",
        detail: records
          ? `${records.players.length} ranked players; every total equals its awards (10/7/5/3 + 1 per league win). Awards come from one row per placement, so nothing is counted twice.`
          : "Ranking could not be calculated.",
      },
      {
        title: "Public counters match the database",
        level:
          records &&
          records.totals.matches === pub.scored &&
          records.totals.goals === pub.goals
            ? "ok"
            : "error",
        detail: `Champions page: ${records?.totals.matches ?? "?"} matches, ${records?.totals.goals ?? "?"} goals · database: ${pub.scored} matches, ${pub.goals} goals (published tournaments).`,
      },
    ],
  });

  /* ── 5. Legacy Sanity archive ── */
  const league = await getLeague();
  const stages = [...new Set(league.matches.map((m) => m.stage ?? "No stage"))];
  const broken = league.matches.filter((m) => !m.home || !m.away);
  sections.push({
    title: "Legacy archive (Sanity, pre-2.0)",
    checks: league.available
      ? [
          {
            title: "Archive inventory",
            level: "info",
            detail: `${league.teams.length} participants, ${league.matches.length} matches (${league.matches.filter((m) => m.status === "completed").length} completed). Stages: ${stages.join(", ") || "—"}.`,
          },
          {
            title: "Archive references",
            level: broken.length ? "warn" : "ok",
            detail: broken.length
              ? `${broken.length} archived matches miss a participant reference.`
              : "Every archived match references both participants.",
          },
          {
            title: "Not linked to player IDs",
            level: "info",
            detail:
              "Archive entries have no permanent IDs and are not counted in careers or the XGamer Ranking. Manual linking can be added later as a separate, approved feature.",
          },
        ]
      : [
          {
            title: "Archive inventory",
            level: "warn",
            detail: "Sanity could not be reached right now.",
          },
        ],
  });

  /* ── 6. Database migrations ── */
  const ledger = (
    await sql<{ name: string; hash: string; applied_at: Date }[]>`
      select name, hash, applied_at from xgamer_migration order by name
    `.catch((error: { code?: string }) => {
      if (error.code === "42P01") return []; // Fresh database without a ledger yet.
      throw error;
    })
  ).map((m) => ({
    ...m,
    state: KNOWN_MIGRATIONS.includes(m.name)
      ? "local"
      : outsideMigrationStatus(m.name, m.hash),
  }));
  const unknown = ledger.some((m) => m.state === "unknown");
  const changed = ledger.filter((m) => m.state === "changed");
  const recognized = ledger.filter((m) => m.state === "recognized").length;
  sections.push({
    title: "Database migrations",
    checks: [
      {
        title: "Applied migrations",
        level: changed.length ? "error" : unknown ? "warn" : "ok",
        detail: changed.length
          ? `Applied migration checksum differs: ${changed.map((m) => m.name).join(", ")}. Verify the ledger before proceeding.`
          : unknown
            ? "Some applied migrations are outside this code version and unrecognized."
            : `${ledger.length} applied: ${ledger.length - recognized} in this code version${recognized ? `, ${recognized} recognized from another branch (left untouched)` : ""}.`,
        items: ledger.map((m) => {
          const status = {
            local: "",
            recognized: ` (recognized: ${OUTSIDE_MIGRATIONS.get(m.name)?.description})`,
            changed: " (checksum mismatch)",
            unknown: " (not in this code version)",
          }[m.state];
          return `${m.name} — ${new Date(m.applied_at).toISOString().slice(0, 16).replace("T", " ")} UTC${status}`;
        }),
      },
      process.env.MIGRATE_ON_BUILD === "true"
        ? {
            title: "Automatic migrations",
            level: "warn",
            detail:
              "MIGRATE_ON_BUILD is switched on, so builds apply database migrations. Remove it once the approved release is live.",
          }
        : {
            title: "Automatic migrations",
            level: "ok",
            detail:
              "Off. Builds only check the database schema; they never change it.",
          },
    ],
  });
  return sections;
}
