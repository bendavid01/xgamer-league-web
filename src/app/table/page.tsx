import { Suspense } from "react";
import LeaderboardSection from "@/components/LeaderboardSection";
import LeaderboardSkeleton from "@/components/LeaderboardSkeleton";
import AutoRefresh from "@/components/AutoRefresh";

// ⚡ ISR: Rebuilds this page every 10 seconds
export const revalidate = 10;

export default function TablePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      
      {/* Auto-Refresher runs HERE now */}
      <AutoRefresh />

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <span className="w-2 h-8 bg-cyan-500 rounded-full"></span>
          Points Table
        </h1>
        <div className="px-3 py-1 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-mono animate-pulse">
          ● LIVE
        </div>
      </div>

      <Suspense fallback={<LeaderboardSkeleton />}>
        <LeaderboardSection />
      </Suspense>
      
    </div>
  );
}