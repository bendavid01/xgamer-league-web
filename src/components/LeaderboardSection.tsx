// 1. Import the smart fetcher we created
import { getTeams } from "@/lib/sanity/client"; 
import LeaderboardTable from "@/components/LeaderboardTable";

// Define Data Shape (Matches what getTeams returns)
interface TeamData {
  _id: string;
  name: string;
  player?: string;
  logo: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  pts: number;
}

export default async function LeaderboardSection() {
  // 2. USE THE NEW FUNCTION
  // We use || [] to ensure that if Sanity fails, it returns an empty array instead of crashing
  const rawTeams = (await getTeams()) || [];

  // 3. Map the data
  // Since our getTeams() query already calculates sorting and matches fields,
  // we just need to ensure the ID mapping is correct for the table.
  const formattedTeams = rawTeams.map((team: TeamData) => ({
    ...team,
    id: team._id, // Map Sanity's _id to the Table's expected id
    player: team.player || "TBD",
  }));

  return <LeaderboardTable data={formattedTeams} />;
}