import { getSeason, seasonResults } from "@/lib/season";
import { PageTitle, Unavailable } from "@/components/LeagueUI";
import LeaderboardClient from "@/components/LeaderboardClient";
import AutoRefresh from "@/components/AutoRefresh";
export const revalidate = 30;
export default async function Table() {
  const season = await getSeason();
  const om = season.source === "om";
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="LEAGUE STANDINGS"
        title="Earn your place."
        description={
          om
            ? `${season.title ?? "Current tournament"} — calculated automatically from confirmed league results.`
            : "The season’s group tables, calculated from confirmed group-stage results."
        }
      />
      <AutoRefresh />
      {season.available ? (
        <LeaderboardClient
          teams={season.players.map((t) => ({
            id: t._id,
            name: t.name,
            group: t.group,
          }))}
          matches={seasonResults(season)}
          linkPlayers={!om}
          cutoff={season.qualifiers}
        />
      ) : (
        <Unavailable />
      )}
    </div>
  );
}
