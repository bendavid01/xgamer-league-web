import Link from "next/link";
import { PageTitle } from "@/components/LeagueUI";
import { getCup } from "@/lib/cup";
export const dynamic = "force-dynamic";
export default async function Cup() {
  const cup = await getCup();
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="OCTOBER 24 / XGAMER 2.0"
        title="One field. One champion."
        description="64 players. Four different opponents each. One unified league table. The top eight advance to the knockout rounds."
      />
      <div className="flex flex-wrap gap-4 mt-7">
        <Link href="/register" className="button-primary">
          Application details ↗
        </Link>
        <Link href="/finals" className="button-secondary">
          Qualified player access
        </Link>
      </div>
      {!cup ? (
        <p className="notice mt-10">
          The October Cup is being prepared. Confirmed entrants, fixtures and
          announcements will appear here when organizers publish them.
        </p>
      ) : (
        <>
          <p className="eyebrow mt-10">
            {cup.tournament.status} · {cup.players.length} approved entrants ·{" "}
            {cup.tournament.opponents} opponents
          </p>
          {cup.announcements.map((a) => (
            <article className="notice my-4" key={a.id}>
              <h2 className="text-xl text-white">{a.title}</h2>
              <p className="whitespace-pre-wrap mt-3">{a.message}</p>
            </article>
          ))}
          <div className="grid lg:grid-cols-2 gap-7 mt-10">
            <section className="panel p-6 overflow-x-auto">
              <h2 className="text-2xl mb-5">The climb</h2>
              <table className="control-table">
                <caption>
                  Points, goal difference, then goals scored. Unresolved
                  qualification ties require an organizer playoff.
                </caption>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>P</th>
                    <th>GD</th>
                    <th>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {cup.standings.map((p, i) => (
                    <tr key={p.id}>
                      <td className={i < 8 ? "text-cyan-200" : ""}>{i + 1}</td>
                      <td>{p.name}</td>
                      <td>{p.played}</td>
                      <td>{p.gd}</td>
                      <td>{p.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="panel p-6">
              <h2 className="text-2xl mb-5">Inside the arena</h2>
              {!cup.fixtures.length && (
                <p className="text-slate-400">
                  The field is forming. Fixtures follow after registration
                  closes.
                </p>
              )}
              <div className="max-h-[800px] overflow-y-auto space-y-4">
                {cup.fixtures.map((f) => (
                  <article
                    key={f.id}
                    className="border-b border-slate-700 pb-4"
                  >
                    <p className="text-xs text-slate-400">
                      {f.stage} / ROUND {f.round}
                    </p>
                    <p className="flex justify-between gap-4 mt-2">
                      <span>
                        {cup.players.find((p) => p.id === f.home)?.name} vs{" "}
                        {cup.players.find((p) => p.id === f.away)?.name}
                      </span>
                      <strong>
                        {f.home_score === null
                          ? "Scheduled"
                          : `${f.home_score} – ${f.away_score}`}
                      </strong>
                    </p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
