import { getSeason } from "@/lib/season";
import { PageTitle, Unavailable } from "@/components/LeagueUI";
import MatchCenter from "@/components/MatchCenter";
import AutoRefresh from "@/components/AutoRefresh";
import TournamentTabs from "@/components/TournamentTabs";
export const dynamic = "force-dynamic";
export default async function Matches({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const season = await getSeason((await searchParams).t);
  const knockoutInApp =
    season.current?.status === "knockout" ||
    season.current?.format === "knockout";
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="MATCH CENTER"
        title="Every fixture. Every result."
        description={
          season.current
            ? `${season.current.name} — league fixtures and confirmed results. Scores refresh while this page is open.`
            : "Fixtures and confirmed results. Scores refresh while this page is open."
        }
      />
      <TournamentTabs
        tabs={season.tabs}
        current={season.current?.id}
        path="/matches"
      />
      {knockoutInApp && (
        <p className="notice mb-6">
          The knockout stage is played in the eFootball app. Results are shared
          in our Discord and WhatsApp groups.
        </p>
      )}
      <AutoRefresh />
      {season.available ? (
        <MatchCenter matches={season.matches} />
      ) : (
        <Unavailable />
      )}
    </div>
  );
}
