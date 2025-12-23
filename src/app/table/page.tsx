import { getLeagueData } from "@/lib/sanity/client";
import LeaderboardClient from "@/components/LeaderboardClient";
import AutoRefresh from "@/components/AutoRefresh";

export const revalidate = 10; 

export default async function TablePage() {
  const { teams, matches } = await getLeagueData();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <AutoRefresh />
      <LeaderboardClient teams={teams} matches={matches} />
    </div>
  );
}