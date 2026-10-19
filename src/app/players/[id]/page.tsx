import { notFound } from "next/navigation";
import Link from "next/link";
import { getLeague, validCompleted } from "@/lib/league";
import { standings } from "@/lib/tournament";
import { PageTitle, MatchCard, Unavailable } from "@/components/LeagueUI";
export const revalidate = 30;
export default async function Profile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { teams, matches, available } = await getLeague();
  if (!available)
    return (
      <div className="page-shell py-12">
        <Unavailable />
      </div>
    );
  const team = teams.find((t) => t._id === id);
  if (!team) notFound();
  const fixtures = matches.filter(
    (m) => m.home?._id === id || m.away?._id === id,
  );
  const stats = standings(
    teams.map((t) => ({ id: t._id, name: t.name })),
    validCompleted(matches).map((m) => ({
      home: m.home!._id,
      away: m.away!._id,
      homeScore: m.homeScore!,
      awayScore: m.awayScore!,
    })),
  ).find((r) => r.id === id)!;
  return (
    <div className="page-shell py-12">
      <Link className="text-cyan-300 text-sm inline-block mb-8" href="/players">
        ← All participants
      </Link>
      <PageTitle
        label={team.group ? `GROUP ${team.group}` : "LEAGUE PARTICIPANT"}
        title={team.name}
        description="Published league record · Account ownership not yet linked"
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {[
          [stats.played, "Played"],
          [stats.won, "Wins"],
          [stats.gf, "Goals for"],
          [stats.gd, "Goal difference"],
        ].map(([n, label]) => (
          <div className="panel p-5" key={label}>
            <p className="text-3xl font-bold text-cyan-300">{n}</p>
            <p className="text-slate-400 text-sm mt-2">{label}</p>
          </div>
        ))}
      </div>
      <h2 className="text-2xl font-bold mb-5">Match history & fixtures</h2>
      <div className="grid md:grid-cols-2 gap-4">
        {fixtures.map((m) => (
          <MatchCard key={m._id} match={m} />
        ))}
      </div>
      {!fixtures.length && <p className="notice">No fixtures published yet.</p>}
    </div>
  );
}
