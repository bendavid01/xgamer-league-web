import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Archive } from "lucide-react";
import { PageTitle } from "@/components/LeagueUI";
import { getLeague, type LeagueMatch } from "@/lib/league";
import { standings } from "@/lib/tournament";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Archive — Champions",
  description: "XGamer results from before XGamer 2.0.",
};

const played = (m: LeagueMatch) =>
  m.status === "completed" &&
  !!m.home &&
  !!m.away &&
  Number.isInteger(m.homeScore) &&
  Number.isInteger(m.awayScore);

/**
 * Legacy Sanity records, shown as they were saved. Read-only. Archive
 * participants have no permanent XGamer IDs and are never merged with, or
 * counted in, current player careers or the XGamer Ranking.
 */
export default async function ChampionsArchive() {
  const league = await getLeague();
  const groups = [
    ...new Set(league.teams.map((t) => t.group).filter(Boolean)),
  ].sort() as string[];
  const groupMatches = league.matches.filter(
    (m) => played(m) && m.stage === "Group Stage",
  );
  const other = league.matches.filter(
    (m) => played(m) && m.stage !== "Group Stage",
  );
  return (
    <div className="page-shell py-12">
      <Link href="/champions" className="hub-back">
        <ArrowLeft size={16} aria-hidden="true" /> Champions
      </Link>
      <PageTitle
        compact
        label="ARCHIVE / PRE-2.0"
        title="Archive."
        description="Results saved before XGamer 2.0, shown exactly as recorded."
      />
      <p className="archive-banner">
        <Archive size={18} aria-hidden="true" />
        Archive records are not linked to permanent XGamer player IDs. They are
        not counted in player careers or the XGamer Ranking.
      </p>
      {!league.available ? (
        <p className="notice">The archive is unavailable right now.</p>
      ) : !league.teams.length && !league.matches.length ? (
        <p className="notice">No archived records were found.</p>
      ) : (
        <div className="space-y-10 mt-8">
          <p className="text-slate-400">
            {league.teams.length} participants ·{" "}
            {league.matches.filter(played).length} completed matches
          </p>
          {(groups.length ? groups : [null]).map((g) => {
            const teams = league.teams
              .filter((t) => (g ? t.group === g : true))
              .map((t) => ({ id: t._id, name: t.name }));
            const results = groupMatches
              .filter((m) => teams.some((t) => t.id === m.home!._id))
              .map((m) => ({
                home: m.home!._id,
                away: m.away!._id,
                homeScore: m.homeScore!,
                awayScore: m.awayScore!,
              }))
              .filter((r) => teams.some((t) => t.id === r.away));
            let table: ReturnType<typeof standings> = [];
            try {
              table = standings(teams, results);
            } catch {
              table = [];
            }
            return (
              <section key={g ?? "all"}>
                <h2 className="records-h2">
                  {g ? `Group ${g}` : "Group stage"}
                </h2>
                <div className="panel overflow-x-auto">
                  <table className="records-table">
                    <thead>
                      <tr>
                        {[
                          "#",
                          "Participant",
                          "P",
                          "W",
                          "D",
                          "L",
                          "GF",
                          "GA",
                          "GD",
                          "Pts",
                        ].map((h) => (
                          <th key={h} scope="col">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.map((r, i) => (
                        <tr key={r.id}>
                          <td>{i + 1}</td>
                          <th scope="row">{r.name}</th>
                          {[
                            r.played,
                            r.won,
                            r.drawn,
                            r.lost,
                            r.gf,
                            r.ga,
                            r.gd,
                            r.pts,
                          ].map((v, j) => (
                            <td key={j}>{v}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
          {other.length > 0 && (
            <section>
              <h2 className="records-h2">Other rounds</h2>
              <ul className="hub-round">
                {other.map((m) => (
                  <li key={m._id} className="hub-row">
                    <span className="hub-name">{m.home!.name}</span>
                    <span className="hub-score">
                      {m.homeScore} – {m.awayScore}
                    </span>
                    <span className="hub-name hub-away">
                      {m.away!.name}
                      <span className="block text-xs text-slate-500">
                        {m.stage ?? "Match"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
