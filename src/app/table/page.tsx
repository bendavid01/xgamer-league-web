import { getLeague, validCompleted } from "@/lib/league";
import { PageTitle, Unavailable } from "@/components/LeagueUI";
import LeaderboardClient from "@/components/LeaderboardClient";
import AutoRefresh from "@/components/AutoRefresh";
export const revalidate = 30;
export default async function Table() {
  const { teams, matches, available } = await getLeague();
  const results = validCompleted(matches)
    .filter((m) => m.stage === "Group Stage")
    .map((m) => ({
      home: m.home!._id,
      away: m.away!._id,
      homeScore: m.homeScore!,
      awayScore: m.awayScore!,
    }));
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="LEAGUE STANDINGS"
        title="Earn your place."
        description="The existing season’s group tables, calculated from confirmed group-stage results."
      />
      <AutoRefresh />
      {available ? (
        <LeaderboardClient
          teams={teams.map((t) => ({
            id: t._id,
            name: t.name,
            group: t.group,
          }))}
          matches={results}
        />
      ) : (
        <Unavailable />
      )}
    </div>
  );
}
