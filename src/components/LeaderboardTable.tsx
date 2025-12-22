"use client";

import { motion } from "framer-motion";
import { Trophy, User } from "lucide-react";

export default function LeaderboardTable({ data }: { data: any[] }) {
  return (
    <div className="bg-glass-surface backdrop-blur-md border border-glass-border rounded-xl overflow-hidden shadow-2xl">
      
      {/* HEADER ROW */}
      <div className="grid grid-cols-12 gap-0 p-4 border-b border-glass-border bg-slate-900/80 text-[10px] md:text-xs font-bold text-neon-cyan uppercase tracking-wider items-center">
        {/* 1. Rank (1 Col) */}
        <div className="col-span-1 text-center">#</div>
        
        {/* 2. Team (3 Cols) */}
        <div className="col-span-3 text-left pl-1">Team</div>
        
        {/* 3. Detailed Stats (8 Cols - 1 Each) */}
        <div className="col-span-1 text-center" title="Played">PL</div>
        <div className="col-span-1 text-center text-green-400" title="Won">W</div>
        <div className="col-span-1 text-center text-slate-400" title="Drawn">D</div>
        <div className="col-span-1 text-center text-red-400" title="Lost">L</div>
        <div className="col-span-1 text-center text-slate-500" title="Goals For">GF</div>
        <div className="col-span-1 text-center text-slate-500" title="Goals Against">GA</div>
        <div className="col-span-1 text-center" title="Goal Difference">GD</div>
        
        {/* 4. Points (1 Col) */}
        <div className="col-span-1 text-center text-white">PTS</div>
      </div>

      {/* DATA ROWS */}
      <div className="divide-y divide-slate-800/50">
        {data.map((team, index) => {
          // Safety: Treat empty/null data as 0
          const played = team.played || 0;
          const won = team.won || 0;
          const drawn = team.drawn || 0;
          const lost = team.lost || 0;
          const gf = team.gf || 0;
          const ga = team.ga || 0;
          const gd = team.gd || 0;
          const pts = team.pts || 0;
          const playerName = team.player || "No Player";

          return (
            <motion.div
              key={team.id || index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="grid grid-cols-12 gap-0 p-4 items-center hover:bg-white/5 transition-colors group"
            >
              {/* 1. Rank */}
              <div className="col-span-1 font-mono text-slate-500 font-bold text-center">
                {index + 1}
              </div>

              {/* 2. Team & Player */}
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
                    {playerName}
                  </span>
                </div>
              </div>

              {/* 3. Stats Block (PL, W, D, L, GF, GA, GD) */}
              <div className="col-span-1 text-slate-300 font-mono text-xs md:text-sm text-center">
                {played}
              </div>
              
              {/* Won */}
              <div className="col-span-1 text-green-400 font-mono text-xs md:text-sm text-center font-bold">
                {won}
              </div>
              
              {/* Drawn */}
              <div className="col-span-1 text-slate-400 font-mono text-xs md:text-sm text-center">
                {drawn}
              </div>
              
              {/* Lost */}
              <div className="col-span-1 text-red-400 font-mono text-xs md:text-sm text-center">
                {lost}
              </div>

              {/* GF */}
              <div className="col-span-1 text-slate-500 font-mono text-xs md:text-sm text-center">
                {gf}
              </div>

              {/* GA */}
              <div className="col-span-1 text-slate-500 font-mono text-xs md:text-sm text-center">
                {ga}
              </div>

              {/* GD */}
              <div className={`col-span-1 font-bold font-mono text-xs md:text-sm text-center ${gd > 0 ? "text-neon-cyan" : "text-slate-600"}`}>
                {gd > 0 ? `+${gd}` : gd}
              </div>

              {/* 4. Points */}
              <div className="col-span-1 font-extrabold text-white text-sm md:text-base drop-shadow-[0_0_10px_rgba(34,211,238,0.3)] text-center">
                {pts}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}