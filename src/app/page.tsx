// 👇 1. ADD THIS LINE AT THE VERY TOP (For ISR)
export const revalidate = 10; 

import { Suspense } from "react";
import { Activity } from "lucide-react";
import LeaderboardSection from "@/components/LeaderboardSection";
import LeaderboardSkeleton from "@/components/LeaderboardSkeleton";
// 👇 2. ADD THIS IMPORT
import AutoRefresh from "@/components/AutoRefresh"; 

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 py-12">
      
      {/* 👇 3. PASTE THE COMPONENT HERE (Invisible, but working) */}
      <AutoRefresh />

      {/* Hero Section */}
      <section className="text-center space-y-6">
        <div className="inline-block px-4 py-1.5 rounded-full border border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan text-sm font-medium mb-4">
          SEASON 4 IS LIVE
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white">
          RISE TO THE <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-neon-purple">
            FOOTBALL CHALLENGE
          </span>
        </h1>
        <div className="flex justify-center gap-4 pt-4">
           <button className="px-8 py-3 bg-neon-purple text-white font-bold rounded-lg shadow-[0_0_15px_rgba(168,85,247,0.5)] flex items-center gap-2">
            View Live Matches <Activity className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Leaderboard Section */}
      <section className="w-full max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
             <span className="w-1 h-8 bg-neon-cyan rounded-full"></span>
             Leaderboard
          </h2>
          <span className="text-xs text-green-400 font-mono border border-green-400/30 px-2 py-1 rounded bg-green-400/10 animate-pulse">
            ● LIVE FEED
          </span>
        </div>

        <Suspense fallback={<LeaderboardSkeleton />}>
          <LeaderboardSection />
        </Suspense>

      </section>

    </div>
  );
}