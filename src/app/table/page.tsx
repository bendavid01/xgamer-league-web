import { getSeason, seasonResults } from "@/lib/season";
import { PageTitle, Unavailable } from "@/components/LeagueUI";
import LeaderboardClient from "@/components/LeaderboardClient";
import AutoRefresh from "@/components/AutoRefresh";
import TournamentTabs from "@/components/TournamentTabs";
export const dynamic = "force-dynamic";
export default async function Table({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const season = await getSeason((await searchParams).t);
  const om = season.source === "om";
  const qualified = season.players.filter((p) => p.qualified);
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="LEAGUE STANDINGS"
        title="Earn your place."
        description={
          om
            ? `${season.current?.name} — calculated automatically from confirmed league results.`
            : "The season’s group tables, calculated from confirmed group-stage results."
        }
      />
      <TournamentTabs
        tabs={season.tabs}
        current={season.current?.id}
        path="/table"
      />
      <AutoRefresh />
      {qualified.length > 0 && (
        <section className="panel p-5 mb-6" aria-labelledby="qualified-title">
          <h2 id="qualified-title" className="font-bold text-lg">
            Qualified for the knockout{" "}
            <span className="text-slate-400 font-normal">
              (played in the eFootball app)
            </span>
          </h2>
          <p className="mt-2 text-slate-300">
            {qualified.map((p) => p.name).join(" · ")}
          </p>
        </section>
      )}
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
