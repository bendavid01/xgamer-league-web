import Link from "next/link";
import { Trophy, Swords } from "lucide-react";

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-12 flex flex-col justify-center min-h-[85vh]">
      
      {/* Header */}
      <div className="mb-12 text-center space-y-4">
        <span className="inline-block py-1 px-3 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono tracking-widest uppercase">
          ● Season 1 is Live
        </span>
        <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter">
          WELCOME TO THE <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
            ARENA
          </span>
        </h1>
      </div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-4xl mx-auto w-full">
        
        {/* Match Center Card */}
        <Link 
          href="/matches"
          className="group relative h-64 md:h-80 rounded-3xl overflow-hidden border border-white/10 shadow-2xl transition-all hover:scale-[1.02] hover:shadow-purple-500/20"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 to-slate-900 opacity-90 group-hover:opacity-100 transition-opacity" />
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
            <div className="p-4 bg-white/5 rounded-full mb-4 group-hover:bg-indigo-500/20 transition-colors">
              <Swords className="w-12 h-12 text-indigo-400" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">MATCH CENTER</h2>
            <p className="text-indigo-200/60 font-medium">View Schedules & Results</p>
          </div>
        </Link>

        {/* Leaderboard Card */}
        <Link 
          href="/table"
          className="group relative h-64 md:h-80 rounded-3xl overflow-hidden border border-white/10 shadow-2xl transition-all hover:scale-[1.02] hover:shadow-cyan-500/20"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-900 to-slate-900 opacity-90 group-hover:opacity-100 transition-opacity" />
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
            <div className="p-4 bg-white/5 rounded-full mb-4 group-hover:bg-cyan-500/20 transition-colors">
              <Trophy className="w-12 h-12 text-cyan-400" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">LEADERBOARD</h2>
            <p className="text-cyan-200/60 font-medium">Live Standings & Stats</p>
          </div>
        </Link>

      </div>
    </div>
  );
}