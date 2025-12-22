import { client } from "@/lib/sanity/client";
import { TEAMS_QUERY } from "@/lib/sanity/queries";
import LeaderboardTable from "@/components/LeaderboardTable";

// Define Data Shape
interface TeamData {
  _id: string;
  name: string;
  player?: string;
  logoUrl: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

// This is an ASYNC component that does the heavy lifting
export default async function LeaderboardSection() {
  // Artificial delay to test the Skeleton (Optional - remove in production)
  // await new Promise((resolve) => setTimeout(resolve, 2000));

  const rawTeams: TeamData[] = await client.fetch(TEAMS_QUERY, {}, { cache: 'no-store' });

  const formattedTeams = rawTeams.map((team) => ({
    ...team,
    id: team._id,
    player: team.player || "TBD",
  }));

  return <LeaderboardTable data={formattedTeams} />;
}