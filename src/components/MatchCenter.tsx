"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import type { LeagueMatch } from "@/lib/league";
import { MatchCard } from "./LeagueUI";
export default function MatchCenter({ matches }: { matches: LeagueMatch[] }) {
  const reduced = useReducedMotion();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const filtered = matches.filter(
    (m) =>
      (filter === "all" || m.status === filter) &&
      `${m.home?.name} ${m.away?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-5" aria-label="Filter matches">
        {["all", "scheduled", "live", "completed"].map((s) => (
          <button
            className={filter === s ? "button-primary" : "button-secondary"}
            key={s}
            aria-pressed={s === filter}
            onClick={() => setFilter(s)}
          >
            {s === "all"
              ? "All matches"
              : s === "completed"
                ? "Results"
                : s === "scheduled"
                  ? "Fixtures"
                  : "Live"}
          </button>
        ))}
      </div>
      <label className="block max-w-md mb-7 text-sm text-slate-400">
        Find a participant
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-2"
          placeholder="Search matches…"
        />
      </label>
      <p role="status" className="text-sm text-slate-500 mb-4">
        {filtered.length} matches
      </p>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence initial={false} mode="popLayout">
          {filtered.map((m) => (
            <motion.div
              layout={!reduced}
              key={m._id}
              initial={false}
              className="match-motion"
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: reduced ? 1 : 0.98 }}
              transition={{ duration: reduced ? 0 : 0.22 }}
            >
              <MatchCard match={m} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {!filtered.length && (
        <p className="notice">No matches match these filters.</p>
      )}
    </>
  );
}
