import Link from "next/link";
import { getSeason } from "@/lib/season";
import { PageTitle, Unavailable } from "@/components/LeagueUI";
import TournamentTabs from "@/components/TournamentTabs";
export const dynamic = "force-dynamic";
export default async function Players({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const season = await getSeason((await searchParams).t);
  const om = season.source === "om";
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="THE COMPETITORS"
        title="Meet the league."
        description={
          om
            ? `Confirmed players in ${season.current?.name}.`
            : "Public participant records from the existing season."
        }
      />
      <TournamentTabs
        tabs={season.tabs}
        current={season.current?.id}
        path="/players"
      />
      {!season.available ? (
        <Unavailable />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {season.players.map((p) => {
            const card = (
              <>
                <div className="h-12 w-12 grid place-items-center bg-cyan-950 text-cyan-300 rounded-xl text-xl font-bold mb-5">
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <h2 className="font-bold text-lg">
                  {p.name}
                  {p.qualified && (
                    <span className="qualified-badge">Qualified</span>
                  )}
                </h2>
                <p className="text-sm text-slate-500 mt-2">
                  {om
                    ? (p.team ?? "Confirmed player")
                    : `${p.group ? `Group ${p.group}` : "League participant"} · View record →`}
                </p>
              </>
            );
            return om ? (
              <div className="panel p-6" key={p._id}>
                {card}
              </div>
            ) : (
              <Link
                className="panel route-card p-6"
                key={p._id}
                href={`/players/${encodeURIComponent(p._id)}`}
              >
                {card}
              </Link>
            );
          })}
        </div>
      )}
      {season.available && !season.players.length && (
        <p className="notice">
          Players appear here once organizers confirm them.
        </p>
      )}
    </div>
  );
}
