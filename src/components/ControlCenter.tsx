"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import {
  FORMAT_CHOICES,
  FORMAT_LABEL,
  formatChoice,
  tournamentLabel,
  type FormatChoice,
} from "@/lib/labels";

/* ─────────────────────────── Types ─────────────────────────── */

type User = {
  role: "admin" | "coordinator";
  operations: string[];
  name: string | null;
};
type Status = "draft" | "open" | "locked" | "league" | "knockout" | "completed";
type TournamentRow = {
  id: string;
  name: string;
  competition: string | null;
  season: number | null;
  published: boolean;
  status: Status;
  format: "league" | "knockout";
  knockout: boolean;
  qualifiers: number;
  legs: number;
};
type Home = {
  user: User;
  tournaments: TournamentRow[];
  deleted: {
    id: string;
    name: string;
    competition: string | null;
    season: number | null;
    deleted_at: string;
  }[];
  coordinators: { discord_id: string; operations: string[]; active: boolean }[];
  audit: AuditRow[];
};
type AuditRow = {
  id: number;
  created_at: string;
  actor: string;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  summary: string | null;
  affected: string | null;
  tournament_name?: string | null;
  before_value: unknown;
  after_value: unknown;
};
type Application = {
  id: string;
  player_id: string;
  code: string;
  gaming_name: string;
  team_name: string | null;
  team_name_source: TeamSource | null;
  current_team: string | null;
  status: string;
  revision: number;
  /** Masked on the server ("+91 ••••••••10"); full numbers only through disclosure. */
  contact?: string;
  efootballId?: string | null;
};
type Match = {
  id: string;
  home: string;
  away: string;
  round: number;
  home_score: number | null;
  away_score: number | null;
  revision: number;
};
type Workspace = {
  user: User;
  tournament: {
    id: string;
    name: string;
    competition: string | null;
    season: number | null;
    published: boolean;
    status: Status;
    revision: number;
    format: "league" | "knockout";
    knockout: boolean;
    qualifiers: number;
    legs: 1 | 2;
    opponents: number | null;
    starts_on: string | null;
    registration_closes: string | null;
    entry_fee: number | null;
    prize: string | null;
    description: string | null;
  };
  applications: Application[];
  fixtures: Match[];
  standings: {
    id: string;
    name: string;
    pts: number;
    gd: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
  }[];
  qualified: string[];
  podium: (string | null)[];
  photo: number | null;
  announcements: {
    id: string;
    title: string;
    message: string;
    created_at: string;
  }[];
};
type Act = (value: Record<string, unknown>, done?: string) => Promise<boolean>;
type TeamSource =
  | "registration"
  | "registration_record"
  | "organizer_attested"
  | "organizer_corrected";

/* ─────────────────────────── Labels ─────────────────────────── */

