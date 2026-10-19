"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import {
  roundRobin,
  knockout,
  advanceKnockout,
  leagueKnockout,
  standings,
  type Fixture,
  type Entrant,
  type Result,
} from "@/lib/tournament";
type Score = { home: string; away: string; winner: string };
export default function TournamentPlanner() {
  const reduced = useReducedMotion();
  const [names, setNames] = useState("Player 1\nPlayer 2\nPlayer 3\nPlayer 4");
  const [format, setFormat] = useState("round-robin");
  const [qualifiers, setQualifiers] = useState(2);
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [scores, setScores] = useState<Record<string, Score>>({});
  const [phase, setPhase] = useState<"league" | "knockout">("league");
  const [error, setError] = useState("");
  const [champion, setChampion] = useState("");
  const [generatedFormat, setGeneratedFormat] = useState("");
  const [generatedQualifiers, setGeneratedQualifiers] = useState(2);
  function generate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const list = names
        .split("\n")
        .map((n) => n.trim())
        .filter(Boolean);
      if (list.length > 16)
        throw new Error(
          "This interactive preview supports up to 16 participants.",
        );
      if (new Set(list.map((n) => n.toLowerCase())).size !== list.length)
        throw new Error("Use a different name for each participant.");
      const next = list.map((name, i) => ({ id: String(i), name }));
      if (
        format === "league-knockout" &&
        (qualifiers > next.length || qualifiers < 2)
      )
        throw new Error(
          "Select a qualifier count within the participant count.",
        );
      const generated =
        format === "knockout" ? knockout(next) : roundRobin(next);
      setEntrants(next);
      setFixtures(generated);
      setScores({});
      setChampion("");
      setPhase(format === "knockout" ? "knockout" : "league");
      setGeneratedFormat(format);
      setGeneratedQualifiers(qualifiers);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function resultList(): Result[] {
    return fixtures.map((f) => {
      const score = scores[f.id];
      if (!score || score.home === "" || score.away === "")
        throw new Error("Enter both scores for every match.");
      const homeScore = Number(score.home),
        awayScore = Number(score.away);
      if (
        ![homeScore, awayScore].every(
          (n) => Number.isInteger(n) && n >= 0 && n <= 99,
        )
      )
        throw new Error("Scores must be whole numbers between 0 and 99.");
      return { home: f.home!, away: f.away!, homeScore, awayScore };
    });
  }
  function update(id: string, key: keyof Score, value: string) {
    setScores((previous) => ({
      ...previous,
      [id]: {
        ...(previous[id] ?? { home: "", away: "", winner: "" }),
        [key]: value,
      },
    }));
  }
  function advance() {
    setError("");
    try {
      if (phase === "league") {
        const results = resultList();
        const next = leagueKnockout(entrants, results, generatedQualifiers);
        setFixtures(next);
        setPhase("knockout");
        setScores({});
        return;
      }
      const winners: Record<string, string> = {};
      for (const f of fixtures) {
        if (!f.home || !f.away) continue;
        const s = scores[f.id];
        if (!s || s.home === "" || s.away === "")
          throw new Error("Enter both scores for each played match.");
        const a = Number(s.home),
          b = Number(s.away);
        if (![a, b].every((n) => Number.isInteger(n) && n >= 0 && n <= 99))
          throw new Error("Enter valid whole-number scores.");
        if (a === b && ![f.home, f.away].includes(s.winner))
          throw new Error(
            "Select the confirmed penalty winner for a drawn knockout match.",
          );
        winners[f.id] = a > b ? f.home : b > a ? f.away : s.winner;
      }
      const next = advanceKnockout(fixtures, winners);
      if (!next.length) {
        const f = fixtures[0];
        setChampion(label(winners[f.id] || f.home || f.away));
      } else {
        setFixtures(next);
        setScores({});
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function label(id: string | null) {
    return entrants.find((e) => e.id === id)?.name || "BYE";
  }
  function exportPlan() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            preview: true,
            format: generatedFormat,
            phase,
            entrants,
            fixtures,
            scores,
            champion,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "xgamer-tournament-preview.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  let table: ReturnType<typeof standings> = [];
  if (phase === "league" && fixtures.length) {
    try {
      table = standings(entrants, resultList());
    } catch {
      /* Incomplete draft scores are not standings. */
    }
  }
  return (
    <>
      <p className="notice mb-7">
        Interactive preview only. Names and scores stay in this tab until you
        leave or reload. This tool cannot approve entries, publish fixtures or
        change the existing league.
      </p>
      <form
        onSubmit={generate}
        className="panel p-6 grid md:grid-cols-2 gap-6 mb-8"
      >
        <label className="text-sm text-slate-400">
          Participants · one per line (2–16)
          <textarea
            rows={6}
            maxLength={1600}
            className="mt-2"
            value={names}
            onChange={(e) => setNames(e.target.value)}
            required
          />
        </label>
        <div className="space-y-5">
          <label className="block text-sm text-slate-400">
            Format
            <select
              className="mt-2"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="round-robin">Round robin</option>
              <option value="knockout">Seeded knockout</option>
              <option value="league-knockout">League phase + knockout</option>
            </select>
          </label>
          {format === "league-knockout" && (
            <label className="block text-sm text-slate-400">
              Knockout qualifiers
              <select
                className="mt-2"
                value={qualifiers}
                onChange={(e) => setQualifiers(Number(e.target.value))}
              >
                {[2, 4, 8, 16].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-xs text-slate-500">
            List order sets knockout seeding. Generating a new plan clears the
            current preview.
          </p>
          <button className="button-primary" type="submit">
            Generate preview
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="notice text-amber-300 mb-5">
          {error}
        </p>
      )}
      {fixtures.length > 0 && (
        <section>
          <div className="flex flex-wrap justify-between items-center mb-5 gap-4">
            <h2 className="text-2xl font-bold">
              {phase === "league"
                ? "League phase"
                : `Knockout · Round ${fixtures[0].round}`}
            </h2>
            <button className="button-secondary" onClick={exportPlan}>
              Export preview
            </button>
          </div>
          {champion ? (
            <p
              role="status"
              className="panel p-8 text-2xl text-cyan-300 font-bold"
            >
              Preview champion: {champion}
            </p>
          ) : (
            <>
              <div className="grid lg:grid-cols-2 gap-4">
                {fixtures.map((f) => (
                  <motion.article
                    layout={!reduced}
                    initial={{ opacity: 0, y: reduced ? 0 : 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduced ? 0 : 0.28 }}
                    className="panel bracket-card p-5"
                    key={f.id}
                  >
                    <p className="text-xs text-slate-500 mb-3">
                      ROUND {f.round}
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="flex-1 break-words">
                        {label(f.home)}
                      </span>
                      <span className="text-slate-500 text-xs">VS</span>
                      <span className="flex-1 text-right break-words">
                        {label(f.away)}
                      </span>
                    </div>
                    {!f.home || !f.away ? (
                      <p className="mt-4 text-cyan-300 text-sm">
                        Automatic bye
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-4 mt-4">
                          <label className="text-xs text-slate-500">
                            Score · {label(f.home)}
                            <input
                              type="number"
                              min={0}
                              max={99}
                              step={1}
                              value={scores[f.id]?.home ?? ""}
                              onChange={(e) =>
                                update(f.id, "home", e.target.value)
                              }
                            />
                          </label>
                          <label className="text-xs text-slate-500">
                            Score · {label(f.away)}
                            <input
                              type="number"
                              min={0}
                              max={99}
                              step={1}
                              value={scores[f.id]?.away ?? ""}
                              onChange={(e) =>
                                update(f.id, "away", e.target.value)
                              }
                            />
                          </label>
                        </div>
                        {phase === "knockout" &&
                          scores[f.id] &&
                          scores[f.id]?.home !== "" &&
                          scores[f.id]?.home === scores[f.id]?.away && (
                            <label className="block text-xs text-slate-400 mt-3">
                              Confirmed winner after penalties
                              <select
                                value={scores[f.id]?.winner || ""}
                                onChange={(e) =>
                                  update(f.id, "winner", e.target.value)
                                }
                              >
                                <option value="">Choose winner</option>
                                <option value={f.home}>{label(f.home)}</option>
                                <option value={f.away}>{label(f.away)}</option>
                              </select>
                            </label>
                          )}
                      </>
                    )}
                  </motion.article>
                ))}
              </div>
              {(phase === "knockout" ||
                generatedFormat === "league-knockout") && (
                <button className="button-primary mt-6" onClick={advance}>
                  {phase === "league"
                    ? "Confirm qualification"
                    : fixtures.length === 1
                      ? "Confirm preview champion"
                      : "Advance confirmed winners"}
                </button>
              )}
            </>
          )}
          {table.length > 0 && (
            <div className="panel p-6 mt-7">
              <h3 className="font-bold mb-4">Preview standings</h3>
              <ol className="space-y-3">
                {table.map((r) => (
                  <motion.li
                    layout={!reduced}
                    className="flex justify-between text-sm"
                    key={r.id}
                  >
                    <span>{r.name}</span>
                    <span className="text-cyan-300">
                      {r.pts} pts · GD {r.gd}
                    </span>
                  </motion.li>
                ))}
              </ol>
              <p className="text-xs text-slate-500 mt-5">
                Qualification uses points, goal difference and goals scored. A
                tie at the qualification cutoff requires an organizer playoff
                decision.
              </p>
            </div>
          )}
        </section>
      )}
    </>
  );
}
