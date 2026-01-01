"use client"; 

import { useState, useMemo, useEffect } from "react";

type Props = {
  teams: any[];
  matches: any[];
};

type TeamStats = {
  id: string;
  name: string;
  group: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
};

export default function LeaderboardClient({ teams, matches }: Props) {
  const [activeGroup, setActiveGroup] = useState<"A" | "B">("A");

  const tables = useMemo(() => {
    const statsMap: Record<string, TeamStats> = {};
    
    // Initialize Teams
    teams.forEach((t) => {
      statsMap[t._id] = {
        id: t._id, name: t.name, group: t.group || "A",
        played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0,
      };
    });

    // Process Matches
    matches.forEach((m) => {
      const home = statsMap[m.homeTeam._id];
      const away = statsMap[m.awayTeam._id];

      if (home && away) {
        home.played++; away.played++;
        home.gf += m.homeScore; home.ga += m.awayScore;
        away.gf += m.awayScore; away.ga += m.homeScore;

        if (m.homeScore > m.awayScore) {
          home.won++; home.pts += 3; away.lost++;
        } else if (m.homeScore < m.awayScore) {
          away.won++; away.pts += 3; home.lost++;
        } else {
          home.drawn++; home.pts += 1; away.drawn++; away.pts += 1;
        }
      }
    });

    // Format & Sort
    const allStats = Object.values(statsMap).map((t) => ({ ...t, gd: t.gf - t.ga }));
    const sortFn = (a: TeamStats, b: TeamStats) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;

    return {
      A: allStats.filter((t) => t.group === "A").sort(sortFn),
      B: allStats.filter((t) => t.group === "B").sort(sortFn),
    };
  }, [teams, matches]);

  // Check if Group B has any teams
  const showGroupB = tables.B.length > 0;

  // Safety: If user is on Group B but it disappears, switch back to A
  useEffect(() => {
    if (!showGroupB && activeGroup === "B") {
      setActiveGroup("A");
    }
  }, [showGroupB, activeGroup]);

  return (
    <div>
      {/* Header & Tabs */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Standings</h1>
        
        {/* Only show Tabs if Group B actually exists */}
        {showGroupB && (
          <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
            <button
              onClick={() => setActiveGroup("A")}
              className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
                activeGroup === "A" ? "bg-cyan-500/20 text-cyan-400" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Group A
            </button>
            <button
              onClick={() => setActiveGroup("B")}
              className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
                activeGroup === "B" ? "bg-cyan-500/20 text-cyan-400" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Group B
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-950/80 text-xs uppercase text-slate-400 font-medium">
            <tr>
              <th className="px-4 py-3 text-left w-10">#</th>
              <th className="px-4 py-3 text-left">Player</th>
              <th className="px-2 py-3 text-center">P</th>
              <th className="px-2 py-3 text-center text-green-400">W</th>
              <th className="px-2 py-3 text-center text-slate-500">D</th>
              <th className="px-2 py-3 text-center text-red-400">L</th>
              <th className="px-2 py-3 text-center">GD</th>
              <th className="px-4 py-3 text-center text-white font-bold">PTS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {tables[activeGroup].map((team, index) => (
              <tr key={team.id} className="hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 text-slate-500 font-mono">{index + 1}</td>
                <td className="px-4 py-3 font-bold text-white">{team.name}</td>
                <td className="px-2 py-3 text-center text-slate-400">{team.played}</td>
                <td className="px-2 py-3 text-center text-green-400/80">{team.won}</td>
                <td className="px-2 py-3 text-center text-slate-500">{team.drawn}</td>
                <td className="px-2 py-3 text-center text-red-400/80">{team.lost}</td>
                <td className={`px-2 py-3 text-center font-mono ${team.gd > 0 ? "text-cyan-400" : team.gd < 0 ? "text-red-400" : "text-slate-500"}`}>
                  {team.gd > 0 ? `+${team.gd}` : team.gd}
                </td>
                <td className="px-4 py-3 text-center font-bold text-white bg-white/5">{team.pts}</td>
              </tr>
            ))}
            {tables[activeGroup].length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-600 italic">No teams in Group {activeGroup}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}