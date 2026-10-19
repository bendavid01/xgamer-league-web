import { PageTitle } from "@/components/LeagueUI";
import TournamentPlanner from "@/components/TournamentPlanner";
export default function Planner() {
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="TOURNAMENT LAB / PREVIEW"
        title="Build your next rivalry."
        description="Generate schedules, enter draft scores and preview knockout progression. Tournament publication remains with the organizers."
      />
      <TournamentPlanner />
    </div>
  );
}
