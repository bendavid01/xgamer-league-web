"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, RefreshCw } from "lucide-react";

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
  status: Status;
  format: "league" | "knockout";
  knockout: boolean;
  qualifiers: number;
  legs: number;
};
type Home = {
  user: User;
  tournaments: TournamentRow[];
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
  announcements: { id: string; title: string; message: string }[];
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
    ? "Knockout only"
    : `League${t.legs === 2 ? " (home & away)" : ""}${t.knockout ? ` + Top ${t.qualifiers ?? ""} knockout` : ""}`;
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
      if (value.action === "create" && result.id) {
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
            <form
              className="om-card mb-6"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const ok = await act(
                  {
                    action: "create",
                    name: f.get("name"),
                    format: f.get("format"),
                  },
                  "Tournament created. Fill in the details in Set up.",
                );
                if (ok) setAdding(false);
              }}
            >
              <h3 className="text-lg font-bold">New tournament</h3>
              <label className="block mt-4">
                Tournament name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={80}
                  className="control-input"
                  placeholder="XGamer November Cup"
                  autoFocus
                />
              </label>
              <div className="mt-4">
                <p className="mb-2">Format</p>
                <div className="flex flex-wrap gap-3">
                  <Choice
                    name="format"
                    value="league"
                    label="League"
                    defaultChecked
                  />
                  <Choice
                    name="format"
                    value="knockout"
                    label="Knockout only (played in eFootball app)"
                  />
                </div>
              </div>
              <div className="om-footer">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setAdding(false)}
                >
                  Cancel
                </button>
                <button className="button-primary">Apply</button>
              </div>
            </form>
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
                      <strong>{t.name}</strong>
                      <span className="block text-sm text-slate-400">
                        {formatLabel(t)}
                      </span>
                    </span>
                    <span className={`status-pill status-${t.status}`}>
                      {PHASE[t.status]}
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
        </section>
      )}
      {tab === "coordinators" && admin && (
        <Coordinators data={data} act={act} />
      )}
      {tab === "log" && admin && <ActivityLog rows={data.audit} />}
    </>
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
}: {
  data: Workspace;
  act: Act;
  back: () => void;
}) {
  const t = data.tournament;
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
    ...(can("announcements")
      ? [["announcements", "Announcements"] as [string, string]]
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
        <h2 className="text-3xl font-bold">{t.name}</h2>
        <span className={`status-pill status-${t.status}`}>
          {PHASE[t.status]}
        </span>
      </div>
      <p className="text-slate-400 mt-1">{formatLabel(t)}</p>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "players" && <PlayersTab data={data} act={act} />}
      {tab === "setup" && admin && <SetupTab data={data} act={act} />}
      {tab === "fixtures" && (
        <FixturesTab data={data} act={act} names={names} />
      )}
      {tab === "standings" && <StandingsTab data={data} />}
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
  const [format, setFormat] = useState(t.format);
  const [knockout, setKnockout] = useState(t.knockout);
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
              format,
              knockout: format === "league" && knockout,
              qualifiers: Number(f.get("qualifiers") ?? t.qualifiers),
              legs: Number(f.get("legs") ?? t.legs),
              perPlayer: format === "league" ? num("perPlayer") : null,
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
        <label className="block">
          Tournament name
          <input
            name="name"
            defaultValue={t.name}
            required
            minLength={2}
            maxLength={80}
            className="control-input"
          />
        </label>
        <fieldset
          disabled={!fieldOpen}
          className="space-y-5 disabled:opacity-60"
        >
          {!fieldOpen && (
            <p className="text-sm text-amber-200">
              Format settings are locked because fixtures exist.
            </p>
          )}
          <div>
            <p className="mb-2">Format</p>
            <div className="flex flex-wrap gap-3">
              <Choice
                name="formatChoice"
                value="league"
                label="League"
                checked={format === "league"}
                onChange={() => setFormat("league")}
              />
              <Choice
                name="formatChoice"
                value="knockout"
                label="Knockout only (eFootball app)"
                checked={format === "knockout"}
                onChange={() => setFormat("knockout")}
              />
            </div>
          </div>
          {format === "league" && (
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
              <label className="om-check">
                <input
                  type="checkbox"
                  checked={knockout}
                  onChange={(e) => setKnockout(e.target.checked)}
                />{" "}
                Knockout after the league (played in the eFootball app)
              </label>
              {knockout && (
                <label className="block">
                  Players who qualify
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
        <h3 className="text-xl font-bold pt-2">
          Shown on the registration page
        </h3>
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
        <p className="text-slate-400 mt-1">{PHASE[t.status]}</p>
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
              "Announcement published.",
            )
          )
            form.reset();
        }}
      >
        <h3 className="text-xl font-bold">New announcement</h3>
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
