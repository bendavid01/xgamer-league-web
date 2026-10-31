"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  status: string;
  revision: number;
  phone?: string;
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
const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;

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
  const [tab, setTab] = useState<"tournaments" | "coordinators" | "log">(
    "tournaments",
  );
  const [adding, setAdding] = useState(false);
  const tabs = [
    ["tournaments", "Tournaments"],
    ...(admin
      ? [
          ["coordinators", "Coordinators"],
          ["log", "Activity log"],
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
      {tab === "players" && <PlayersTab data={data} act={act} />}
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

function PlayersTab({ data, act }: { data: Workspace; act: Act }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("pending");
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
                    {a.team_name ?? "—"} · {a.code}
                  </span>
                </td>
                <td>
                  {a.phone && (
                    <a
                      className="text-cyan-300 underline-offset-4 hover:underline whitespace-nowrap"
                      href={waLink(a.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {a.phone}
                    </a>
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
                  onClick={() =>
                    void act({ action: "complete" }, "League finished.")
                  }
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
            ? "Filled in automatically from the table when the league finished. Change them only if needed."
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
