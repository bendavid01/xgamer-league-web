"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import Link from "next/link";
import { standings, type Entrant, type Result } from "@/lib/tournament";
export default function LeaderboardClient({
  teams,
  matches,
  linkPlayers = true,
  cutoff = null,
}: {
  teams: (Entrant & { group: string | null })[];
  matches: Result[];
  linkPlayers?: boolean;
  /** League + Knockout: rows above this rank qualify (shown with a line). */
  cutoff?: number | null;
}) {
  const reduced = useReducedMotion();
  const groups = [...new Set(teams.map((t) => t.group || "Ungrouped"))].sort();
  const [selected, setSelected] = useState("All");
  const rows = standings(teams, matches).filter(
    (t) =>
      selected === "All" ||
      (teams.find((e) => e.id === t.id)?.group || "Ungrouped") === selected,
  );
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-6" hidden={groups.length <= 1}>
        {["All", ...groups].map((g) => (
          <button
            key={g}
            aria-pressed={selected === g}
            onClick={() => setSelected(g)}
            className={selected === g ? "button-primary" : "button-secondary"}
          >
            {g === "All" ? "All groups" : `Group ${g}`}
          </button>
        ))}
      </div>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[540px] text-sm">
          <caption className="sr-only">
            League standings. Three points for a win, one for a draw.
          </caption>
          <thead className="text-slate-400 text-xs uppercase border-b border-slate-800">
            <tr>
              {["#", "Participant", "P", "W", "D", "L", "GD", "PTS"].map(
                (h) => (
                  <th key={h} scope="col" className="px-4 py-4 text-left">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="standings-body">
            {rows.map((r, i) => (
              <motion.tr
                layout={!reduced}
                initial={false}
                animate={{ opacity: 1 }}
                transition={{ duration: reduced ? 0 : 0.25 }}
                key={r.id}
                className={`border-b border-slate-800/60 hover:bg-slate-800/30 ${cutoff && i === cutoff - 1 ? "standings-cutoff" : ""}`}
              >
                <td className="px-4 py-4 text-slate-500">{i + 1}</td>
                <th scope="row" className="px-4 text-left">
                  {linkPlayers ? (
                    <Link
                      className="hover:text-cyan-300"
                      href={`/players/${encodeURIComponent(r.id)}`}
                    >
                      {r.name}
                    </Link>
                  ) : (
                    r.name
                  )}
                </th>
                {[r.played, r.won, r.drawn, r.lost, r.gd].map((n, j) => (
                  <td key={j} className="px-4 font-mono text-slate-400">
                    {n}
                  </td>
                ))}
                <td className="px-4 font-bold text-cyan-300">{r.pts}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="p-8 text-slate-400">
            No participants published for this group.
          </p>
        )}
      </div>
      <p className="text-sm text-slate-500 mt-5">
        {cutoff
          ? `Top ${cutoff} qualify for the knockout (above the line). `
          : groups.length > 1
            ? "Group-stage results only. "
            : ""}
        Ranked by points, goal difference, then goals scored.
      </p>
    </>
  );
}
