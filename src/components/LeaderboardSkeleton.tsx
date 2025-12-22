import { motion } from "framer-motion";

export default function LeaderboardSkeleton() {
  return (
    <div className="bg-glass-surface backdrop-blur-md border border-glass-border rounded-xl overflow-hidden shadow-2xl">
      
      {/* Header Skeleton */}
      <div className="grid grid-cols-12 gap-0 p-4 border-b border-glass-border bg-slate-900/80 items-center">
        {/* We mimic the header layout but simpler */}
        <div className="col-span-1 flex justify-center"><div className="h-3 w-4 bg-slate-800 rounded"></div></div>
        <div className="col-span-3 pl-1"><div className="h-3 w-16 bg-slate-800 rounded"></div></div>
        {/* 8 Stat Columns */}
        {[...Array(8)].map((_, i) => (
          <div key={i} className="col-span-1 flex justify-center">
             <div className="h-3 w-6 bg-slate-800 rounded"></div>
          </div>
        ))}
      </div>

      {/* Rows Skeleton */}
      <div className="divide-y divide-slate-800/50">
        {[...Array(5)].map((_, i) => (
          <div 
            key={i} 
            className="grid grid-cols-12 gap-0 p-4 items-center animate-pulse"
          >
            {/* 1. Rank */}
            <div className="col-span-1 flex justify-center">
              <div className="h-4 w-4 bg-slate-800 rounded"></div>
            </div>

            {/* 2. Team & Player */}
            <div className="col-span-3 flex flex-col justify-center pl-1 gap-2">
              <div className="h-4 w-32 bg-slate-700 rounded"></div> {/* Team Name */}
              <div className="h-2 w-20 bg-slate-800/50 rounded"></div> {/* Player Name */}
            </div>

            {/* 3. Stats (8 columns of pulses) */}
            {[...Array(8)].map((_, j) => (
              <div key={j} className="col-span-1 flex justify-center">
                {/* Randomize width slightly for realism */}
                <div className={`h-4 bg-slate-800 rounded ${j === 7 ? 'w-8 bg-slate-700' : 'w-4'}`}></div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}