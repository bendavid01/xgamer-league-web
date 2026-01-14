import { getMatchSchedule } from "@/lib/sanity/client";
import { CheckCircle2, PlayCircle, Clock } from "lucide-react";
import AutoRefresh from "@/components/AutoRefresh"; // ✅ Added AutoRefresh

// ⚡ Update Speed: Check for new scores every 5 seconds
export const revalidate = 5;

export default async function MatchesPage() {
  const matches = await getMatchSchedule();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      <AutoRefresh /> {/* 🔄 Auto-refreshes the UI */}

      <h1 className="text-2xl font-bold text-white mb-6">Match Center</h1>

      {matches.map((match: any) => {
        const isCompleted = match.status === "completed";
        const isLive = match.status === "live";

        return (
          <div key={match._id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex items-center justify-between hover:border-slate-700 transition-all">

            {/* STATUS ICON (Date Removed) */}
            <div className="w-8 flex justify-center">
              {isLive ? (
                <PlayCircle className="w-5 h-5 text-red-500 animate-pulse" />
              ) : isCompleted ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <Clock className="w-5 h-5 text-slate-600" />
              )}
            </div>

            {/* TEAMS & SCORE */}
            <div className="flex-1 flex items-center justify-center gap-3">
              {/* Home Team */}
              <span className={`flex-1 text-right font-bold text-sm md:text-base ${isCompleted && match.homeScore > match.awayScore ? "text-cyan-400" : "text-slate-300"}`}>
                {match.home}
              </span>

              {/* Score Box */}
              <div className="bg-black/40 px-3 py-1 rounded-lg font-mono text-lg font-bold text-white tracking-widest min-w-[70px] text-center border border-white/5">
                {isCompleted || isLive ? (
                  `${match.homeScore} - ${match.awayScore}`
                ) : (
                  <span className="text-slate-600 text-sm">vs</span>
                )}
              </div>

              {/* Away Team */}
              <span className={`flex-1 text-left font-bold text-sm md:text-base ${isCompleted && match.awayScore > match.homeScore ? "text-cyan-400" : "text-slate-300"}`}>
                {match.away}
              </span>
            </div>

          </div>
        );
      })}

      {matches.length === 0 && (
        <div className="text-center py-10 text-slate-500">No matches scheduled.</div>
      )}
    </div>
  );
}