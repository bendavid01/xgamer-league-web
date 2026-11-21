"use client";
import { useState } from "react";
import { fieldOpenFor } from "../labels";
import type { Act, Match, Workspace } from "../types";
import s from "../om.module.css";

/** Fixtures & Scores: league fixtures by round, or the knockout status controls. */
export default function FixturesTab({
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
  const fieldOpen = fieldOpenFor(t.status);
  const missingIds = data.applications
    .filter((a) => a.status === "approved" && !a.efootballId)
    .map((a) => a.gaming_name);
  const [reviewing, setReviewing] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
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
              Close registration first (Setup & Announcements).
            </p>
          )}
        </div>
      </section>
    );

  const rounds = new Map<number, Match[]>();
  for (const f of data.fixtures)
    rounds.set(f.round, [...(rounds.get(f.round) ?? []), f]);
  const scored = data.fixtures.filter((f) => f.home_score !== null).length;

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
                . Change this in Setup & Announcements.
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
        <>
          <div className={s.toolbar}>
            <span className={s.panelHint}>
              <span className={s.num}>{scored}</span> of{" "}
              <span className={s.num}>{data.fixtures.length}</span> scored
            </span>
            <label className="om-check">
              <input
                type="checkbox"
                checked={onlyOpen}
                onChange={(e) => setOnlyOpen(e.target.checked)}
              />{" "}
              Unplayed only
            </label>
          </div>
          {[...rounds].map(([round, all]) => {
            const list = onlyOpen
              ? all.filter((f) => f.home_score === null)
              : all;
            if (!list.length) return null;
            const left = all.filter((f) => f.home_score === null).length;
            return (
              <section key={round} className="panel p-4 md:p-6">
                <div className={s.roundHead}>
                  <h3 className="text-lg font-semibold">Round {round}</h3>
                  <span className={s.badge} data-tone={left ? undefined : "ok"}>
                    {left ? `${left} to play` : "Complete"}
                  </span>
                </div>
                <div className="space-y-3">
                  {list.map((f) => (
                    <ScoreRow key={f.id} f={f} t={t} act={act} names={names} />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

function ScoreRow({
  f,
  t,
  act,
  names,
}: {
  f: Match;
  t: Workspace["tournament"];
  act: Act;
  names: Map<string, string>;
}) {
  const away = names.get(f.away ?? "");
  return (
    <form
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
        aria-label={`${away} goals`}
        disabled={t.status !== "league"}
        inputMode="numeric"
      />
      <span className="om-score-name text-right">{away}</span>
      {t.status === "league" && (
        <button className="button-secondary om-small">
          {f.home_score === null ? "Apply" : "Correct"}
        </button>
      )}
    </form>
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
