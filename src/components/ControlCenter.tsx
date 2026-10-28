"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
type Application = {
  id: string;
  player_id: string;
  gaming_name: string;
  contact: string;
  discordHandle?: string | null;
  efootballId: string;
  status: string;
  revision: number;
  verified_at: string | null;
};
type Match = {
  id: string;
  home: string;
  away: string;
  round: number;
  home_score: number | null;
  away_score: number | null;
  revision: number;
  stage: string;
};
type Snapshot = {
  user: { role: string; operations: string[] };
  tournament: {
    name: string;
    status: string;
    revision: number;
    opponents: number;
  };
  applications: Application[];
  fixtures: Match[];
  standings: {
    id: string;
    name: string;
    pts: number;
    gd: number;
    played: number;
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
export default function ControlCenter() {
  const [data, setData] = useState<Snapshot | null>(null),
    [tab, setTab] = useState("registrations"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      const r = await fetch("/api/admin", { cache: "no-store" });
      const value = await r.json();
      if (!r.ok) throw new Error(value.error);
      setData(value);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    let active = true;
    fetch("/api/admin", { cache: "no-store" })
      .then(async (r) => {
        const value = await r.json();
        if (!r.ok) throw new Error(value.error);
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function act(value: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-shell py-12">
      <p className="eyebrow">XGAMER / OPERATIONS</p>
      <div className="flex flex-wrap justify-between gap-5">
        <div>
          <h1 className="page-title">
            Control Center<span className="text-cyan-300">.</span>
          </h1>
          <p className="text-slate-400 mt-4">
            {data?.tournament.name ?? "Organizer workspace"}
          </p>
        </div>
        <Link className="button-secondary self-start" href="/login">
          Discord sign-in ↗
        </Link>
      </div>
      {error && (
        <p role="alert" className="notice mt-6 text-amber-200">
          {error}
        </p>
      )}
      {!data ? (
        <p className="notice mt-8">
          Sign in with an authorized organizer identity. Access requires the
          private database and two main administrator identities to be
          configured.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 my-9">
            {[
              [
                data.applications.filter((a) =>
                  ["pending", "approved"].includes(a.status),
                ).length + " / 64",
                "RESERVED",
              ],
              [
                data.applications.filter((a) => a.status === "approved").length,
                "APPROVED",
              ],
              [
                data.applications.filter((a) => a.status === "waitlisted")
                  .length,
                "WAITLIST",
              ],
              [data.tournament.status.toUpperCase(), "PHASE"],
            ].map(([n, label]) => (
              <div className="panel p-5" key={label}>
                <div className="text-3xl font-bold text-white">{n}</div>
                <p className="text-xs text-slate-400 tracking-widest mt-3">
                  {label}
                </p>
              </div>
            ))}
          </div>
          <div
            role="tablist"
            aria-label="Operations"
            className="flex gap-3 overflow-x-auto pb-4"
          >
            {[
              ...(data.user.role === "admin" ||
              data.user.operations.includes("registrations")
                ? ["registrations"]
                : []),
              ...(data.user.role === "admin" ||
              data.user.operations.includes("results")
                ? ["fixtures"]
                : []),
              "standings",
              ...(data.user.role === "admin"
                ? ["tournament", "access", "finals", "audit"]
                : []),
              ...(data.user.role === "admin" ||
              data.user.operations.includes("announcements")
                ? ["announcements"]
                : []),
            ].map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={t === tab}
                className={t === tab ? "button-primary" : "button-secondary"}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <fieldset
            disabled={busy}
            className="panel p-4 md:p-7 mt-4 disabled:opacity-60"
          >
            {tab === "registrations" &&
              (data.user.role === "admin" ||
                data.user.operations.includes("registrations")) && (
                <div className="overflow-x-auto">
                  <table className="control-table">
                    <caption className="text-left text-slate-400 pb-5">
                      Private applications. Confirm contact ownership before
                      approving a player.
                    </caption>
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Contact</th>
                        <th>Entry</th>
                        <th>Review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.applications.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <strong>{a.gaming_name}</strong>
                            <p className="text-xs text-slate-400">
                              {a.efootballId}
                            </p>
                          </td>
                          <td>
                            {a.contact}
                            {a.discordHandle && (
                              <p className="text-xs text-slate-400">
                                Discord: {a.discordHandle}
                              </p>
                            )}
                          </td>
                          <td>{a.status}</td>
                          <td>
                            <div className="flex flex-wrap gap-2">
                              {data.user.role === "admin" && (
                                <button
                                  className="button-secondary"
                                  onClick={() => {
                                    const id = prompt(
                                      "Enter this player's numeric Discord ID only after verifying ownership:",
                                    );
                                    if (
                                      id &&
                                      confirm(
                                        "Confirm you independently verified that this Discord account belongs to this player.",
                                      )
                                    )
                                      void act({
                                        action: "review",
                                        id: a.id,
                                        revision: a.revision,
                                        status:
                                          a.status === "approved"
                                            ? "approved"
                                            : "pending",
                                        verified: true,
                                        discordId: id.trim(),
                                      });
                                  }}
                                >
                                  Link verified Discord
                                </button>
                              )}
                              <button
                                className="button-secondary"
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Have you verified ${a.gaming_name}'s contact and eFootball identity?`,
                                    )
                                  )
                                    void act({
                                      action: "review",
                                      id: a.id,
                                      revision: a.revision,
                                      status: "approved",
                                      verified: true,
                                    });
                                }}
                              >
                                Verify & approve
                              </button>
                              <button
                                className="button-secondary"
                                onClick={() =>
                                  void act({
                                    action: "review",
                                    id: a.id,
                                    revision: a.revision,
                                    status: "rejected",
                                    verified: false,
                                  })
                                }
                              >
                                Reject
                              </button>
                              {data.user.role === "admin" && (
                                <button
                                  className="button-secondary"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        "Soft-delete this application? Its audit history will remain.",
                                      )
                                    )
                                      void act({
                                        action: "delete",
                                        id: a.id,
                                        revision: a.revision,
                                      });
                                  }}
                                >
                                  Soft-delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            {tab === "fixtures" && (
              <div className="space-y-4">
                {data.fixtures.map((f) => (
                  <form
                    key={f.id}
                    className="grid md:grid-cols-[1fr_100px_100px_auto] gap-3 items-end border-b border-slate-700 pb-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fields = new FormData(e.currentTarget);
                      void act({
                        action: "score",
                        id: f.id,
                        revision: f.revision,
                        homeScore: Number(fields.get("home")),
                        awayScore: Number(fields.get("away")),
                        ...(fields.get("winner")
                          ? { winner: fields.get("winner") }
                          : {}),
                      });
                    }}
                  >
                    <p>
                      R{f.round} ·{" "}
                      {
                        data.applications.find((a) => a.player_id === f.home)
                          ?.gaming_name
                      }{" "}
                      vs{" "}
                      {
                        data.applications.find((a) => a.player_id === f.away)
                          ?.gaming_name
                      }
                      <span className="block text-xs text-slate-400">
                        {f.stage}
                      </span>
                    </p>
                    <label>
                      Home
                      <input
                        name="home"
                        required
                        type="number"
                        min={0}
                        max={99}
                        defaultValue={f.home_score ?? ""}
                        className="control-input"
                      />
                    </label>
                    <label>
                      Away
                      <input
                        name="away"
                        required
                        type="number"
                        min={0}
                        max={99}
                        defaultValue={f.away_score ?? ""}
                        className="control-input"
                      />
                    </label>
                    <div>
                      {f.stage === "knockout" && (
                        <label>
                          Draw tiebreak winner
                          <select name="winner" className="control-input">
                            <option value="">Choose if drawn</option>
                            <option value={f.home}>Home player</option>
                            <option value={f.away}>Away player</option>
                          </select>
                        </label>
                      )}
                      <button className="button-secondary">Save score</button>
                    </div>
                  </form>
                ))}
                {!data.fixtures.length && (
                  <p>
                    Fixtures appear after the main admins lock the approved
                    field.
                  </p>
                )}
              </div>
            )}
            {tab === "standings" && (
              <table className="control-table">
                <caption>Unified league standings</caption>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>P</th>
                    <th>GD</th>
                    <th>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {data.standings.map((p, i) => (
                    <tr key={p.id}>
                      <td className={i < 8 ? "text-cyan-200" : ""}>{i + 1}</td>
                      <td>{p.name}</td>
                      <td>{p.played}</td>
                      <td>{p.gd}</td>
                      <td>{p.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === "tournament" && (
              <div className="space-y-6">
                <h2 className="text-2xl">Tournament controls</h2>
                <p className="text-slate-400">
                  Lock applications after verifying 64 entrants. Generating
                  fixtures freezes the field. Qualification requires every
                  league result and a resolved cutoff.
                </p>
                <div className="flex flex-wrap gap-3">
                  {["open", "locked"].map((status) => (
                    <button
                      className="button-secondary"
                      key={status}
                      onClick={() =>
                        void act({
                          action: "configure",
                          status,
                          opponents: 4,
                          revision: data.tournament.revision,
                        })
                      }
                    >
                      {status === "open"
                        ? "Open applications"
                        : "Lock applications"}
                    </button>
                  ))}
                  <button
                    className="button-primary"
                    onClick={() => {
                      if (
                        confirm(
                          "Freeze 64 approved players and generate 128 fixtures?",
                        )
                      )
                        void act({ action: "generate" });
                    }}
                  >
                    Generate league
                  </button>
                  <button
                    className="button-secondary"
                    onClick={() => void act({ action: "qualify" })}
                  >
                    Qualify top eight
                  </button>
                  <button
                    className="button-secondary"
                    onClick={() => void act({ action: "advance" })}
                  >
                    Advance knockout round
                  </button>
                </div>
                <form
                  className="space-y-4 border-t border-slate-700 pt-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act({
                      action: "configure",
                      status: data.tournament.status,
                      revision: data.tournament.revision,
                      opponents: Number(f.get("opponents")),
                    });
                  }}
                >
                  <label className="block">
                    Unique league opponents per player
                    <input
                      className="control-input"
                      type="number"
                      min={1}
                      max={63}
                      name="opponents"
                      defaultValue={data.tournament.opponents}
                      required
                    />
                  </label>
                  <button className="button-secondary">
                    Save league format
                  </button>
                </form>
                <form
                  className="space-y-4 border-t border-slate-700 pt-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act({
                      action: "qualify",
                      playoffWinners: f.getAll("winners"),
                      evidence: f.get("evidence"),
                    });
                  }}
                >
                  <h3 className="text-xl">
                    Resolve a tied qualification cutoff
                  </h3>
                  <p className="text-slate-400 text-sm">
                    Use only after external playoff matches. Select the players
                    who earned the remaining top-eight places. The server
                    accepts only players tied at the cutoff and records your
                    evidence.
                  </p>
                  <div className="max-h-48 overflow-auto grid sm:grid-cols-2 gap-3">
                    {data.standings.map((p) => (
                      <label className="flex gap-3" key={p.id}>
                        <input name="winners" value={p.id} type="checkbox" />
                        {p.name}
                      </label>
                    ))}
                  </div>
                  <label className="block">
                    Playoff evidence / organizer decision
                    <textarea
                      className="control-input"
                      name="evidence"
                      minLength={10}
                      maxLength={2000}
                      required
                    />
                  </label>
                  <button className="button-secondary">
                    Confirm playoff qualification
                  </button>
                </form>
              </div>
            )}
            {tab === "access" && data.user.role === "admin" && (
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act({
                    action: "coordinator",
                    discordId: f.get("discordId"),
                    operations: f.getAll("operations"),
                    active: f.get("active") === "on",
                  });
                }}
              >
                <h2 className="text-2xl">Coordinator permissions</h2>
                <p className="text-slate-400">
                  Assign only the operations this person needs for the October
                  Cup. Delete and role management are always prohibited.
                </p>
                <label className="block">
                  Numeric Discord user ID
                  <input
                    className="control-input"
                    name="discordId"
                    pattern="[0-9]{17,20}"
                    required
                  />
                </label>
                {["registrations", "results", "announcements"].map((op) => (
                  <label className="flex gap-3" key={op}>
                    <input type="checkbox" name="operations" value={op} />
                    {op}
                  </label>
                ))}
                <label className="flex gap-3">
                  <input type="checkbox" name="active" defaultChecked />
                  Access enabled (uncheck to revoke)
                </label>
                <button className="button-primary">
                  Save coordinator access
                </button>
              </form>
            )}
            {tab === "finals" && data.user.role === "admin" && (
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act({
                    action: "finals",
                    credentials: f.get("credentials"),
                    released: f.get("released") === "on",
                  });
                }}
              >
                <h2 className="text-2xl">External finals access</h2>
                <p className="text-slate-400">
                  Link each finalist&apos;s verified Discord account during
                  registration review first. Room details are encrypted and only
                  the qualified eight can retrieve them after release.
                </p>
                <label className="block">
                  Private eFootball room details
                  <textarea
                    name="credentials"
                    required
                    maxLength={2000}
                    rows={5}
                    className="control-input"
                    autoComplete="off"
                  />
                </label>
                <label className="flex gap-3">
                  <input type="checkbox" name="released" />
                  Release to qualified players
                </label>
                <button className="button-primary">Save finals access</button>
              </form>
            )}
            {tab === "audit" && (
              <table className="control-table">
                <caption>Latest 100 immutable events</caption>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {data.audit.map((a) => (
                    <tr key={a.id}>
                      <td>{new Date(a.created_at).toLocaleString()}</td>
                      <td>{a.actor}</td>
                      <td>{a.action}</td>
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
                  ))}
                </tbody>
              </table>
            )}
            {tab === "announcements" && (
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act({
                    action: "announce",
                    title: f.get("title"),
                    message: f.get("message"),
                  });
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
                  Announcement
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
          </fieldset>
          <button
            className="button-secondary mt-5"
            onClick={() => void refresh()}
          >
            Refresh workspace
          </button>
        </>
      )}
    </div>
  );
}
