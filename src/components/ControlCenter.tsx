"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Application = {
  id: string;
  player_id: string;
  gaming_name: string;
  team_name: string | null;
  status: string;
  revision: number;
  verified_at: string | null;
  phone?: string;
  efootballId?: string | null;
};
type Match = {
  id: string;
  home: string;
  away: string | null;
  round: number;
  slot: number;
  home_score: number | null;
  away_score: number | null;
  winner: string | null;
  revision: number;
  stage: "league" | "knockout";
};
type Snapshot = {
  user: { role: string; operations: string[] };
  tournament: {
    name: string;
    status: string;
    revision: number;
    format: "league" | "knockout" | "league_knockout";
    qualifiers: number;
    opponents: number | null;
  };
  applications: Application[];
  fixtures: Match[];
  standings: {
    id: string;
    name: string;
    pts: number;
    gd: number;
    gf: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
  }[];
  audit: {
    id: number;
    actor: string;
    action: string;
    created_at: string;
    before_value: unknown;
    after_value: unknown;
  }[];
};

const FORMAT_LABEL = {
  league: "League",
  knockout: "Knockout",
  league_knockout: "League + Knockout",
} as const;
const PHASE_LABEL: Record<string, string> = {
  draft: "Setting up",
  open: "Registration open",
  locked: "Registration closed",
  league: "League in progress",
  knockout: "Knockout in progress",
  completed: "Completed",
};
const FILTERS = [
  ["pending", "Pending"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["all", "All"],
] as const;

function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

export default function ControlCenter() {
  const [data, setData] = useState<Snapshot | null>(null),
    [tab, setTab] = useState("players"),
    [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("pending"),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/admin", { cache: "no-store" });
    const value = await r.json();
    if (!r.ok) throw new Error(value.error);
    return value as Snapshot;
  }
  useEffect(() => {
    let active = true;
    load()
      .then((v) => active && setData(v))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  async function act(value: unknown, done?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setData(await load());
      setSelected(new Set());
      if (done) setNotice(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const can = (op: string) =>
    data?.user.role === "admin" || !!data?.user.operations.includes(op);
  const names = useMemo(
    () =>
      new Map(
        data?.applications.map((a) => [a.player_id, a.gaming_name]) ?? [],
      ),
    [data],
  );
  const visible =
    data?.applications.filter((a) => filter === "all" || a.status === filter) ??
    [];
  const fieldOpen =
    !!data && ["draft", "open", "locked"].includes(data.tournament.status);

  const tabs = data
    ? [
        ...(can("registrations") ? [["players", "Players"]] : []),
        ...(data.user.role === "admin" ? [["tournament", "Tournament"]] : []),
        ...(can("results") ? [["fixtures", "Fixtures & scores"]] : []),
        ["standings", "Standings"],
        ...(can("announcements") ? [["announcements", "Announcements"]] : []),
        ...(data.user.role === "admin"
          ? [
              ["access", "Coordinators"],
              ["audit", "Activity log"],
            ]
          : []),
      ]
    : [];

  return (
    <div className="page-shell py-12 om">
      <p className="eyebrow">XGAMER / OPERATIONS</p>
      <div className="flex flex-wrap justify-between gap-5">
        <div>
          <h1 className="page-title">
            Organizer Manager<span className="text-cyan-300">.</span>
          </h1>
          {data && (
            <p className="text-slate-400 mt-3">
              {data.tournament.name} —{" "}
              {PHASE_LABEL[data.tournament.status] ?? data.tournament.status} ·{" "}
              {FORMAT_LABEL[data.tournament.format]}
            </p>
          )}
        </div>
        {!data && (
          <Link className="button-secondary self-start" href="/login">
            Sign in with Discord ↗
          </Link>
        )}
      </div>
      {error && (
        <p role="alert" className="notice mt-6 text-amber-200">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice mt-6 text-cyan-200">
          {notice}
        </p>
      )}
      {!data ? (
        !error && <p className="notice mt-8">Loading…</p>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Sections"
            className="flex gap-2 overflow-x-auto py-6"
          >
            {tabs.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={key === tab}
                className={key === tab ? "button-primary" : "button-secondary"}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <fieldset
            disabled={busy}
            className="panel p-4 md:p-7 disabled:opacity-60"
          >
            {tab === "players" && can("registrations") && (
              <div className="space-y-5">
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Show"
                >
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
                    Fixtures exist, so approvals are locked. Reset fixtures in
                    Tournament to change players.
                  </p>
                )}
                {fieldOpen && selected.size > 0 && (
                  <div className="om-bulk">
                    <button
                      className="button-primary"
                      onClick={() => {
                        if (
                          confirm(
                            "Approve the selected players? Confirm you have verified them on WhatsApp.",
                          )
                        )
                          void act(
                            {
                              action: "review",
                              status: "approved",
                              verified: true,
                              items: data.applications
                                .filter((a) => selected.has(a.id))
                                .map(({ id, revision }) => ({ id, revision })),
                            },
                            "Selected players approved. They now appear on the website.",
                          );
                      }}
                    >
                      Approve selected
                    </button>
                    <button
                      className="button-secondary"
                      onClick={() =>
                        void act(
                          {
                            action: "review",
                            status: "rejected",
                            verified: false,
                            items: data.applications
                              .filter((a) => selected.has(a.id))
                              .map(({ id, revision }) => ({ id, revision })),
                          },
                          "Selected players rejected.",
                        )
                      }
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
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Select ${a.gaming_name}`}
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
                              {a.team_name ?? "—"}
                            </span>
                          </td>
                          <td>
                            {a.phone && (
                              <a
                                className="text-cyan-300 underline-offset-4 hover:underline"
                                href={waLink(a.phone)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {a.phone}
                              </a>
                            )}
                          </td>
                          <td>
                            <span className={`om-status om-${a.status}`}>
                              {a.status}
                            </span>
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
                                  placeholder="Add ID"
                                  required
                                  minLength={6}
                                  maxLength={32}
                                  pattern="[A-Za-z0-9-]{6,32}"
                                  className="control-input !mt-0 font-mono uppercase min-w-[9rem]"
                                  aria-label={`eFootball ID for ${a.gaming_name}`}
                                />
                                <button className="button-secondary">
                                  Save
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!visible.length && (
                    <p className="text-slate-400 py-6">Nobody here yet.</p>
                  )}
                </div>
              </div>
            )}

            {tab === "tournament" && data.user.role === "admin" && (
              <TournamentSetup data={data} fieldOpen={fieldOpen} act={act} />
            )}

            {tab === "fixtures" && can("results") && (
              <Fixtures data={data} names={names} act={act} />
            )}

            {tab === "standings" && (
              <div className="overflow-x-auto">
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
                          data.tournament.format === "league_knockout" &&
                          i === data.tournament.qualifiers - 1
                            ? "om-cutoff"
                            : ""
                        }
                      >
                        <td>{i + 1}</td>
                        <td>{p.name}</td>
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
              </div>
            )}

            {tab === "announcements" && can("announcements") && (
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act(
                    {
                      action: "announce",
                      title: f.get("title"),
                      message: f.get("message"),
                    },
                    "Announcement published.",
                  );
                  e.currentTarget.reset();
                }}
              >
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
                <button className="button-primary">Publish announcement</button>
              </form>
            )}

            {tab === "access" && data.user.role === "admin" && (
              <form
                className="space-y-5"
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
                <h2 className="text-2xl">Coordinators</h2>
                <p className="text-slate-400">
                  Give helpers only what they need. Coordinators can never
                  delete records or change roles.
                </p>
                <label className="block">
                  Discord user ID (numbers)
                  <input
                    className="control-input"
                    name="discordId"
                    pattern="[0-9]{17,20}"
                    required
                  />
                </label>
                {[
                  ["registrations", "Review players"],
                  ["results", "Enter scores"],
                  ["announcements", "Post announcements"],
                ].map(([op, label]) => (
                  <label className="flex gap-3" key={op}>
                    <input type="checkbox" name="operations" value={op} />{" "}
                    {label}
                  </label>
                ))}
                <label className="flex gap-3">
                  <input type="checkbox" name="active" defaultChecked /> Access
                  enabled (untick to remove)
                </label>
                <button className="button-primary">Save coordinator</button>
              </form>
            )}

            {tab === "audit" && data.user.role === "admin" && (
              <div className="overflow-x-auto">
                <table className="control-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Who</th>
                      <th>Action</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.audit.map((a) => (
                      <tr key={a.id}>
                        <td>
                          {new Date(a.created_at).toLocaleString("en-IN")}
                        </td>
                        <td>{a.actor}</td>
                        <td>{a.action}</td>
                        <td>
                          <details>
                            <summary>Before / after</summary>
                            <pre className="text-xs whitespace-pre-wrap break-all max-w-md">
                              {JSON.stringify(
                                {
                                  before: a.before_value,
                                  after: a.after_value,
                                },
                                null,
                                2,
                              )}
                            </pre>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </fieldset>
          <button
            className="button-secondary mt-5"
            onClick={() =>
              load()
                .then(setData)
                .catch((e) => setError(e.message))
            }
          >
            Refresh
          </button>
        </>
      )}
    </div>
  );
}

function TournamentSetup({
  data,
  fieldOpen,
  act,
}: {
  data: Snapshot;
  fieldOpen: boolean;
  act: (value: unknown, done?: string) => Promise<void>;
}) {
  const t = data.tournament;
  const [format, setFormat] = useState(t.format);
  const missingIds = data.applications
    .filter((a) => a.status === "approved" && !a.efootballId)
    .map((a) => a.gaming_name);
  const save = (form: HTMLFormElement, status: string, done: string) => {
    const f = new FormData(form);
    const opponents = Number(f.get("opponents"));
    void act(
      {
        action: "configure",
        revision: t.revision,
        name: f.get("name"),
        status,
        format: f.get("format"),
        qualifiers: Number(f.get("qualifiers") ?? t.qualifiers),
        opponents: opponents > 0 ? opponents : null,
      },
      done,
    );
  };
  return (
    <div className="space-y-8">
      <form
        id="setup"
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save(e.currentTarget, t.status, "Tournament saved.");
        }}
      >
        <h2 className="text-2xl">1. Set up</h2>
        <fieldset
          disabled={!fieldOpen}
          className="space-y-5 disabled:opacity-60"
        >
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
          <div>
            <p className="mb-2">Format</p>
            <div className="flex flex-wrap gap-3">
              {(Object.keys(FORMAT_LABEL) as (keyof typeof FORMAT_LABEL)[]).map(
                (key) => (
                  <label
                    key={key}
                    className={`om-choice ${format === key ? "om-choice-on" : ""}`}
                  >
                    <input
                      type="radio"
                      name="format"
                      value={key}
                      checked={format === key}
                      onChange={() => setFormat(key)}
                    />
                    {FORMAT_LABEL[key]}
                  </label>
                ),
              )}
            </div>
          </div>
          {format === "league_knockout" && (
            <label className="block">
              Qualify for knockout
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
          {format !== "knockout" && (
            <label className="block">
              League matches per player{" "}
              <span className="text-slate-500">
                (optional — leave empty for everyone plays everyone)
              </span>
              <input
                name="opponents"
                type="number"
                min={1}
                max={63}
                defaultValue={t.opponents ?? ""}
                className="control-input"
              />
            </label>
          )}
          <button className="button-secondary">Save</button>
        </fieldset>
      </form>

      <section className="space-y-4 border-t border-slate-700 pt-6">
        <h2 className="text-2xl">2. Registration</h2>
        <p className="text-slate-400">{PHASE_LABEL[t.status]}</p>
        <div className="flex flex-wrap gap-3">
          <button
            className="button-secondary"
            disabled={!fieldOpen || t.status === "open"}
            onClick={() =>
              save(
                document.getElementById("setup") as HTMLFormElement,
                "open",
                "Registration is open on the website.",
              )
            }
          >
            Open registration
          </button>
          <button
            className="button-secondary"
            disabled={!fieldOpen || t.status === "locked"}
            onClick={() =>
              save(
                document.getElementById("setup") as HTMLFormElement,
                "locked",
                "Registration closed.",
              )
            }
          >
            Close registration
          </button>
        </div>
      </section>

      <section className="space-y-4 border-t border-slate-700 pt-6">
        <h2 className="text-2xl">3. Fixtures</h2>
        {missingIds.length > 0 && (
          <p className="notice text-amber-200">
            Add eFootball IDs first for: {missingIds.join(", ")}.
          </p>
        )}
        {fieldOpen ? (
          <form
            className="flex flex-wrap items-center gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const shuffle =
                new FormData(e.currentTarget).get("shuffle") === "on";
              if (
                confirm(
                  `Generate ${FORMAT_LABEL[t.format]} fixtures for all approved players? Approvals lock until you reset.`,
                )
              )
                void act(
                  { action: "generate", shuffle },
                  "Fixtures generated. They're live on the website.",
                );
            }}
          >
            <label className="flex gap-2 items-center">
              <input type="checkbox" name="shuffle" defaultChecked /> Random
              draw
            </label>
            <button className="button-primary" disabled={t.status !== "locked"}>
              Generate fixtures
            </button>
            {t.status !== "locked" && (
              <span className="text-sm text-slate-400">
                Close registration first.
              </span>
            )}
          </form>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button
              className="button-secondary"
              onClick={() =>
                confirm(
                  "Remove all fixtures? Only possible before any score is entered.",
                ) && void act({ action: "reset" }, "Fixtures removed.")
              }
            >
              Reset fixtures
            </button>
            {t.format === "league_knockout" && t.status === "league" && (
              <button
                className="button-primary"
                onClick={() =>
                  void act(
                    { action: "qualify" },
                    `Top ${t.qualifiers} moved to the knockout.`,
                  )
                }
              >
                Send Top {t.qualifiers} to knockout
              </button>
            )}
            {t.status === "knockout" && (
              <button
                className="button-primary"
                onClick={() =>
                  void act({ action: "advance" }, "Next round created.")
                }
              >
                Advance to next round
              </button>
            )}
            {t.format === "league" && t.status === "league" && (
              <button
                className="button-primary"
                onClick={() =>
                  void act({ action: "complete" }, "League finished.")
                }
              >
                Finish league
              </button>
            )}
          </div>
        )}
      </section>

      {t.format === "league_knockout" && t.status === "league" && (
        <form
          className="space-y-4 border-t border-slate-700 pt-6"
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
          <h3 className="text-xl">Tie at the cutoff?</h3>
          <p className="text-slate-400 text-sm">
            Only if players are level on points, goal difference and goals. Tick
            who won the playoff.
          </p>
          <div className="max-h-48 overflow-auto grid sm:grid-cols-2 gap-2">
            {data.standings.map((p) => (
              <label className="flex gap-3" key={p.id}>
                <input name="winners" value={p.id} type="checkbox" /> {p.name}
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
          <button className="button-secondary">Confirm playoff winners</button>
        </form>
      )}
    </div>
  );
}

function Fixtures({
  data,
  names,
  act,
}: {
  data: Snapshot;
  names: Map<string, string>;
  act: (value: unknown, done?: string) => Promise<void>;
}) {
  if (!data.fixtures.length)
    return (
      <p className="text-slate-400">
        Fixtures appear here after you generate them in Tournament.
      </p>
    );
  const groups = new Map<string, Match[]>();
  for (const f of data.fixtures) {
    const key = `${f.stage === "league" ? "League" : "Knockout"} · Round ${f.round}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  return (
    <div className="space-y-8">
      {[...groups].map(([title, list]) => (
        <section key={title}>
          <h3 className="text-lg font-semibold mb-3">{title}</h3>
          <div className="space-y-3">
            {list.map((f) =>
              !f.away ? (
                <p key={f.id} className="text-slate-400">
                  {names.get(f.home)} — bye, advances automatically
                </p>
              ) : (
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
                        ...(v.get("winner") ? { winner: v.get("winner") } : {}),
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
                  />
                  <span className="om-score-name text-right">
                    {names.get(f.away)}
                  </span>
                  {f.stage === "knockout" && (
                    <select
                      name="winner"
                      defaultValue={f.winner ?? ""}
                      className="control-input !mt-0"
                      aria-label="Winner if drawn"
                    >
                      <option value="">If drawn: winner</option>
                      <option value={f.home}>{names.get(f.home)}</option>
                      <option value={f.away}>{names.get(f.away)}</option>
                    </select>
                  )}
                  <button className="button-secondary">
                    {f.home_score === null ? "Save" : "Update"}
                  </button>
                </form>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
