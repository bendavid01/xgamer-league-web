import HomeIntro from "@/components/HomeIntro";
import { MatchCard, RouteCard, Unavailable } from "@/components/LeagueUI";
import { getLeague } from "@/lib/league";
import Link from "next/link";
export const revalidate = 30;
export default async function Home() {
  const { teams, matches, available } = await getLeague();
  const featured = [
    ...matches.filter((m) => m.status === "live"),
    ...matches.filter((m) => m.status === "scheduled"),
    ...matches.filter((m) => m.status === "completed").reverse(),
  ].slice(0, 3);
  return (
    <div className="page-shell">
      <HomeIntro />
      <div className="grid grid-cols-3 border-y border-slate-800 py-6 mb-12 gap-4">
        {[
          [teams.length, "PARTICIPANTS"],
          [matches.length, "FIXTURES"],
          [matches.filter((m) => m.status === "completed").length, "RESULTS"],
        ].map(([n, label]) => (
          <div key={label}>
            <strong className="text-2xl md:text-4xl font-black">
              {available ? n : "—"}
            </strong>
            <p className="text-[10px] sm:text-xs text-slate-500 tracking-widest mt-2">
              {label}
            </p>
          </div>
        ))}
      </div>
      <section className="mb-14">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-2xl font-bold">Around the arena</h2>
          <Link href="/matches" className="text-sm text-cyan-300">
            All matches →
          </Link>
        </div>
        {!available ? (
          <Unavailable />
        ) : featured.length ? (
          <div className="grid md:grid-cols-3 gap-4">
            {featured.map((m) => (
              <MatchCard key={m._id} match={m} />
            ))}
          </div>
        ) : (
          <p className="notice">
            The next fixtures will appear here when published by the organizers.
          </p>
        )}
      </section>
      <section className="grid md:grid-cols-3 gap-4 mb-14">
        <RouteCard href="/table" title="The climb">
          Follow the standings. Every point counts.
        </RouteCard>
        <RouteCard href="/players" title="The competitors">
          Explore participant records from the existing league.
        </RouteCard>
        <RouteCard href="/register" title="Your next step">
          See guest entry, manual verification and account availability.
        </RouteCard>
      </section>
    </div>
  );
}
