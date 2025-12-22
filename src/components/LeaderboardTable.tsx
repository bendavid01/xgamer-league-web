"use client";

import { motion } from "framer-motion";
import { Trophy, User } from "lucide-react";

export default function LeaderboardTable({ data }: { data: any[] }) {
  return (
    <div className="bg-glass-surface backdrop-blur-md border border-glass-border rounded-xl overflow-hidden shadow-2xl">
      
      {/* HEADER ROW */}
      <div className="grid grid-cols-12 gap-0 p-4 border-b border-glass-border bg-slate-900/80 text-[10px] md:text-xs font-bold text-neon-cyan uppercase tracking-wider items-center">
        <div className="col-span-1 text-center">#</div>
        <div className="col-span-3 text-left pl-1">Team</div>
        <div className="col-span-1 text-center">PL</div>
        <div className="col-span-1 text-center text-green-400">W</div>
        <div className="col-span-1 text-center text-slate-400">D</div>
        <div className="col-span-1 text-center text-red-400">L</div>
        <div className="col-span-1 text-center text-slate-500">GF</div>
        <div className="col-span-1 text-center text-slate-500">GA</div>
        <div className="col-span-1 text-center">GD</div>
        <div className="col-span-1 text-center text-white">PTS</div>
      </div>

      {/* DATA ROWS */}
      <div className="divide-y divide-slate-800/50">
        {data.map((team, index) => {
          // 1. Get Values (Default to 0)
          const gf = team.gf || 0;
          const ga = team.ga || 0;
          
          // 2. THE CALCULATION
          const gd = gf - ga;

          // 3. COLOR LOGIC
          let gdColor = "text-slate-600"; // Neutral (0)
          if (gd > 0) gdColor = "text-neon-cyan font-bold"; // Positive
          if (gd < 0) gdColor = "text-red-400"; // Negative

          // 4. DISPLAY FORMAT (Add '+' sign if positive)
          const gdDisplay = gd > 0 ? `+${gd}` : gd;

          return (
            <motion.div
              key={team.id || index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="grid grid-cols-12 gap-0 p-4 items-center hover:bg-white/5 transition-colors group"
            >
              {/* Rank */}
              <div className="col-span-1 font-mono text-slate-500 font-bold text-center">
                {index + 1}
              </div>

              {/* Team Name */}
              <div className="col-span-3 flex flex-col justify-center text-left pl-1">
                <div className="flex items-center gap-2">
                  {index === 0 && <Trophy className="w-3 h-3 text-yellow-400 shrink-0" />}
                  <span className={`font-bold text-xs md:text-sm truncate ${index === 0 ? "text-white" : "text-slate-200"}`}>
                    {team.name}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <User className="w-3 h-3 text-neon-purple shrink-0" />
                  <span className="text-[10px] text-neon-purple/80 font-mono tracking-wide truncate">
                    {team.player || "No Player"}
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div className="col-span-1 text-slate-300 font-mono text-xs md:text-sm text-center">{team.played || 0}</div>
              <div className="col-span-1 text-green-400 font-mono text-xs md:text-sm text-center font-bold">{team.won || 0}</div>
              <div className="col-span-1 text-slate-400 font-mono text-xs md:text-sm text-center">{team.drawn || 0}</div>
              <div className="col-span-1 text-red-400 font-mono text-xs md:text-sm text-center">{team.lost || 0}</div>
              <div className="col-span-1 text-slate-500 font-mono text-xs md:text-sm text-center">{gf}</div>
              <div className="col-span-1 text-slate-500 font-mono text-xs md:text-sm text-center">{ga}</div>

              {/* ⚠️ AUTOMATED GD COLUMN */}
              <div className={`col-span-1 font-mono text-xs md:text-sm text-center ${gdColor}`}>
                {gdDisplay}
              </div>

              {/* Points */}
              <div className="col-span-1 font-extrabold text-white text-sm md:text-base drop-shadow-[0_0_10px_rgba(34,211,238,0.3)] text-center">
                {team.pts || 0}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}