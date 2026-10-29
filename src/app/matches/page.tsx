import { getSeason } from "@/lib/season";
import { PageTitle, Unavailable } from "@/components/LeagueUI";
import MatchCenter from "@/components/MatchCenter";
import AutoRefresh from "@/components/AutoRefresh";
export const revalidate = 30;
export default async function Matches() {
  const season = await getSeason();
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="MATCH CENTER"
        title="Every fixture. Every result."
        description={
          season.title
            ? `${season.title} — fixtures and confirmed results. Scores refresh while this page is open.`
            : "Fixtures and confirmed results. Scores refresh while this page is open."
        }
      />
      <AutoRefresh />
      {season.available ? (
        <MatchCenter matches={season.matches} />
      ) : (
        <Unavailable />
      )}
    </div>
  );
}