const PHASE: Record<Status, string> = {
  draft: "Setting up",
  open: "Registration open",
  locked: "Registration closed",
  league: "League in progress",
  knockout: "Knockout in eFootball app",
  completed: "Completed",
};
const FILTERS = [
  ["pending", "Pending"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["all", "All"],
] as const;
const ACTION_LABEL: Record<string, string> = {
  "application.create": "Registered",
  review: "Reviewed players",
  delete: "Removed player",
  configure: "Updated settings",
  generate: "Generated fixtures",
  score: "Entered score",
  announce: "Published announcement",
  coordinator: "Coordinator access",
  "player.edit_name": "Changed gaming name",
  "player.edit_team": "Changed current team",
  "player.edit_efootball": "Changed eFootball ID",
  "application.team_attest": "Attested tournament team",
  "application.team_correct": "Corrected tournament team",
  "contact.disclose": "Viewed WhatsApp number",
  "contact.change_start": "Started WhatsApp number change",
  "contact.change_code": "Checked WhatsApp code",
  "contact.change_approve": "Approved WhatsApp number change",
  "contact.change_cancel": "Cancelled WhatsApp number change",
};
/** OM only. The public site never shows where a team name came from. */
const SOURCE_TAG: Record<TeamSource, string> = {
  registration: "Registration",
  registration_record: "Registration record",
  organizer_attested: "Attested",
  organizer_corrected: "Corrected",
};
const formatLabel = (t: {
  format: string;
  knockout: boolean;
  legs?: number;
  qualifiers?: number;
}) =>
  t.format === "knockout"
    ? FORMAT_LABEL.knockout
    : `${t.knockout ? `League (Top ${t.qualifiers ?? ""}) + Knockout (eFootball app)` : "League"}${t.legs === 2 ? " · home & away" : ""}`;

/** Competitions that run in seasons, with the season numbers already used. */
type Competitions = Map<string, { name: string; seasons: number[] }>;
const competitionsOf = (rows: TournamentRow[]): Competitions => {
  const out: Competitions = new Map();
  for (const t of rows)
    if (t.competition && t.season) {
      const key = t.competition.toLowerCase();
      const c = out.get(key) ?? { name: t.competition, seasons: [] };
      c.seasons.push(t.season);
      out.set(key, c);
    }
  return out;
};
const nextSeason = (c?: { seasons: number[] }) =>
  c?.seasons.length ? Math.max(...c.seasons) + 1 : 1;

/* ─────────────────────────── Root ─────────────────────────── */

export default function ControlCenter() {
  const [open, setOpen] = useState<string | null>(null);
  const [homeData, setHome] = useState<Home | null>(null);
  const [work, setWork] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (tid: string | null) => {
    const r = await fetch(
      tid ? `/api/admin?t=${encodeURIComponent(tid)}` : "/api/admin",
      { cache: "no-store" },
    );
    const value = await r.json();
    if (!r.ok) throw new Error(value.error);
    if (tid) setWork(value);
    else setHome(value);
  }, []);

  // Deep link: /admin?t=<id> opens that tournament.
  useEffect(() => {
    const tid = new URLSearchParams(window.location.search).get("t");
    let active = true;
    const go = async () => {
      try {
        await load(null);
        if (tid && active) {
          setOpen(tid);
          await load(tid);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void go();
    return () => {
      active = false;
    };
  }, [load]);

  const navigate = async (tid: string | null) => {
    setError("");
    setNotice("");
    setOpen(tid);
    setWork(null);
    window.history.pushState(
      null,
      "",
      tid ? `/admin?t=${encodeURIComponent(tid)}` : "/admin",
    );
    try {
      await load(tid);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const act: Act = async (value, done) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          open &&
            !("tournament" in value) &&
            value.action !== "create" &&
            value.action !== "coordinator"
            ? { ...value, tournament: open }
            : value,
        ),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      if (value.action === "delete_tournament") {
        await navigate(null);
      } else if (
        (value.action === "create" || value.action === "rerun") &&
        result.id
      ) {
        await navigate(result.id);
      } else {
        await Promise.all([load(null), open ? load(open) : Promise.resolve()]);
      }
      if (done) setNotice(done);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setError("");
    try {
      await Promise.all([load(null), open ? load(open) : Promise.resolve()]);
      setNotice("Up to date.");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const user = homeData?.user ?? work?.user;

  return (
    <div className="page-shell py-12 om">
      <p className="eyebrow">XGAMER / OPERATIONS</p>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <h1 className="page-title">
          Organizer Manager<span className="text-cyan-300">.</span>
        </h1>
        {user?.name && (
          <p className="text-slate-400">Signed in as {user.name}</p>
        )}
        {!user && !error && <p className="text-slate-400">Loading…</p>}
      </div>
      {error && (
        <div role="alert" className="notice mt-6 text-amber-200">
          {error}
          {!user && (
            <Link className="button-secondary mt-4 flex w-fit" href="/login">
              Sign in with Discord
            </Link>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="notice mt-6 text-cyan-200">
          {notice}
        </p>
      )}
      <fieldset disabled={busy} className="mt-8 disabled:opacity-70">
        {open ? (
          work ? (
            <TournamentWorkspace
              data={work}
              act={act}
              back={() => void navigate(null)}
              competitions={competitionsOf(homeData?.tournaments ?? [])}
              reload={() => load(open)}
            />
          ) : (
            !error && <p className="notice">Opening tournament…</p>
          )
        ) : (
          homeData && (
            <HomeView
              data={homeData}
              act={act}
              openTournament={(id) => void navigate(id)}
            />
          )
        )}
      </fieldset>
      {user && (
        <div className="om-page-footer">
          <button
            className="button-secondary"
            onClick={() => void refresh()}
            disabled={busy}
          >
            <RefreshCw size={16} aria-hidden="true" /> Refresh
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── OM home ─────────────────────────── */

function HomeView({
  data,
  act,
  openTournament,
}: {
  data: Home;
  act: Act;
  openTournament: (id: string) => void;
}) {
  const admin = data.user.role === "admin";
  const [tab, setTab] = useState<
    "tournaments" | "coordinators" | "log" | "health"
  >("tournaments");
  const [adding, setAdding] = useState(false);
  const tabs = [
    ["tournaments", "Tournaments"],
    ...(admin
      ? [
          ["coordinators", "Coordinators"],
          ["log", "Activity log"],
          ["health", "Data health"],
        ]
      : []),
  ] as const;
  return (
    <>
      <Tabs
        tabs={tabs as unknown as [string, string][]}
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
      />
      {tab === "tournaments" && (
        <section className="panel p-4 md:p-7" aria-labelledby="t-title">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h2 id="t-title" className="text-2xl font-bold">
              Tournaments
            </h2>
            {admin && !adding && (
              <button
                className="button-primary"
                onClick={() => setAdding(true)}
              >
                <Plus size={16} aria-hidden="true" /> Add
              </button>
            )}
          </div>
          {adding && (
            <NewTournament
              competitions={competitionsOf(data.tournaments)}
              act={act}
              cancel={() => setAdding(false)}
            />
          )}
          {data.tournaments.length ? (
            <ul className="om-tournaments">
              {data.tournaments.map((t) => (
                <li key={t.id}>
                  <button
                    className="om-tournament"
                    onClick={() => openTournament(t.id)}
                  >
                    <span className="min-w-0">
                      <strong>{tournamentLabel(t)}</strong>
                      <span className="block text-sm text-slate-400">
                        {formatLabel(t)}
                      </span>
                    </span>
                    <span className="flex flex-wrap justify-end gap-2">
                      {!t.published && (
                        <span className="status-pill om-hidden">
                          Not on website
                        </span>
                      )}
                      <span className={`status-pill status-${t.status}`}>
                        {PHASE[t.status]}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-400">
              No tournaments yet. Press Add to create the first one.
            </p>
          )}
          {admin && data.deleted.length > 0 && (
            <details className="om-card mt-6">
              <summary className="cursor-pointer">
                Deleted tournaments ({data.deleted.length})
              </summary>
              <ul className="mt-3 space-y-2">
                {data.deleted.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3"
                  >
                    <span>
                      {tournamentLabel(d)}{" "}
                      <span className="text-xs text-slate-500">
                        deleted{" "}
                        {new Date(d.deleted_at).toLocaleDateString("en-IN")}
                      </span>
                    </span>
                    <button
                      className="button-secondary om-small"
                      onClick={() =>
                        void act(
                          { action: "restore_tournament", tournament: d.id },
                          `${tournamentLabel(d)} restored.`,
                        )
                      }
                    >
                      <RotateCcw size={14} aria-hidden="true" /> Restore
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
      {tab === "coordinators" && admin && (
        <Coordinators data={data} act={act} />
      )}
      {tab === "log" && admin && <ActivityLog rows={data.audit} />}
      {tab === "health" && admin && (
        <>
          <DataHealth />
          <TeamReview />
          <ContactApprovals />
        </>
      )}
    </>
  );
}

/**
 * New tournament, or "Run again as next season" (from = the finished tournament).
 * One-off cups have just a name; seasons belong to a competition.
 */
function NewTournament({
  competitions,
  act,
  cancel,
  from,
}: {
  competitions: Competitions;
  act: Act;
  cancel: () => void;
  from?: Workspace["tournament"];
}) {
  const fromKey = from?.competition?.toLowerCase();
  const [type, setType] = useState<"oneoff" | "season">(
    from ? "season" : "oneoff",
  );
  const [pick, setPick] = useState<string>(
    fromKey ?? (competitions.size ? [...competitions.keys()][0] : "__new"),
  );
  const [newName, setNewName] = useState(from && !fromKey ? from.name : "");
  const chosen = pick === "__new" ? undefined : competitions.get(pick);
  // A one-off cup run again becomes Season 1, so the new one is Season 2.
  const suggestion = from && !fromKey ? 2 : nextSeason(chosen);
  const [season, setSeason] = useState(String(suggestion));
  const [format, setFormat] = useState<FormatChoice>(
    from ? formatChoice(from) : "league",
  );
  const [published, setPublished] = useState(false);
  const competitionName = chosen?.name ?? newName.trim();
  const n = Number(season);
  const clash =
    type === "season" &&
    Number.isInteger(n) &&
    (chosen?.seasons.includes(n) ||
      [...competitions.values()].some(
        (c) =>
          c.name.toLowerCase() === newName.trim().toLowerCase() &&
          c.seasons.includes(n),
      ));
  return (
    <form
      className="om-card mb-6 space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const ok = from
          ? await act(
              {
                action: "rerun",
                tournament: from.id,
                name: competitionName,
                season: n,
                published,
              },
              `${competitionName} · Season ${n} created with the same settings. Open registration in Set up when ready.`,
            )
          : await act(
              {
                action: "create",
                name: type === "season" ? competitionName : f.get("name"),
                season: type === "season" ? n : null,
                format,
                published,
              },
              "Tournament created. Fill in the details in Set up.",
            );
        if (ok) cancel();
      }}
    >
      <h3 className="text-lg font-bold">
        {from ? "Run again as next season" : "New tournament"}
      </h3>
      {from && (
        <p className="text-sm text-slate-400 -mt-3">
          Copies format, matches, qualifiers, entry fee, prize and description
          from {tournamentLabel(from)}. Players register again.
          {!fromKey &&
            ` ${from.name} becomes Season ${Math.max(1, n - 1) || 1}.`}
        </p>
      )}
      {!from && (
        <div>
          <p className="mb-2">Type</p>
          <div className="flex flex-wrap gap-3">
            <Choice
              name="type"
              value="oneoff"
              label="One-off cup"
              checked={type === "oneoff"}
              onChange={() => setType("oneoff")}
            />
            <Choice
              name="type"
              value="season"
              label="New season of a competition"
              checked={type === "season"}
              onChange={() => setType("season")}
            />
          </div>
        </div>
      )}
      {type === "oneoff" ? (
        <label className="block">
          Tournament name
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            className="control-input"
            placeholder="XGamer Diwali Cup"
            autoFocus
          />
        </label>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block">
            Competition
            <select
              className="control-input"
              value={pick}
              onChange={(e) => {
                setPick(e.target.value);
                setSeason(String(nextSeason(competitions.get(e.target.value))));
              }}
            >
              {[...competitions].map(([key, c]) => (
                <option key={key} value={key}>
                  {c.name}
                </option>
              ))}
              <option value="__new">+ New competition</option>
            </select>
          </label>
          {pick === "__new" && (
            <label className="block">
              New competition name
              <input
                required
                minLength={2}
                maxLength={80}
                className="control-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="XGamer Pro League"
              />
            </label>
          )}
          <label className="block">
            Season number
            <input
              required
              type="number"
              min={1}
              max={999}
              inputMode="numeric"
              className="control-input"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              aria-describedby="season-help"
            />
            <span id="season-help" className="block text-xs mt-1">
              {clash ? (
                <span className="text-amber-200">
                  Season {n} already exists — pick another number.
                </span>
              ) : (
                <span className="text-slate-500">
                  Suggested: Season {suggestion}
                </span>
              )}
            </span>
          </label>
        </div>
      )}
      {!from && (
        <FormatChoices value={format} onChange={setFormat} name="newFormat" />
      )}
      <PublishSwitch value={published} onChange={setPublished} />
      <div className="om-footer">
        <button type="button" className="button-secondary" onClick={cancel}>
          Cancel
        </button>
        <button className="button-primary" disabled={!!clash}>
          Apply
        </button>
      </div>
    </form>
  );
}

function FormatChoices({
  value,
  onChange,
  name,
}: {
  value: FormatChoice;
  onChange: (f: FormatChoice) => void;
  name: string;
}) {
  return (
    <div>
      <p className="mb-2">Format</p>
      <div className="flex flex-wrap gap-3">
        {FORMAT_CHOICES.map((f) => (
          <Choice
            key={f}
            name={name}
            value={f}
            label={FORMAT_LABEL[f]}
            checked={value === f}
            onChange={() => onChange(f)}
          />
        ))}
      </div>
    </div>
  );
}

function PublishSwitch({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="om-switch">
      <input
        type="checkbox"
        role="switch"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span aria-hidden="true" className="om-switch-track" />
      <span>
        Publish on website{" "}
        <span className="text-slate-400 text-sm">
          {value ? "— visible to everyone" : "— only organizers can see it"}
        </span>
      </span>
    </label>
  );
}

function Coordinators({ data, act }: { data: Home; act: Act }) {
  const OPS = [
    ["registrations", "Review players"],
    ["results", "Enter scores"],
    ["announcements", "Post announcements"],
  ] as const;
  return (
    <section className="panel p-4 md:p-7 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Coordinators</h2>
        <p className="text-slate-400 mt-1">
          Helpers get only what you tick, in every tournament. They can never
          delete players or change roles.
        </p>
      </div>
      {data.coordinators.length > 0 && (
        <ul className="space-y-2">
          {data.coordinators.map((c) => (
            <li
              key={c.discord_id}
              className="om-card flex flex-wrap justify-between gap-2"
            >
              <span className="font-mono">{c.discord_id}</span>
              <span className="text-sm text-slate-400">
                {c.active
                  ? c.operations
                      .map((o) => OPS.find(([k]) => k === o)?.[1] ?? o)
                      .join(", ") || "No access"
                  : "Access removed"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="om-card"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void act(
            {
              action: "coordinator",
              discordId: f.get("discordId"),
              operations: f.getAll("operations"),
              active: f.get("active") === "on",
            },
            "Coordinator access saved.",
          );
        }}
      >
        <label className="block">
          Discord user ID (numbers)
          <input
            className="control-input"
            name="discordId"
            pattern="[0-9]{17,20}"
            inputMode="numeric"
            required
          />
        </label>
        <div className="om-checks mt-4">
          {OPS.map(([op, label]) => (
            <label className="om-check" key={op}>
              <input type="checkbox" name="operations" value={op} /> {label}
            </label>
          ))}
          <label className="om-check">
            <input type="checkbox" name="active" defaultChecked /> Access
            enabled (untick to remove)
          </label>
        </div>
        <div className="om-footer">
          <span />
          <button className="button-primary">Apply</button>
        </div>
      </form>
    </section>
  );
}

function ActivityLog({ rows }: { rows: AuditRow[] }) {
  return (
    <section className="panel p-4 md:p-7">
      <h2 className="text-2xl font-bold mb-4">Activity log</h2>
      <div className="overflow-x-auto">
        <table className="control-table om-log">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>Affected</th>
              <th>Tournament</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const role =
                a.actor_role ??
                (a.actor === "guest"
                  ? "player"
                  : /^\d+$/.test(a.actor)
                    ? "admin"
                    : "");
              const who =
                a.actor_name ?? (a.actor === "guest" ? "Player" : a.actor);
              return (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">
                    {new Date(a.created_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>
                    <span title={a.actor}>{who}</span>
                    {role && (
                      <span className={`om-role om-role-${role}`}>{role}</span>
                    )}
                  </td>
                  <td>{a.summary ?? ACTION_LABEL[a.action] ?? a.action}</td>
                  <td>{a.affected ?? "—"}</td>
                  <td>{a.tournament_name ?? "—"}</td>
                  <td>
                    <details>
                      <summary>Before / after</summary>
                      <pre className="text-xs whitespace-pre-wrap break-all max-w-md">
                        {JSON.stringify(
                          { before: a.before_value, after: a.after_value },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <p className="text-slate-400 py-6">Nothing recorded yet.</p>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────── Tournament workspace ─────────────────────────── */

function TournamentWorkspace({
  data,
  act,
  back,
  competitions,
  reload,
}: {
  data: Workspace;
  act: Act;
  back: () => void;
  competitions: Competitions;
  reload: () => Promise<void>;
}) {
  const t = data.tournament;
  const [rerun, setRerun] = useState(false);
  const can = (op: string) =>
    data.user.role === "admin" || data.user.operations.includes(op);
  const admin = data.user.role === "admin";
  const [tab, setTab] = useState<string>(
    can("registrations")
      ? "players"
      : can("results")
        ? "fixtures"
        : "standings",
  );
  const tabs: [string, string][] = [
    ...(can("registrations")
      ? [["players", "Players"] as [string, string]]
      : []),
    ...(admin ? [["setup", "Set up"] as [string, string]] : []),
    ...(t.format === "league" && (can("results") || admin)
      ? [["fixtures", "Fixtures & scores"] as [string, string]]
      : []),
    ...(admin && t.format === "knockout"
      ? [["fixtures", "Knockout"] as [string, string]]
      : []),
    ...(t.format === "league"
      ? [["standings", "Standings"] as [string, string]]
      : []),
    ...(admin && ["knockout", "completed"].includes(t.status)
      ? [["podium", "Final positions"] as [string, string]]
      : []),
    ...(can("announcements")
      ? [["announcements", "Updates"] as [string, string]]
      : []),
  ];
  const names = useMemo(
    () => new Map(data.applications.map((a) => [a.player_id, a.gaming_name])),
    [data],
  );
  return (
    <>
      <button className="om-back" onClick={back}>
        <ArrowLeft size={16} aria-hidden="true" /> All tournaments
      </button>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <h2 className="text-3xl font-bold">{tournamentLabel(t)}</h2>
        <span className={`status-pill status-${t.status}`}>
          {PHASE[t.status]}
        </span>
        {!t.published && (
          <span className="status-pill om-hidden">Not on website</span>
        )}
      </div>
      <p className="text-slate-400 mt-1">{formatLabel(t)}</p>
      {admin && t.status === "completed" && !rerun && (
        <button
          className="button-secondary mt-4"
          onClick={() => setRerun(true)}
        >
          <RotateCcw size={16} aria-hidden="true" /> Run again as next season
        </button>
      )}
      {rerun && (
        <div className="mt-4">
          <NewTournament
            competitions={competitions}
            act={act}
            cancel={() => setRerun(false)}
            from={t}
          />
        </div>
      )}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "players" && (
        <PlayersTab data={data} act={act} reload={reload} />
      )}
      {tab === "setup" && admin && <SetupTab data={data} act={act} />}
      {tab === "fixtures" && (
        <FixturesTab data={data} act={act} names={names} />
      )}
      {tab === "standings" && <StandingsTab data={data} />}
      {tab === "podium" && admin && (
        <PodiumTab data={data} act={act} reload={reload} />
      )}
      {tab === "announcements" && <AnnouncementsTab data={data} act={act} />}
    </>
  );
}

function PlayersTab({
  data,
  act,
  reload,
}: {
  data: Workspace;
  act: Act;
  reload: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("pending");
  const [details, setDetails] = useState<string | null>(null);
  const canDetails =
    data.user.role === "admin" ||
    data.user.operations.includes("registrations");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fieldOpen = ["draft", "open", "locked"].includes(
    data.tournament.status,
  );
  const admin = data.user.role === "admin";
  const visible = data.applications.filter(
    (a) => filter === "all" || a.status === filter,
  );
  const items = () =>
    data.applications
      .filter((a) => selected.has(a.id))
      .map(({ id, revision }) => ({ id, revision }));
  const review = async (status: string, verified: boolean, done: string) => {
    if (await act({ action: "review", status, verified, items: items() }, done))
      setSelected(new Set());
  };
  return (
    <section className="panel p-4 md:p-7 space-y-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            className={`om-chip ${filter === key ? "om-chip-on" : ""}`}
            aria-pressed={filter === key}
            onClick={() => {
              setFilter(key);
              setSelected(new Set());
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {!fieldOpen && (
        <p className="notice">
          Fixtures exist, so player changes are locked. Reset fixtures (before
          any score) to change players.
        </p>
      )}
      {details && (
        <PlayerDetails
          key={details}
          tournament={data.tournament.id}
          playerId={details}
          close={() => setDetails(null)}
          changed={reload}
        />
      )}
      {fieldOpen && selected.size > 0 && (
        <div className="om-bulk">
          <button
            className="button-primary"
            onClick={() => {
              if (
                confirm(
                  "Approve the selected players? Confirm you verified them on WhatsApp.",
                )
              )
                void review(
                  "approved",
                  true,
                  "Approved. They now appear on the website.",
                );
            }}
          >
            Approve selected
          </button>
          <button
            className="button-secondary"
            onClick={() => void review("rejected", false, "Rejected.")}
          >
            Reject selected
          </button>
          <button
            className="button-secondary"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="control-table om-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all shown"
                  disabled={!fieldOpen}
                  checked={
                    visible.length > 0 &&
                    visible.every((a) => selected.has(a.id))
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(visible.map((a) => a.id))
                        : new Set(),
                    )
                  }
                />
              </th>
              <th>Player</th>
              <th>WhatsApp</th>
              <th>Status</th>
              <th>eFootball ID</th>
              {admin && <th className="sr-only">Remove</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <tr key={a.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${a.gaming_name}`}
                    disabled={!fieldOpen}
                    checked={selected.has(a.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(a.id);
                      else next.delete(a.id);
                      setSelected(next);
                    }}
                  />
                </td>
                <td>
                  <strong>{a.gaming_name}</strong>
                  <span className="block text-xs text-slate-400">
                    {a.team_name ?? "Team not recorded"} · {a.code}
                    {a.team_name_source && (
                      <span className="om-source">
                        {SOURCE_TAG[a.team_name_source]}
                      </span>
                    )}
                  </span>
                  {canDetails && (
                    <button
                      className="om-link"
                      onClick={() => setDetails(a.player_id)}
                    >
                      Edit details
                    </button>
                  )}
                </td>
                <td>
                  {a.contact && (
                    <span className="whitespace-nowrap">
                      <span className="font-mono">{a.contact}</span>{" "}
                      <ContactButton
                        tournament={data.tournament.id}
                        playerId={a.player_id}
                        purpose="registration_check"
                      />
                    </span>
                  )}
                </td>
                <td>
                  <span className={`om-status om-${a.status}`}>{a.status}</span>
                </td>
                <td>
                  {a.status !== "approved" ? (
                    <span className="text-xs text-slate-500">
                      After approval
                    </span>
                  ) : (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const v = new FormData(e.currentTarget).get(
                          "efootballId",
                        );
                        void act(
                          {
                            action: "efootball",
                            playerId: a.player_id,
                            efootballId: v,
                            hadId: !!a.efootballId,
                          },
                          `eFootball ID saved for ${a.gaming_name}.`,
                        );
                      }}
                    >
                      <input
                        name="efootballId"
                        defaultValue={a.efootballId ?? ""}
                        placeholder="Optional"
                        required
                        minLength={6}
                        maxLength={32}
                        pattern="[A-Za-z0-9-]{6,32}"
                        className="control-input !mt-0 font-mono uppercase min-w-[9rem]"
                        aria-label={`eFootball ID for ${a.gaming_name}`}
                      />
                      <button className="button-secondary om-small">
                        Apply
                      </button>
                    </form>
                  )}
                </td>
                {admin && (
                  <td>
                    <button
                      className="om-danger"
                      disabled={!fieldOpen}
                      title={
                        fieldOpen
                          ? "Remove from this tournament"
                          : "Reset fixtures first"
                      }
                      onClick={() => {
                        if (
                          confirm(
                            `Remove ${a.gaming_name} from ${data.tournament.name}? This is recorded in the activity log.`,
                          )
                        )
                          void act(
                            {
                              action: "remove",
                              id: a.id,
                              revision: a.revision,
                            },
                            `${a.gaming_name} removed.`,
                          );
                      }}
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <p className="text-slate-400 py-6">Nobody here yet.</p>
        )}
      </div>
    </section>
  );
}

function SetupTab({ data, act }: { data: Workspace; act: Act }) {
  const t = data.tournament;
  const fieldOpen = ["draft", "open", "locked"].includes(t.status);
  const [format, setFormat] = useState<FormatChoice>(formatChoice(t));
  const [seasonal, setSeasonal] = useState(!!t.season);
  const [published, setPublished] = useState(t.published);
  const [confirmName, setConfirmName] = useState("");
  const label = tournamentLabel(t);
  const closesLocal = t.registration_closes
    ? new Date(new Date(t.registration_closes).getTime() + 5.5 * 3600e3)
        .toISOString()
        .slice(0, 16)
    : "";
  return (
    <div className="space-y-6">
      <form
        className="panel p-4 md:p-7 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const num = (k: string) =>
            f.get(k) === "" || f.get(k) === null ? null : Number(f.get(k));
          const closes = String(f.get("registrationCloses") ?? "");
          void act(
            {
              action: "configure",
              revision: t.revision,
              name: f.get("name"),
              season: seasonal ? num("season") : null,
              published,
              format,
              qualifiers: Number(f.get("qualifiers") ?? t.qualifiers),
              legs: Number(f.get("legs") ?? t.legs),
              perPlayer: format !== "knockout" ? num("perPlayer") : null,
              startsOn: f.get("startsOn") || null,
              registrationCloses: closes ? `${closes}:00+05:30` : null,
              entryFee: num("entryFee"),
              prize: f.get("prize") ?? "",
              description: f.get("description") ?? "",
            },
            "Settings saved.",
          );
        }}
      >
        <h3 className="text-xl font-bold">Tournament settings</h3>
        <div className="flex flex-wrap gap-3">
          <Choice
            name="setupType"
            value="oneoff"
            label="One-off cup"
            checked={!seasonal}
            onChange={() => setSeasonal(false)}
          />
          <Choice
            name="setupType"
            value="season"
            label="Season of a competition"
            checked={seasonal}
            onChange={() => setSeasonal(true)}
          />
        </div>
        <div className="grid gap-5 md:grid-cols-[1fr_12rem]">
          <label className="block">
            {seasonal ? "Competition name" : "Tournament name"}
            <input
              name="name"
              defaultValue={t.competition ?? t.name}
              required
              minLength={2}
              maxLength={80}
              className="control-input"
            />
          </label>
          {seasonal && (
            <label className="block">
              Season number
              <input
                name="season"
                type="number"
                min={1}
                max={999}
                required
                defaultValue={t.season ?? 1}
                className="control-input"
                inputMode="numeric"
              />
            </label>
          )}
        </div>
        <PublishSwitch value={published} onChange={setPublished} />
        <fieldset
          disabled={!fieldOpen}
          className="space-y-5 disabled:opacity-60"
        >
          {!fieldOpen && (
            <p className="text-sm text-amber-200">
              Format settings are locked because fixtures exist.
            </p>
          )}
          <FormatChoices
            value={format}
            onChange={setFormat}
            name="formatChoice"
          />
          {format !== "knockout" && (
            <>
              <div>
                <p className="mb-2">League matches</p>
                <div className="flex flex-wrap gap-3">
                  <Choice
                    name="legs"
                    value="1"
                    label="Single (play each opponent once)"
                    defaultChecked={t.legs === 1}
                  />
                  <Choice
                    name="legs"
                    value="2"
                    label="Home & away (twice)"
                    defaultChecked={t.legs === 2}
                  />
                </div>
              </div>
              <label className="block">
                Matches per player{" "}
                <span className="text-slate-500">
                  (optional — empty means everyone plays everyone)
                </span>
                <input
                  name="perPlayer"
                  type="number"
                  min={1}
                  max={127}
                  defaultValue={t.opponents ?? ""}
                  className="control-input"
                  inputMode="numeric"
                />
              </label>
              {format === "league_knockout" && (
                <label className="block">
                  Players who qualify for the knockout
                  <select
                    name="qualifiers"
                    defaultValue={t.qualifiers}
                    className="control-input"
                  >
                    {[2, 4, 8, 16, 32].map((q) => (
                      <option key={q} value={q}>
                        Top {q}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </fieldset>
        <h3 className="text-xl font-bold pt-2">Shown on the website</h3>
        <p className="text-sm text-slate-400 -mt-3">
          Optional. Empty fields are hidden from the website.
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block">
            Start date
            <input
              name="startsOn"
              type="date"
              defaultValue={t.starts_on ?? ""}
              className="control-input"
            />
          </label>
          <label className="block">
            Registration closes (IST)
            <input
              name="registrationCloses"
              type="datetime-local"
              defaultValue={closesLocal}
              className="control-input"
            />
          </label>
          <label className="block">
            Entry fee (₹) <span className="text-slate-500">0 = free</span>
            <input
              name="entryFee"
              type="number"
              min={0}
              defaultValue={t.entry_fee ?? ""}
              className="control-input"
              inputMode="numeric"
            />
          </label>
          <label className="block">
            Prize
            <input
              name="prize"
              maxLength={80}
              defaultValue={t.prize ?? ""}
              className="control-input"
              placeholder="₹5,000 prize pool"
            />
          </label>
        </div>
        <label className="block">
          Short description
          <textarea
            name="description"
            maxLength={400}
            rows={3}
            defaultValue={t.description ?? ""}
            className="control-input"
          />
        </label>
        <div className="om-footer">
          <span />
          <button className="button-primary">Apply</button>
        </div>
      </form>

      <section className="panel p-4 md:p-7">
        <h3 className="text-xl font-bold">Registration</h3>
        <p className="text-slate-400 mt-1">
          {PHASE[t.status]}
          {!t.published &&
            t.status === "draft" &&
            " · Opening registration also publishes it on the website."}
        </p>
        <div className="flex flex-wrap gap-3 mt-4">
          <button
            className="button-primary"
            disabled={!fieldOpen || t.status === "open"}
            onClick={() =>
              void act(
                { action: "registration", open: true },
                "Registration is open on the website.",
              )
            }
          >
            Open registration
          </button>
          <button
            className="button-secondary"
            disabled={!fieldOpen || t.status !== "open"}
            onClick={() =>
              void act(
                { action: "registration", open: false },
                "Registration closed.",
              )
            }
          >
            Close registration
          </button>
        </div>
      </section>

      {data.user.role === "admin" && (
        <section className="panel p-4 md:p-7 om-danger-zone">
          <h3 className="text-xl font-bold">Delete tournament</h3>
          <p className="text-slate-400 mt-1">
            Removes it from the website and the Organizer Manager. It stays in
            the activity log and can be restored from the tournament list.
          </p>
          <label className="block mt-4">
            Type <strong className="text-white">{label}</strong> to confirm
            <input
              className="control-input"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="om-footer">
            <span />
            <button
              className="om-danger-button"
              disabled={
                ![t.name, label].some(
                  (n) => n.toLowerCase() === confirmName.trim().toLowerCase(),
                )
              }
              onClick={() =>
                void act(
                  { action: "delete_tournament", confirm: confirmName },
                  `${label} deleted. Restore it from the tournament list if needed.`,
                )
              }
            >
              <Trash2 size={16} aria-hidden="true" /> Delete tournament
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function FixturesTab({
  data,
  act,
  names,
}: {
  data: Workspace;
  act: Act;
  names: Map<string, string>;
}) {
  const t = data.tournament;
  const admin = data.user.role === "admin";
  const fieldOpen = ["draft", "open", "locked"].includes(t.status);
  const missingIds = data.applications
    .filter((a) => a.status === "approved" && !a.efootballId)
    .map((a) => a.gaming_name);
  const [reviewing, setReviewing] = useState(false);
  const anyScore = data.fixtures.some((f) => f.home_score !== null);
  const allScored =
    data.fixtures.length > 0 &&
    data.fixtures.every((f) => f.home_score !== null);

  if (t.format === "knockout")
    return (
      <section className="panel p-4 md:p-7 space-y-4">
        <h3 className="text-xl font-bold">
          Knockout (played in the eFootball app)
        </h3>
        <p className="text-slate-400">
          Approved players play the knockout in the app. Use these to keep the
          website status right.
        </p>
        {missingIds.length > 0 && (
          <p className="notice text-amber-200">
            Reminder — no eFootball ID yet for: {missingIds.join(", ")}.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {t.status === "locked" && (
            <button
              className="button-primary"
              onClick={() => void act({ action: "start" }, "Knockout started.")}
            >
              Start knockout
            </button>
          )}
          {t.status === "knockout" && (
            <button
              className="button-primary"
              onClick={() =>
                confirm("Mark this tournament completed?") &&
                void act({ action: "complete" }, "Tournament completed.")
              }
            >
              Mark completed
            </button>
          )}
          {["draft", "open"].includes(t.status) && (
            <p className="text-sm text-slate-400">
              Close registration first (Set up).
            </p>
          )}
        </div>
      </section>
    );

  const rounds = new Map<number, Match[]>();
  for (const f of data.fixtures)
    rounds.set(f.round, [...(rounds.get(f.round) ?? []), f]);

  return (
    <div className="space-y-6">
      {admin && (
        <section className="panel p-4 md:p-7 space-y-4">
          {missingIds.length > 0 && (
            <p className="notice text-amber-200">
              Reminder — no eFootball ID yet for: {missingIds.join(", ")}. You
              can add them any time.
            </p>
          )}
          {fieldOpen ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const shuffle =
                  new FormData(e.currentTarget).get("shuffle") === "on";
                if (
                  confirm(
                    "Generate the league fixtures for all approved players? Player changes lock until you reset.",
                  )
                )
                  void act(
                    { action: "generate", shuffle },
                    "Fixtures generated. They're live on the website.",
                  );
              }}
            >
              <h3 className="text-xl font-bold">Generate league fixtures</h3>
              <p className="text-slate-400">
                {t.legs === 2 ? "Home & away" : "Single matches"}
                {t.opponents
                  ? `, ${t.opponents} matches per player`
                  : ", everyone plays everyone"}
                {t.knockout ? `, then Top ${t.qualifiers} to the knockout` : ""}
                . Change this in Set up.
              </p>
              <label className="om-check">
                <input type="checkbox" name="shuffle" defaultChecked /> Random
                draw
              </label>
              <div className="om-footer">
                <span className="text-sm text-slate-400">
                  {t.status !== "locked" ? "Close registration first." : ""}
                </span>
                <button
                  className="button-primary"
                  disabled={t.status !== "locked"}
                >
                  Generate fixtures
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-3">
              {t.status === "league" && !anyScore && (
                <button
                  className="button-secondary"
                  onClick={() =>
                    confirm(
                      "Remove all fixtures? Possible only before any score.",
                    ) && void act({ action: "reset" }, "Fixtures removed.")
                  }
                >
                  Reset fixtures
                </button>
              )}
              {t.status === "league" && t.knockout && (
                <button
                  className="button-primary"
                  disabled={!allScored}
                  onClick={() =>
                    void act(
                      { action: "qualify" },
                      `Top ${t.qualifiers} confirmed for the knockout.`,
                    )
                  }
                >
                  Confirm Top {t.qualifiers}
                </button>
              )}
              {t.status === "league" && !t.knockout && (
                <button
                  className="button-primary"
                  disabled={!allScored}
                  onClick={() => setReviewing(true)}
                >
                  Finish league
                </button>
              )}
              {t.status === "knockout" && (
                <button
                  className="button-primary"
                  onClick={() =>
                    confirm("Mark this tournament completed?") &&
                    void act({ action: "complete" }, "Tournament completed.")
                  }
                >
                  Mark completed
                </button>
              )}
              {t.status === "league" && !allScored && (
                <span className="text-sm text-slate-400 self-center">
                  Enter every score to finish the league.
                </span>
              )}
            </div>
          )}
          {reviewing && t.status === "league" && !t.knockout && (
            <FinishLeague
              data={data}
              act={act}
              cancel={() => setReviewing(false)}
            />
          )}
          {t.status === "league" && t.knockout && allScored && (
            <details className="om-card">
              <summary className="cursor-pointer">
                Tie at the qualification cutoff?
              </summary>
              <form
                className="space-y-4 mt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act(
                    {
                      action: "qualify",
                      playoffWinners: f.getAll("winners"),
                      evidence: f.get("evidence"),
                    },
                    "Playoff winners qualified.",
                  );
                }}
              >
                <p className="text-slate-400 text-sm">
                  Only when players are level on points, goal difference and
                  goals. Tick who won the playoff.
                </p>
                <div className="om-checks max-h-48 overflow-auto">
                  {data.standings.map((p) => (
                    <label className="om-check" key={p.id}>
                      <input name="winners" value={p.id} type="checkbox" />{" "}
                      {p.name}
                    </label>
                  ))}
                </div>
                <label className="block">
                  How the playoff was decided
                  <textarea
                    className="control-input"
                    name="evidence"
                    minLength={10}
                    maxLength={2000}
                    required
                  />
                </label>
                <div className="om-footer">
                  <span />
                  <button className="button-primary">Apply</button>
                </div>
              </form>
            </details>
          )}
        </section>
      )}
      {data.fixtures.length === 0 ? (
        <p className="notice">Fixtures appear here after they are generated.</p>
      ) : (
        [...rounds].map(([round, list]) => (
          <section key={round} className="panel p-4 md:p-6">
            <h3 className="text-lg font-semibold mb-3">Round {round}</h3>
            <div className="space-y-3">
              {list.map((f) => (
                <form
                  key={f.id}
                  className="om-score"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = new FormData(e.currentTarget);
                    void act(
                      {
                        action: "score",
                        id: f.id,
                        revision: f.revision,
                        homeScore: Number(v.get("home")),
                        awayScore: Number(v.get("away")),
                      },
                      "Score saved.",
                    );
                  }}
                >
                  <span className="om-score-name">{names.get(f.home)}</span>
                  <input
                    name="home"
                    required
                    type="number"
                    min={0}
                    max={99}
                    defaultValue={f.home_score ?? ""}
                    className="control-input !mt-0"
                    aria-label={`${names.get(f.home)} goals`}
                    disabled={t.status !== "league"}
                    inputMode="numeric"
                  />
                  <span className="text-slate-500">–</span>
                  <input
                    name="away"
                    required
                    type="number"
                    min={0}
                    max={99}
                    defaultValue={f.away_score ?? ""}
                    className="control-input !mt-0"
                    aria-label={`${names.get(f.away)} goals`}
                    disabled={t.status !== "league"}
                    inputMode="numeric"
                  />
                  <span className="om-score-name text-right">
                    {names.get(f.away)}
                  </span>
                  {t.status === "league" && (
                    <button className="button-secondary om-small">Apply</button>
                  )}
                </form>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

/**
 * League-only: the final table PROPOSES 1st–3rd; an organizer must confirm
 * (and may correct, e.g. after a tie-break) before the league is finished.
 */
function FinishLeague({
  data,
  act,
  cancel,
}: {
  data: Workspace;
  act: Act;
  cancel: () => void;
}) {
  const table = data.standings;
  const [places, setPlaces] = useState<string[]>(
    [0, 1, 2].map((i) => table[i]?.id ?? ""),
  );
  // Level on points and goal difference around the podium: needs a human look.
  const tie = table
    .slice(0, 4)
    .some(
      (r, i, all) =>
        i > 0 && r.pts === all[i - 1].pts && r.gd === all[i - 1].gd,
    );
  const changed = places.some((p, i) => p !== (table[i]?.id ?? ""));
  return (
    <form
      className="om-card space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void act(
          { action: "complete", podium: places.map((p) => p || null) },
          "League finished. Final positions confirmed and published.",
        ).then((ok) => ok && cancel());
      }}
    >
      <h3 className="text-xl font-bold">Confirm final positions</h3>
      <p className="text-slate-400 text-sm">
        Proposed from the final league table. Nothing is published until you
        confirm. The confirmation is recorded in the activity log.
      </p>
      {tie && (
        <p className="notice text-amber-200">
          Players near the top are level on points and goal difference. Check
          the tie-break before confirming.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {["1st — Champion", "2nd — Runner-up", "3rd"].map((label, i) => (
          <label className="block" key={label}>
            {label}
            <select
              className="control-input"
              value={places[i]}
              required={i === 0}
              onChange={(e) => {
                const next = [...places];
                next[i] = e.target.value;
                setPlaces(next);
              }}
            >
              <option value="">— Not set —</option>
              {table.map((r, j) => (
                <option
                  key={r.id}
                  value={r.id}
                  disabled={places.includes(r.id) && places[i] !== r.id}
                >
                  {j + 1}. {r.name} ({r.pts} pts)
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {changed && (
        <p className="text-sm text-amber-200">
          This differs from the table order — it will be noted in the activity
          log.
        </p>
      )}
      <div className="om-footer">
        <button type="button" className="button-secondary" onClick={cancel}>
          Cancel
        </button>
        <button className="button-primary" disabled={!places[0]}>
          Confirm and finish league
        </button>
      </div>
    </form>
  );
}

type HealthSection = {
  title: string;
  checks: {
    title: string;
    level: "ok" | "warn" | "error" | "info";
    detail: string;
    items?: string[];
  }[];
};

/** Read-only integrity report (admins). Nothing here changes data. */
function DataHealth() {
  const [sections, setSections] = useState<HealthSection[] | null>(null);
  const [error, setError] = useState("");
  const fetchReport = useCallback(async () => {
    try {
      const r = await fetch("/api/admin?health=1", { cache: "no-store" });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setSections(v);
      setError("");
    } catch (e) {
      setError((e as Error).message || "Could not load the report.");
    }
  }, []);
  const load = () => {
    setError("");
    setSections(null);
    void fetchReport();
  };
  useEffect(() => {
    const go = async () => {
      await fetchReport();
    };
    void go();
  }, [fetchReport]);
  const LABEL = { ok: "OK", warn: "Review", error: "Problem", info: "Info" };
  return (
    <section className="panel p-4 md:p-7 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Data health</h2>
          <p className="text-slate-400 mt-1 text-sm">
            Read-only checks of player IDs, tournaments, results, placements,
            the ranking and the legacy archive. Nothing is changed, merged or
            deleted from here.
          </p>
        </div>
        <button className="button-secondary" onClick={load}>
          <RefreshCw size={16} aria-hidden="true" /> Run again
        </button>
      </div>
      {error && <p className="notice text-amber-200">{error}</p>}
      {!sections && !error && <p className="text-slate-400">Checking…</p>}
      {sections?.map((sec) => (
        <div key={sec.title}>
          <h3 className="text-lg font-bold mb-2">{sec.title}</h3>
          <ul className="space-y-2">
            {sec.checks.map((c) => (
              <li key={c.title} className="om-card">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`om-health om-health-${c.level}`}>
                    {LABEL[c.level]}
                  </span>
                  <strong>{c.title}</strong>
                </div>
                <p className="text-sm text-slate-300 mt-1">{c.detail}</p>
                {c.items && c.items.length > 0 && (
                  <ul className="mt-2 text-sm text-slate-400 list-disc pl-5">
                    {c.items.slice(0, 50).map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** Shrinks a photo in the browser to a JPEG under ~700 KB before upload. */
async function compress(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  for (const [edge, quality] of [
    [1400, 0.85],
    [1200, 0.8],
    [1000, 0.75],
    [800, 0.7],
  ] as const) {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", quality),
    );
    if (blob && blob.size <= 700 * 1024) return blob;
  }
  throw new Error("This photo is too large. Try a smaller one.");
}

function PodiumTab({
  data,
  act,
  reload,
}: {
  data: Workspace;
  act: Act;
  reload: () => Promise<void>;
}) {
  const t = data.tournament;
  const approved = data.applications.filter((a) => a.status === "approved");
  const auto = t.format === "league" && !t.knockout;
  const [places, setPlaces] = useState<string[]>(
    data.podium.map((p) => p ?? ""),
  );
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState("");
  const upload = async () => {
    if (!file) return;
    setState("Uploading…");
    try {
      const blob = await compress(file);
      const r = await fetch(
        `/api/admin/photo?t=${encodeURIComponent(t.id)}&consent=yes`,
        {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: blob,
        },
      );
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setFile(null);
      setConsent(false);
      await reload();
      setState("Photo saved.");
    } catch (e) {
      setState((e as Error).message);
    }
  };
  return (
    <div className="space-y-6">
      <form
        className="panel p-4 md:p-7 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void act(
            { action: "podium", places: places.map((p) => p || null) },
            "Final positions saved. They show on the website and player profiles.",
          );
        }}
      >
        <h3 className="text-xl font-bold">Final positions</h3>
        <p className="text-slate-400 -mt-3">
          {auto
            ? "Confirmed by an organizer when the league was finished. Change them only if needed."
            : "Enter who finished 1st, 2nd and 3rd in the knockout (eFootball app)."}
        </p>
        <div className="grid gap-5 md:grid-cols-3">
          {["1st — Champion", "2nd — Runner-up", "3rd"].map((label, i) => (
            <label className="block" key={label}>
              {label}
              <select
                className="control-input"
                value={places[i]}
                onChange={(e) => {
                  const next = [...places];
                  next[i] = e.target.value;
                  setPlaces(next);
                }}
              >
                <option value="">— Not set —</option>
                {approved.map((a) => (
                  <option
                    key={a.player_id}
                    value={a.player_id}
                    disabled={
                      places.includes(a.player_id) && places[i] !== a.player_id
                    }
                  >
                    {a.gaming_name} ({a.code})
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="om-footer">
          <span />
          <button className="button-primary">Apply</button>
        </div>
      </form>
      <section className="panel p-4 md:p-7 space-y-4">
        <h3 className="text-xl font-bold">Champion photo</h3>
        <p className="text-slate-400">
          Shown on the Champions shelf. Upload only after the player agrees.
          Photos are resized automatically.
        </p>
        {data.photo && (
          <div className="flex flex-wrap items-end gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/admin/photo?t=${encodeURIComponent(t.id)}&v=${data.photo}`}
              alt="Current champion photo"
              className="om-photo"
            />
            <button
              className="button-secondary"
              onClick={() =>
                confirm("Remove the champion photo?") &&
                void act({ action: "remove_photo" }, "Photo removed.")
              }
            >
              Remove photo
            </button>
          </div>
        )}
        <input
          key={data.photo ?? 0}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="control-input"
          aria-label="Choose champion photo"
        />
        <label className="om-check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />{" "}
          The player agreed to this photo being shown on the website
        </label>
        <div className="om-footer">
          <span role="status" className="text-sm text-slate-400">
            {state}
          </span>
          <button
            type="button"
            className="button-primary"
            disabled={!file || !consent}
            onClick={() => void upload()}
          >
            Apply
          </button>
        </div>
      </section>
    </div>
  );
}

function StandingsTab({ data }: { data: Workspace }) {
  const t = data.tournament;
  const qualified = new Set(data.qualified);
  return (
    <section className="panel p-4 md:p-7 overflow-x-auto">
      <table className="control-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>GD</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {data.standings.map((p, i) => (
            <tr
              key={p.id}
              className={
                t.knockout && i === t.qualifiers - 1 ? "om-cutoff" : ""
              }
            >
              <td>{i + 1}</td>
              <td>
                {p.name}
                {qualified.has(p.id) && (
                  <span className="qualified-badge">Qualified</span>
                )}
              </td>
              <td>{p.played}</td>
              <td>{p.won}</td>
              <td>{p.drawn}</td>
              <td>{p.lost}</td>
              <td>{p.gd}</td>
              <td>
                <strong>{p.pts}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.standings.length && (
        <p className="text-slate-400 py-6">
          Approve players to start the table.
        </p>
      )}
    </section>
  );
}

function AnnouncementsTab({ data, act }: { data: Workspace; act: Act }) {
  return (
    <div className="space-y-6">
      <form
        className="panel p-4 md:p-7 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          if (
            await act(
              {
                action: "announce",
                title: f.get("title"),
                message: f.get("message"),
              },
              "Update posted on the website.",
            )
          )
            form.reset();
        }}
      >
        <h3 className="text-xl font-bold">Post an update</h3>
        <p className="text-sm text-slate-400 -mt-3">
          Shows in the tournament&apos;s Updates tab on the website, newest
          first.
        </p>
        <label className="block">
          Title
          <input
            name="title"
            required
            maxLength={120}
            className="control-input"
          />
        </label>
        <label className="block">
          Message
          <textarea
            required
            name="message"
            maxLength={2000}
            className="control-input"
            rows={5}
          />
        </label>
        <div className="om-footer">
          <span />
          <button className="button-primary">Apply</button>
        </div>
      </form>
      {data.announcements.map((a) => (
        <article key={a.id} className="panel p-5">
          <p className="text-xs text-slate-500">
            {new Date(a.created_at).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
          <h4 className="font-semibold">{a.title}</h4>
          <p className="text-slate-300 mt-2 whitespace-pre-wrap">{a.message}</p>
        </article>
      ))}
    </div>
  );
}

/* ─────────────────────────── Small pieces ─────────────────────────── */

function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Sections"
      className="flex gap-2 overflow-x-auto py-5"
    >
      {tabs.map(([key, label]) => (
        <button
          key={key}
          role="tab"
          aria-selected={key === value}
          className={key === value ? "button-primary" : "button-secondary"}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Choice(props: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: () => void;
}) {
  const { label, ...input } = props;
  return (
    <label className="om-choice">
      <input type="radio" {...input} /> {label}
    </label>
  );
}

/* ─────────────────────────── Edit player details ─────────────────────────── */

type EditResult = {
  ok: boolean;
  error?: string;
  data?: Record<string, unknown>;
};

/**
 * Sends one edit. A form keeps the same request ID until it succeeds, so a retry
 * after a dropped connection can never apply the change twice.
 */
function useEditSender() {
  const ids = useRef<Record<string, string>>({});
  return async (
    form: string,
    value: Record<string, unknown>,
  ): Promise<EditResult> => {
    ids.current[form] ??= crypto.randomUUID();
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...value, requestId: ids.current[form] }),
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) {
        // A refused change was never recorded, so a corrected resubmit is a new request.
        if (r.status < 500) delete ids.current[form];
        return { ok: false, error: result.error ?? "Something went wrong." };
      }
      delete ids.current[form];
      return { ok: true, data: result };
    } catch {
      return {
        ok: false,
        error: "No connection. Nothing is lost; press the button again.",
      };
    }
  };
}

type ContactInfo = {
  masked: string;
  version: number;
  attestedAt: string | null;
  method: string | null;
  route1Available: boolean;
  hasEfootballId: boolean;
  editingOn: boolean;
  canEdit: boolean;
  openChange: {
    id: string;
    route: string;
    evidenceType: string | null;
    status: string;
    requestedByMe: boolean;
    requestedByName: string | null;
    codeExpiresAt: string | null;
    expiresAt: string;
    approveBy: string | null;
    attemptsLeft: number;
    resendsLeft: number;
  } | null;
};
type PlayerDetailsData = {
  role: "admin" | "coordinator";
  contact: ContactInfo | null;
  canEdit: {
    name: boolean;
    team: boolean;
    tournamentTeams: boolean;
    efootball: boolean;
    whatsapp: boolean;
  };
  player: {
    id: string;
    code: string;
    gaming_name: string;
    team_name: string | null;
    hasEfootballId: boolean;
    efootballId?: string | null;
    removed: boolean;
  };
  entries: {
    id: string;
    tournament: string;
    label: string;
    status: string;
    removed: boolean;
    tournamentDeleted: boolean;
    team_name: string | null;
    team_name_source: TeamSource | null;
  }[];
  history: {
    id: number;
    created_at: string;
    actor_name: string | null;
    action: string;
    summary: string | null;
  }[];
};

function PlayerDetails({
  tournament,
  playerId,
  close,
  changed,
}: {
  tournament: string;
  playerId: string;
  close: () => void;
  changed: () => Promise<void>;
}) {
  const [d, setD] = useState<PlayerDetailsData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const send = useEditSender();
  const load = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/admin?t=${encodeURIComponent(tournament)}&player=${encodeURIComponent(playerId)}`,
        { cache: "no-store" },
      );
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setD(v);
    } catch (e) {
      setError((e as Error).message || "Could not load the player.");
    }
  }, [tournament, playerId]);
  useEffect(() => {
    const go = async () => {
      await load();
    };
    void go();
  }, [load]);

  const submit = async (
    form: string,
    value: Record<string, unknown>,
    done: string,
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    const r = await send(form, value);
    if (r.ok) setNotice(done);
    else setError(r.error!);
    // Reload either way: after a conflict the organizer sees the current values.
    await load();
    if (r.ok) await changed();
    setBusy(false);
    return r.ok;
  };

  return (
    <section
      className="om-card space-y-5"
      aria-labelledby="pd-title"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="pd-title" className="text-xl font-bold">
          Edit player details
          {d && (
            <span className="text-slate-400 font-normal">
              {" "}
              · {d.player.code}
            </span>
          )}
        </h3>
        <button className="button-secondary om-small" onClick={close}>
          Close
        </button>
      </div>
      <p className="text-sm text-slate-400">
        The XG ID, results, fixtures and standings never change here. Every save
        needs a reason and is recorded in the activity log.
      </p>
      {error && (
        <p role="alert" className="notice text-amber-200">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice text-cyan-200">
          {notice}
        </p>
      )}
      {!d && !error && <p className="text-slate-400">Loading…</p>}
      {d && (
        <fieldset disabled={busy} className="space-y-5">
          {d.player.removed && (
            <p className="notice">
              This player record was removed, so it can&apos;t be edited.
            </p>
          )}
          <EditField
            label="Gaming name"
            name="name"
            current={d.player.gaming_name}
            editable={d.canEdit.name}
            note="Changes the name shown everywhere. Results stay with the same player."
            onSave={(value, reason) =>
              submit(
                "name",
                {
                  action: "player.edit_name",
                  tournament,
                  playerId,
                  expected: d.player.gaming_name,
                  name: value,
                  reason,
                },
                "Gaming name saved.",
              )
            }
          />
          <EditField
            label="Current team"
            name="team"
            current={d.player.team_name}
            editable={d.canEdit.team}
            note="The player's team from now on. It never changes a tournament's team."
            onSave={(value, reason) =>
              submit(
                "team",
                {
                  action: "player.edit_team",
                  tournament,
                  playerId,
                  expected: d.player.team_name,
                  team: value,
                  reason,
                },
                "Current team saved.",
              )
            }
          />
          {"efootballId" in d.player && (
            <EditField
              label="eFootball ID"
              name="efootball"
              current={d.player.efootballId ?? null}
              editable={d.canEdit.efootball}
              mono
              note="Must be unique. Stored encrypted; the log never shows it."
              onSave={(value, reason) =>
                submit(
                  "efootball",
                  {
                    action: "player.edit_efootball",
                    tournament,
                    playerId,
                    expectedHadId: d.player.hasEfootballId,
                    efootballId: value,
                    reason,
                  },
                  "eFootball ID saved.",
                )
              }
            />
          )}
          {d.contact && (
            <WhatsAppSection
              tournament={tournament}
              playerId={playerId}
              contact={d.contact}
              admin={d.role === "admin"}
              removed={d.player.removed}
              reload={async () => {
                await load();
                await changed();
              }}
            />
          )}
          {d.canEdit.tournamentTeams && (
            <div>
              <h4 className="font-semibold mb-2">Team in each tournament</h4>
              <div className="overflow-x-auto">
                <table className="control-table">
                  <thead>
                    <tr>
                      <th>Tournament</th>
                      <th>Team</th>
                      <th>Source</th>
                      <th className="sr-only">Correct</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.entries.map((e) => (
                      <tr key={e.id}>
                        <td>
                          {e.label}
                          <span className="block text-xs text-slate-500">
                            {e.removed ? "removed entry" : e.status}
                          </span>
                        </td>
                        <td>{e.team_name ?? "Not recorded"}</td>
                        <td>
                          {e.team_name_source
                            ? SOURCE_TAG[e.team_name_source]
                            : "—"}
                        </td>
                        <td>
                          {!e.removed && !e.tournamentDeleted && (
                            <CorrectTeam
                              entry={e}
                              onSave={(v) =>
                                submit(
                                  `correct-${e.id}`,
                                  {
                                    action: "application.team_correct",
                                    tournament: e.tournament,
                                    applicationId: e.id,
                                    expectedTeam: e.team_name,
                                    expectedSource: e.team_name_source,
                                    ...v,
                                  },
                                  `Team saved for ${e.label}.`,
                                )
                              }
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Entries with no team can also be attested from Data health →
                Team names per tournament.
              </p>
            </div>
          )}
          {d.history.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm">
                Changes to this player ({d.history.length})
              </summary>
              <ul className="mt-2 text-sm text-slate-400 space-y-1">
                {d.history.map((h) => (
                  <li key={h.id}>
                    {new Date(h.created_at).toLocaleString("en-IN")} ·{" "}
                    {h.actor_name ?? "—"} · {h.summary ?? h.action}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </fieldset>
      )}
    </section>
  );
}

function EditField({
  label,
  name,
  current,
  editable,
  note,
  mono,
  onSave,
}: {
  label: string;
  name: string;
  current: string | null;
  editable: boolean;
  note: string;
  mono?: boolean;
  onSave: (value: string, reason: string) => Promise<boolean>;
}) {
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        void onSave(
          String(f.get("value") ?? ""),
          String(f.get("reason") ?? ""),
        ).then((ok) => {
          if (ok) form.reset();
        });
      }}
    >
      <p className="font-semibold">{label}</p>
      <p className={mono ? "font-mono" : ""}>{current ?? "—"}</p>
      {editable && (
        <div className="grid gap-2 md:grid-cols-[1fr_1.4fr_auto]">
          <input
            name="value"
            required
            minLength={name === "efootball" ? 6 : 2}
            maxLength={name === "efootball" ? 32 : 40}
            placeholder={`New ${label.toLowerCase()}`}
            className={`control-input !mt-0 ${mono ? "font-mono uppercase" : ""}`}
            aria-label={`New ${label.toLowerCase()}`}
          />
          <input
            name="reason"
            required
            minLength={5}
            maxLength={300}
            placeholder="Reason (required)"
            className="control-input !mt-0"
            aria-label={`Reason for changing the ${label.toLowerCase()}`}
          />
          <button className="button-secondary">Save</button>
        </div>
      )}
      <p className="text-xs text-slate-500">{note}</p>
    </form>
  );
}

/** Set or correct one tournament's team, with a written evidence note. */
function CorrectTeam({
  entry,
  onSave,
}: {
  entry: { label: string; team_name: string | null };
  onSave: (v: {
    team: string;
    evidence: string;
    reason: string;
    confirmOverwrite: boolean;
  }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button className="om-link" onClick={() => setOpen(true)}>
        {entry.team_name ? "Correct" : "Set with evidence"}
      </button>
    );
  return (
    <form
      className="space-y-2 min-w-[16rem]"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void onSave({
          team: String(f.get("team") ?? ""),
          evidence: String(f.get("evidence") ?? ""),
          reason: String(f.get("reason") ?? ""),
          confirmOverwrite: f.get("overwrite") === "on",
        }).then((ok) => ok && setOpen(false));
      }}
    >
      <input
        name="team"
        required
        minLength={2}
        maxLength={40}
        placeholder="Team in this tournament"
        className="control-input !mt-0"
        aria-label={`Team in ${entry.label}`}
      />
      <input
        name="evidence"
        required
        minLength={5}
        maxLength={300}
        placeholder="Evidence (e.g. WhatsApp registration message, 29 Oct)"
        className="control-input !mt-0"
        aria-label="Evidence"
      />
      <input
        name="reason"
        required
        minLength={5}
        maxLength={300}
        placeholder="Reason"
        className="control-input !mt-0"
        aria-label="Reason"
      />
      {entry.team_name && (
        <label className="flex gap-2 text-sm">
          <input type="checkbox" name="overwrite" required />
          Replace the recorded team &ldquo;{entry.team_name}&rdquo;
        </label>
      )}
      <div className="flex gap-2">
        <button className="button-secondary om-small">Save</button>
        <button
          type="button"
          className="om-link"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

type ReviewEntry = {
  applicationId: string;
  tournament: string;
  label: string;
  status: string;
  code: string;
  gaming_name: string;
  currentTeam: string | null;
  evidence: {
    entries: number;
    registration_records: number;
    registration_audit_id: number | null;
    registration_at: string | null;
    record_has_team: boolean;
    team_edits: number;
  };
  eligible: boolean;
  reasons: string[];
};

const ATTEST_REASON =
  "Historical entry before 007; Owner attestation 13 Nov 2026";

/**
 * Data health → Team names per tournament → Review (main admins).
 * Lists entries with no tournament team, with live evidence. Attesting copies the
 * player's current team shown here; nothing can be typed in.
 */
function TeamReview() {
  const [data, setData] = useState<{
    display: string;
    entries: ReviewEntry[];
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const send = useEditSender();
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin?teams=1", { cache: "no-store" });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setData(v);
    } catch (e) {
      setError((e as Error).message || "Could not load the review.");
    }
  }, []);
  useEffect(() => {
    const go = async () => {
      await load();
    };
    void go();
  }, [load]);
  const submit = async (
    form: string,
    value: Record<string, unknown>,
    done: string,
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    const r = await send(form, value);
    if (r.ok) setNotice(done);
    else setError(r.error!);
    await load();
    setBusy(false);
    return r.ok;
  };
  return (
    <section
      className="panel p-4 md:p-7 space-y-5 mt-6"
      aria-labelledby="tr-title"
    >
      <div>
        <h2 id="tr-title" className="text-2xl font-bold">
          Team names per tournament: review
        </h2>
        <p className="text-slate-400 mt-1 text-sm">
          Entries with no team recorded for their tournament. The evidence is
          computed from the database. Attesting copies the current team shown;
          anything else needs &ldquo;Set with evidence&rdquo;. Each action is
          recorded in the activity log.
        </p>
      </div>
      {error && (
        <p role="alert" className="notice text-amber-200">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice text-cyan-200">
          {notice}
        </p>
      )}
      {!data && !error && <p className="text-slate-400">Checking…</p>}
      {data && !data.entries.length && (
        <p className="text-slate-300">Every entry has a recorded team.</p>
      )}
      <fieldset disabled={busy} className="space-y-3">
        {data?.entries.map((e) => (
          <article key={e.applicationId} className="om-card space-y-2">
            <p>
              <strong>{e.gaming_name}</strong>{" "}
              <span className="text-slate-400">
                · {e.code} · {e.label} · {e.status}
              </span>
            </p>
            <p>
              Proposed team: <strong>{e.currentTeam ?? "—"}</strong>{" "}
              <span className="text-xs text-slate-500">
                (the player&apos;s current team, read-only)
              </span>
            </p>
            <ul className="text-sm text-slate-400 list-disc pl-5">
              <li>Tournament entries for this player: {e.evidence.entries}</li>
              <li>
                Registration records: {e.evidence.registration_records}
                {e.evidence.registration_audit_id !== null &&
                  ` (record #${e.evidence.registration_audit_id}${e.evidence.registration_at ? `, ${new Date(e.evidence.registration_at).toLocaleString("en-IN")}` : ""})`}
                {e.evidence.record_has_team
                  ? ", a record includes a team"
                  : ", no team field"}
              </li>
              <li>
                Current-team edits in OM since registration:{" "}
                {e.evidence.team_edits}
              </li>
            </ul>
            {e.eligible ? (
              <form
                className="space-y-2"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  const f = new FormData(ev.currentTarget);
                  void submit(
                    `attest-${e.applicationId}`,
                    {
                      action: "application.team_attest",
                      tournament: e.tournament,
                      applicationId: e.applicationId,
                      expectedTeam: e.currentTeam,
                      confirm: f.get("confirm") === "on",
                      reason: String(f.get("reason") ?? ""),
                    },
                    `Attested ${e.currentTeam} for ${e.gaming_name} in ${e.label}.`,
                  );
                }}
              >
                <label className="flex gap-2 text-sm">
                  <input type="checkbox" name="confirm" required />I confirm
                  this player registered once through the website and the team
                  shown is the team they registered with.
                </label>
                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    name="reason"
                    required
                    minLength={5}
                    maxLength={300}
                    defaultValue={ATTEST_REASON}
                    className="control-input !mt-0"
                    aria-label="Reason"
                  />
                  <button className="button-primary">Attest</button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-amber-200">
                Can&apos;t be attested: {e.reasons.join("; ")}.
              </p>
            )}
            <CorrectTeam
              entry={{ label: e.label, team_name: null }}
              onSave={(v) =>
                submit(
                  `correct-${e.applicationId}`,
                  {
                    action: "application.team_correct",
                    tournament: e.tournament,
                    applicationId: e.applicationId,
                    expectedTeam: null,
                    expectedSource: null,
                    ...v,
                  },
                  `Team saved for ${e.gaming_name} in ${e.label}.`,
                )
              }
            />
          </article>
        ))}
      </fieldset>
      {data && (
        <p className="text-xs text-slate-500">
          Website display: TEAM_DISPLAY={data.display}.
        </p>
      )}
    </section>
  );
}

/* ─────────────────────────── WhatsApp numbers ─────────────────────────── */

const METHOD_LABEL: Record<string, string> = {
  organizer_attested_established_channel:
    "organizer-attested through the established channel",
  organizer_attested_independent_evidence:
    "organizer-attested with independent evidence and a second admin",
};
const EVIDENCE_LABEL: Record<string, string> = {
  efootball_possession: "eFootball account possession (server challenge)",
  known_person_live_video: "Live video with an admin who knows the player",
  known_person_in_person: "In person with an admin who knows the player",
};

/** Asks the server for one number (audited, rate-limited). Nothing is kept afterwards. */
async function disclose(
  tournament: string,
  playerId: string,
  purpose: string,
): Promise<{ phone: string; waUrl: string } | { error: string }> {
  try {
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "contact.disclose",
        tournament,
        playerId,
        purpose,
        requestId: crypto.randomUUID(),
      }),
    });
    const v = await r.json().catch(() => ({}));
    if (!r.ok) return { error: v.error ?? "Could not open the number." };
    return { phone: v.phone, waUrl: v.waUrl };
  } catch {
    return { error: "No connection." };
  }
}

/** "Contact on WhatsApp": opens the chat; the number is never placed in the page. */
function ContactButton({
  tournament,
  playerId,
  purpose,
}: {
  tournament: string;
  playerId: string;
  purpose: string;
}) {
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className="om-link"
        onClick={async () => {
          setError("");
          // Opened first, so the browser doesn't block it after the request.
          const tab = window.open("about:blank", "_blank");
          const r = await disclose(tournament, playerId, purpose);
          if ("error" in r) {
            tab?.close();
            setError(r.error);
            return;
          }
          if (tab) {
            tab.opener = null;
            tab.location.href = r.waUrl;
          }
        }}
      >
        Contact on WhatsApp
      </button>
      {error && (
        <span role="alert" className="block text-xs text-amber-200">
          {error}
        </span>
      )}
    </>
  );
}

function WhatsAppSection({
  tournament,
  playerId,
  contact,
  admin,
  removed,
  reload,
}: {
  tournament: string;
  playerId: string;
  contact: ContactInfo;
  admin: boolean;
  removed: boolean;
  reload: () => Promise<void>;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState<{
    code: string;
    challenge: string | null;
    sendUrl: string;
    newNumber?: string;
  } | null>(null);
  const [route, setRoute] = useState(
    contact.route1Available ? "established_channel" : "independent_evidence",
  );
  const [evidence, setEvidence] = useState(
    contact.hasEfootballId ? "efootball_possession" : "known_person_live_video",
  );
  const send = useEditSender();
  const open = contact.openChange;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const post = async (
    form: string,
    value: Record<string, unknown>,
    done: string,
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    const r = await send(form, { tournament, ...value });
    if (r.ok) setNotice(done);
    else setError(r.error!);
    await reload();
    setBusy(false);
    return r;
  };

  return (
    <div className="space-y-3" aria-busy={busy}>
      <p className="font-semibold">WhatsApp number</p>
      <p>
        <span className="font-mono">{shown ?? contact.masked}</span>{" "}
        <ContactButton
          tournament={tournament}
          playerId={playerId}
          purpose="tournament_coordination"
        />
        {admin && !shown && (
          <button
            type="button"
            className="om-link ml-3"
            onClick={async () => {
              const r = await disclose(tournament, playerId, "admin_review");
              if ("error" in r) return setError(r.error);
              setShown(r.phone);
              timer.current = setTimeout(() => setShown(null), 30_000);
            }}
          >
            Show for 30 s
          </button>
        )}
      </p>
      <p className="text-xs text-slate-400">
        {contact.attestedAt
          ? `Organizer-attested on ${new Date(contact.attestedAt).toLocaleString("en-IN")} (${METHOD_LABEL[contact.method ?? ""] ?? contact.method}). This is a manual organizer record, not automated proof of ownership.`
          : "Legacy number: never organizer-attested. A change needs independent evidence and a second admin."}{" "}
        Every view of a full number is recorded in the activity log.
      </p>
      {error && (
        <p role="alert" className="notice text-amber-200">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice text-cyan-200">
          {notice}
        </p>
      )}
      {admin && !contact.editingOn && (
        <p className="text-sm text-slate-400">
          Changing WhatsApp numbers is switched off until it&apos;s separately
          approved.
        </p>
      )}
      {started && (
        <div className="om-card space-y-2">
          <p>
            Code for the new number:{" "}
            <strong className="font-mono">{started.code}</strong>
            {started.newNumber && <> ({started.newNumber})</>}. It&apos;s shown
            only now.
          </p>
          <a
            className="button-secondary om-small w-fit"
            href={started.sendUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open WhatsApp chat with the code
          </a>
          {started.challenge && (
            <p>
              eFootball challenge:{" "}
              <strong className="font-mono">{started.challenge}</strong>. Ask
              the player to put it in the profile of their registered eFootball
              account (or a friend-request message from it), then check it
              yourself in the game.
            </p>
          )}
          <button
            type="button"
            className="om-link"
            onClick={() => setStarted(null)}
          >
            Hide
          </button>
        </div>
      )}
      {open && (
        <div className="om-card space-y-3">
          <p>
            <strong>Open change</strong> ·{" "}
            {open.route === "established_channel"
              ? "established channel"
              : `independent evidence: ${EVIDENCE_LABEL[open.evidenceType ?? ""] ?? open.evidenceType}`}{" "}
            · started by {open.requestedByName ?? "an admin"} ·{" "}
            {open.status === "pending_code"
              ? `waiting for the code (${open.attemptsLeft} attempts, ${open.resendsLeft} resends left)`
              : `waiting for a second admin until ${new Date(open.approveBy!).toLocaleString("en-IN")} (Data health → WhatsApp number changes)`}
          </p>
          {contact.canEdit &&
            open.status === "pending_code" &&
            open.requestedByMe && (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const efootball =
                    open.evidenceType === "efootball_possession";
                  void post(
                    `code-${open.id}`,
                    {
                      action: "contact.change_code",
                      changeId: open.id,
                      code: String(f.get("code") ?? ""),
                      attest: f.get("attest") === "on",
                      ...(efootball
                        ? {
                            efootballId: String(f.get("efootballId") ?? ""),
                            challenge: String(f.get("challenge") ?? ""),
                          }
                        : {}),
                    },
                    open.route === "established_channel"
                      ? "WhatsApp number changed."
                      : "Code accepted. A second main admin must now approve.",
                  ).then((r) => r.ok && setStarted(null));
                }}
              >
                <input
                  name="code"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="6-digit code"
                  className="control-input !mt-0 font-mono w-40"
                  aria-label="Code returned by the player"
                />
                {open.evidenceType === "efootball_possession" && (
                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      name="efootballId"
                      required
                      placeholder="eFootball ID you checked"
                      className="control-input !mt-0 font-mono uppercase"
                      aria-label="eFootball ID you checked"
                    />
                    <input
                      name="challenge"
                      required
                      maxLength={6}
                      placeholder="Challenge you saw on it"
                      className="control-input !mt-0 font-mono uppercase"
                      aria-label="Challenge you saw on the eFootball account"
                    />
                  </div>
                )}
                <label className="flex gap-2 text-sm">
                  <input type="checkbox" name="attest" required />
                  {open.route === "established_channel"
                    ? "I attest the code came back from the player's current, organizer-attested WhatsApp number."
                    : "I attest the player sent this code back from the new number."}
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className="button-primary om-small">
                    Check code
                  </button>
                  <button
                    type="button"
                    className="button-secondary om-small"
                    onClick={async () => {
                      const r = await post(
                        `resend-${open.id}`,
                        { action: "contact.change_resend", changeId: open.id },
                        "New code ready. The old code no longer works.",
                      );
                      if (r.ok && r.data)
                        setStarted({
                          code: String(r.data.code),
                          challenge: null,
                          sendUrl: String(r.data.sendUrl),
                        });
                    }}
                  >
                    Send a new code
                  </button>
                </div>
              </form>
            )}
          {contact.canEdit && (
            <CancelChange
              onCancel={(reason) =>
                post(
                  `cancel-${open.id}`,
                  {
                    action: "contact.change_cancel",
                    changeId: open.id,
                    reason,
                  },
                  "Number change cancelled.",
                )
              }
            />
          )}
        </div>
      )}
      {contact.canEdit && !open && !removed && (
        <details className="om-card">
          <summary className="cursor-pointer">Change WhatsApp number</summary>
          <form
            className="space-y-3 mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const independent = route === "independent_evidence";
              const seen = String(f.get("observedAt") ?? "");
              void post(
                "start",
                {
                  action: "contact.change_start",
                  playerId,
                  expectedContactVersion: contact.version,
                  newPhone: String(f.get("newPhone") ?? ""),
                  route,
                  ...(independent
                    ? {
                        evidenceType: evidence,
                        evidenceNote: String(f.get("evidenceNote") ?? ""),
                        ...(evidence !== "efootball_possession" && seen
                          ? { evidenceObservedAt: new Date(seen).toISOString() }
                          : {}),
                      }
                    : {}),
                  reason: String(f.get("reason") ?? ""),
                  confirm: f.get("confirm") === "on",
                },
                "Change started. Send the code to the new number.",
              ).then((r) => {
                if (r.ok && r.data)
                  setStarted({
                    code: String(r.data.code),
                    challenge: (r.data.challenge as string | null) ?? null,
                    sendUrl: String(r.data.sendUrl),
                    newNumber: String(r.data.newNumber),
                  });
              });
            }}
          >
            <fieldset className="space-y-1">
              <legend className="text-sm font-semibold">
                How is the player identified?
              </legend>
              <label className="flex gap-2 text-sm">
                <input
                  type="radio"
                  name="route"
                  checked={route === "established_channel"}
                  disabled={!contact.route1Available}
                  onChange={() => setRoute("established_channel")}
                />
                Established channel (one admin): the code comes back from the
                current, organizer-attested number
                {!contact.route1Available && " (not available: legacy number)"}
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="radio"
                  name="route"
                  checked={route === "independent_evidence"}
                  onChange={() => setRoute("independent_evidence")}
                />
                Independent evidence (needs a second main admin)
              </label>
            </fieldset>
            <input
              name="newPhone"
              required
              maxLength={32}
              placeholder="New WhatsApp number (+44 7911 123456, or 10 digits for India)"
              className="control-input !mt-0"
              aria-label="New WhatsApp number"
            />
            {route === "independent_evidence" && (
              <div className="space-y-2">
                <select
                  className="control-input !mt-0"
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  aria-label="Evidence type"
                >
                  {Object.entries(EVIDENCE_LABEL).map(([key, text]) => (
                    <option
                      key={key}
                      value={key}
                      disabled={
                        key === "efootball_possession" &&
                        !contact.hasEfootballId
                      }
                    >
                      {text}
                      {key === "efootball_possession" && !contact.hasEfootballId
                        ? " (no eFootball ID on record)"
                        : ""}
                    </option>
                  ))}
                </select>
                {evidence !== "efootball_possession" && (
                  <input
                    type="datetime-local"
                    name="observedAt"
                    required
                    className="control-input !mt-0"
                    aria-label="When you saw the player"
                  />
                )}
                <textarea
                  name="evidenceNote"
                  required
                  minLength={20}
                  maxLength={500}
                  placeholder="What you checked, when and who did it. No phone numbers."
                  className="control-input !mt-0"
                  aria-label="Evidence note"
                />
              </div>
            )}
            <input
              name="reason"
              required
              minLength={5}
              maxLength={300}
              placeholder="Reason (required, no phone numbers)"
              className="control-input !mt-0"
              aria-label="Reason"
            />
            <label className="flex gap-2 text-sm">
              <input type="checkbox" name="confirm" required />
              {route === "established_channel"
                ? "I'll send a code to the new number and ask the player to return it from their current attested number."
                : "I identified the player as described, and I'll send a code to the new number for them to return from it."}
            </label>
            <button className="button-primary">Start change</button>
          </form>
        </details>
      )}
    </div>
  );
}

function CancelChange({
  onCancel,
}: {
  onCancel: (reason: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="om-link" onClick={() => setOpen(true)}>
        Cancel this change
      </button>
    );
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void onCancel(
          String(new FormData(e.currentTarget).get("reason") ?? ""),
        ).then(() => setOpen(false));
      }}
    >
      <input
        name="reason"
        required
        minLength={5}
        maxLength={300}
        placeholder="Why cancel?"
        className="control-input !mt-0"
        aria-label="Reason for cancelling"
      />
      <button className="button-secondary om-small">Cancel change</button>
    </form>
  );
}

type ContactChangeRow = {
  id: string;
  tournament: string;
  code: string;
  gaming_name: string;
  route: string;
  evidenceType: string | null;
  evidenceNote: string | null;
  evidenceObservedAt: string | null;
  challengeConfirmedAt: string | null;
  status: string;
  requestedByName: string | null;
  requestedByMe: boolean;
  reason: string | null;
  approveBy: string | null;
  expiresAt: string;
  newNumber: string;
};

/** Data health → WhatsApp number changes: the second admin's review (main admins). */
function ContactApprovals() {
  const [data, setData] = useState<{
    editingOn: boolean;
    changes: ContactChangeRow[];
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const send = useEditSender();
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin?contactChanges=1", {
        cache: "no-store",
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setData(v);
    } catch (e) {
      setError((e as Error).message || "Could not load number changes.");
    }
  }, []);
  useEffect(() => {
    const go = async () => {
      await load();
    };
    void go();
  }, [load]);
  const post = async (
    form: string,
    value: Record<string, unknown>,
    done: string,
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    const r = await send(form, value);
    if (r.ok) setNotice(done);
    else setError(r.error!);
    await load();
    setBusy(false);
  };
  return (
    <section
      className="panel p-4 md:p-7 space-y-5 mt-6"
      aria-labelledby="wa-title"
    >
      <div>
        <h2 id="wa-title" className="text-2xl font-bold">
          WhatsApp number changes
        </h2>
        <p className="text-slate-400 mt-1 text-sm">
          Open changes. Independent-evidence changes need a second, different
          main admin. Approving records your own organizer attestation that you
          reviewed the evidence; it isn&apos;t automated proof.
          {data &&
            !data.editingOn &&
            " Number editing is currently switched off."}
        </p>
      </div>
      {error && (
        <p role="alert" className="notice text-amber-200">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice text-cyan-200">
          {notice}
        </p>
      )}
      {data && !data.changes.length && (
        <p className="text-slate-300">No open number changes.</p>
      )}
      <fieldset disabled={busy || !data?.editingOn} className="space-y-3">
        {data?.changes.map((c) => (
          <article key={c.id} className="om-card space-y-2">
            <p>
              <strong>{c.gaming_name}</strong>{" "}
              <span className="text-slate-400">
                · {c.code} · new number {c.newNumber} · started by{" "}
                {c.requestedByName ?? "an admin"}
              </span>
            </p>
            <p className="text-sm">
              {c.route === "established_channel"
                ? "Established channel"
                : `Evidence: ${EVIDENCE_LABEL[c.evidenceType ?? ""] ?? c.evidenceType}${c.evidenceObservedAt ? `, observed ${new Date(c.evidenceObservedAt).toLocaleString("en-IN")}` : ""}${c.challengeConfirmedAt ? " (challenge confirmed)" : ""}`}
            </p>
            {c.evidenceNote && (
              <p className="text-sm text-slate-300">Note: {c.evidenceNote}</p>
            )}
            {c.reason && (
              <p className="text-sm text-slate-400">Reason: {c.reason}</p>
            )}
            <p className="text-sm text-slate-400">
              {c.status === "pending_code"
                ? "Waiting for the code from the new number."
                : `Waiting for a second admin until ${new Date(c.approveBy!).toLocaleString("en-IN")}.`}
            </p>
            {c.status === "awaiting_second_admin" && !c.requestedByMe && (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void post(
                    `approve-${c.id}`,
                    {
                      action: "contact.change_approve",
                      tournament: c.tournament,
                      changeId: c.id,
                      reviewed: f.get("reviewed") === "on",
                      reason: String(f.get("reason") ?? ""),
                    },
                    `Number changed for ${c.gaming_name}.`,
                  );
                }}
              >
                <label className="flex gap-2 text-sm">
                  <input type="checkbox" name="reviewed" required />I reviewed
                  this evidence myself and I&apos;m satisfied it identifies the
                  player.
                </label>
                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    name="reason"
                    required
                    minLength={5}
                    maxLength={300}
                    placeholder="Your reason (no phone numbers)"
                    className="control-input !mt-0"
                    aria-label="Reason for approving"
                  />
                  <button className="button-primary">Approve</button>
                </div>
              </form>
            )}
            {c.status === "awaiting_second_admin" && c.requestedByMe && (
              <p className="text-sm text-amber-200">
                You started this change, so another main admin must approve it.
              </p>
            )}
            <CancelChange
              onCancel={(reason) =>
                post(
                  `cancel-${c.id}`,
                  {
                    action: "contact.change_cancel",
                    tournament: c.tournament,
                    changeId: c.id,
                    reason,
                  },
                  "Number change cancelled.",
                )
              }
            />
          </article>
        ))}
      </fieldset>
    </section>
  );
}
