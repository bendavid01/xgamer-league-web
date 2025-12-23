import { getMatchSchedule } from "@/lib/sanity/client";
import { Clock, CheckCircle2 } from "lucide-react";

export const revalidate = 30; // Update every 30s

export default async function MatchesPage() {
  const matches = await getMatchSchedule();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      <h1 className="text-2xl font-bold text-white mb-6">Match Center</h1>

      {matches.map((match: any) => {
        const isCompleted = match.status === "Completed";
        const isLive = match.status === "Live";

        return (
          <div key={match._id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex items-center justify-between hover:border-slate-700 transition-all">
            
            {/* DATE & STATUS */}
            <div className="flex flex-col items-start gap-1 w-24">
              <span className="text-[10px] text-slate-500 font-mono uppercase">
                {new Date(match.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              {isLive ? (
                <span className="text-xs font-bold text-red-500 animate-pulse flex items-center gap-1">
                  ● LIVE
                </span>
              ) : isCompleted ? (
                <span className="text-xs font-bold text-green-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> FT
                </span>
              ) : (
                <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> VS
                </span>
              )}
            </div>

            {/* TEAMS & SCORE */}
            <div className="flex-1 flex items-center justify-center gap-4">
              <span className={`flex-1 text-right font-bold text-sm md:text-base ${isCompleted && match.homeScore > match.awayScore ? "text-cyan-400" : "text-slate-300"}`}>
                {match.home}
              </span>

              <div className="bg-black/40 px-3 py-1 rounded-lg font-mono text-lg font-bold text-white tracking-widest min-w-[60px] text-center border border-white/5">
                {isCompleted || isLive ? (
                  `${match.homeScore} - ${match.awayScore}`
                ) : (
                  <span className="text-slate-600 text-sm">v</span>
                )}
              </div>

              <span className={`flex-1 text-left font-bold text-sm md:text-base ${isCompleted && match.awayScore > match.homeScore ? "text-cyan-400" : "text-slate-300"}`}>
                {match.away}
              </span>
            </div>
            
          </div>
        );
      })}
      
      {matches.length === 0 && (
        <div className="text-center py-10 text-slate-500">No matches scheduled yet.</div>
      )}
    </div>
  );
}