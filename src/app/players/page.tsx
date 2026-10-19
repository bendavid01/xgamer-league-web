import Link from "next/link";
import { getLeague } from "@/lib/league";
import { PageTitle, Unavailable } from "@/components/LeagueUI";
export const revalidate = 30;
export default async function Players() {
  const { teams, available } = await getLeague();
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="THE COMPETITORS"
        title="Meet the league."
        description="Public participant records from the existing season. These are league entries, not verified account profiles."
      />
      {!available ? (
        <Unavailable />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((t) => (
            <Link
              className="panel route-card p-6"
              key={t._id}
              href={`/players/${encodeURIComponent(t._id)}`}
            >
              <div className="h-12 w-12 grid place-items-center bg-cyan-950 text-cyan-300 rounded-xl text-xl font-bold mb-5">
                {t.name.slice(0, 2).toUpperCase()}
              </div>
              <h2 className="font-bold text-lg">{t.name}</h2>
              <p className="text-sm text-slate-500 mt-2">
                {t.group ? `Group ${t.group}` : "League participant"} · View
                record →
              </p>
            </Link>
          ))}
        </div>
      )}
      {available && !teams.length && (
        <p className="notice">
          Participants will appear when the organizers publish them.
        </p>
      )}
    </div>
  );
}
