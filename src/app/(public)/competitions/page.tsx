import Link from "next/link";
import { Trophy, ArrowUpRight } from "lucide-react";
import { getLeague } from "@/lib/league";
import { PageTitle, Unavailable } from "@/components/LeagueUI";
export const revalidate = 30;
export default async function Competitions() {
  const { teams, matches, available } = await getLeague();
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="COMPETE / EFOOTBALL"
        title="The arena is yours."
        description="Explore the existing X-Gamer competition. Published fixtures and results come directly from the league organizers."
      />
      {!available ? (
        <Unavailable />
      ) : (
        <article className="panel p-7 md:p-10 max-w-3xl">
          <div className="flex justify-between items-center">
            <Trophy className="text-cyan-300" size={32} />
            <span className="text-xs text-cyan-300 border border-cyan-900 px-3 py-1 rounded-full">
              PUBLISHED LEAGUE
            </span>
          </div>
          <h2 className="text-3xl font-bold mt-8">X-Gamer Pro League</h2>
          <p className="text-slate-400 mt-3">
            Existing season · eFootball · Group stage & finals
          </p>
          <div className="flex gap-8 my-7 text-sm">
            <span>{teams.length} participants</span>
            <span>{matches.length} fixtures</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/matches" className="button-primary">
              View fixtures <ArrowUpRight size={18} />
            </Link>
            <Link href="/table" className="button-secondary">
              Standings
            </Link>
          </div>
        </article>
      )}
    </div>
  );
}
