"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { LeagueMatch } from "@/lib/league";

export default function MatchInsight({ match }: { match: LeagueMatch }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const reduced = useReducedMotion();
  const scored = ["completed", "live"].includes(match.status);
  const complete =
    scored && match.homeScore !== null && match.awayScore !== null;
  const total = (match.homeScore ?? 0) + (match.awayScore ?? 0);
  const share = total ? ((match.homeScore ?? 0) / total) * 100 : 50;
  return (
    <>
      <button
        className="match-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span>{open ? "Close match insight" : "Match insight"}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.22 }}
            className="overflow-hidden"
          >
            <div className="pt-4 text-sm text-slate-400">
              <p className="text-xs uppercase tracking-widest mb-3">
                {complete ? "Goal distribution" : "Fixture briefing"}
              </p>
              {complete ? (
                <>
                  <div className="flex justify-between font-mono text-cyan-300 mb-2">
                    <span>{match.homeScore} goals</span>
                    <span>{match.awayScore} goals</span>
                  </div>
                  <div className="goal-track" aria-hidden="true">
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: reduced ? 0 : 0.4 }}
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <p className="mt-3">
                    {total === 0
                      ? "No goals recorded."
                      : `${total} goals recorded${match.status === "live" ? " so far" : " at full time"}.`}{" "}
                    {match.status === "live"
                      ? "Live scores may change."
                      : "Final result."}
                  </p>
                </>
              ) : (
                <p>Scores will appear when published by the organizers.</p>
              )}
              <div className="flex flex-wrap gap-3 mt-4">
                {[match.home, match.away].map((team, i) =>
                  team ? (
                    <Link
                      key={`${team._id}-${i}`}
                      className="insight-link"
                      href={`/players/${encodeURIComponent(team._id)}`}
                    >
                      {team.name} ↗
                    </Link>
                  ) : null,
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
