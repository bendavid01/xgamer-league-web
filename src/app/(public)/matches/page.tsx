import { getLeague } from "@/lib/league";
import { PageTitle, Unavailable } from "@/components/LeagueUI";
import MatchCenter from "@/components/MatchCenter";
import AutoRefresh from "@/components/AutoRefresh";
export const revalidate = 30;
export default async function Matches() {
  const { matches, available } = await getLeague();
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="MATCH CENTER"
        title="Every fixture. Every result."
        description="Published eFootball matches from the existing league. Scores refresh while this page is visible; match rooms and kickoff arrangements are managed externally."
      />
      <AutoRefresh />
      {available ? <MatchCenter matches={matches} /> : <Unavailable />}
    </div>
  );
}
