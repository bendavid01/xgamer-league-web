import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageTitle, Unavailable } from "@/components/LeagueUI";
import {
  getRecords,
  MIN_MATCHES,
  RANKING_POINTS,
  type MatchRecord,
  type PlayerRecord,
} from "@/lib/records";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "All-Time Ranking — Champions",
  description:
    "XGamer Ranking, 13 all-time leaderboards and match records across every published XGamer tournament.",
};

type Board = {
  title: string;
  note?: string;
  rows: PlayerRecord[];
  value: (p: PlayerRecord) => string | number;
};

/**
 * All-time view, moved here from the Champions landing page unchanged:
 * same data, calculations, scoring and tie-breaks.
 */
export default async function AllTimeRanking() {
  const records = await getRecords();
  const head = (
    <>
      <Link href="/champions" className="hub-back">
        <ArrowLeft size={16} aria-hidden="true" /> Back to Champions
      </Link>
      <PageTitle
        compact
        label="HALL OF FAME / ALL-TIME"
        title="All-Time Ranking."
        description="Overall ranking, 13 leaderboards and match records — calculated from every published XGamer tournament."
      />
    </>
  );
  if (!records)
    return (
      <div className="page-shell py-12">
        {head}
        <Unavailable />
      </div>
    );
  const { players, biggestWins, highestScoring } = records;
  const active = players.filter((p) => p.played > 0);
  const qualified = players.filter((p) => p.played >= MIN_MATCHES);
  const top = (
    list: PlayerRecord[],
    key: (p: PlayerRecord) => number,
    asc = false,
  ) =>
    [...list]
      .sort((a, b) => (asc ? key(a) - key(b) : key(b) - key(a)))
      .slice(0, 5);

  const boards: Board[] = [
    {
      title: "Most titles",
      rows: top(
        players.filter((p) => p.titles),
        (p) => p.titles,
      ),
      value: (p) => p.titles,
    },
    {
      title: "Most podiums",
      note: "1st, 2nd or 3rd",
      rows: top(
        players.filter((p) => p.podiums),
        (p) => p.podiums,
      ),
      value: (p) => p.podiums,
    },
    {
      title: "Knockouts reached",
      rows: top(
        players.filter((p) => p.knockouts),
        (p) => p.knockouts,
      ),
      value: (p) => p.knockouts,
    },
    {
      title: "Most wins",
      rows: top(
        active.filter((p) => p.won),
        (p) => p.won,
      ),
      value: (p) => p.won,
    },
    {
      title: "Win rate",
      note: `${MIN_MATCHES}+ matches`,
      rows: top(qualified, (p) => p.winRate),
      value: (p) => `${p.winRate}%`,
    },
    {
      title: "Points per game",
      note: `${MIN_MATCHES}+ matches`,
      rows: top(qualified, (p) => p.pointsPerGame),
      value: (p) => p.pointsPerGame.toFixed(2),
    },
    {
      title: "Goals scored",
      note: "by the player's team",
      rows: top(
        active.filter((p) => p.gf),
        (p) => p.gf,
      ),
      value: (p) => p.gf,
    },
    {
      title: "Goal difference",
      rows: top(active, (p) => p.gd),
      value: (p) => (p.gd > 0 ? `+${p.gd}` : p.gd),
    },
    {
      title: "Best defence",
      note: `goals conceded per game · ${MIN_MATCHES}+ matches`,
      rows: top(qualified, (p) => p.concededPerGame, true),
      value: (p) => p.concededPerGame.toFixed(2),
    },
    {
      title: "Clean sheets",
      rows: top(
        active.filter((p) => p.cleanSheets),
        (p) => p.cleanSheets,
      ),
      value: (p) => p.cleanSheets,
    },
    {
      title: "Longest winning streak",
      rows: top(
        active.filter((p) => p.bestWinStreak),
        (p) => p.bestWinStreak,
      ),
      value: (p) => p.bestWinStreak,
    },
    {
      title: "Longest unbeaten run",
      rows: top(
        active.filter((p) => p.bestUnbeaten),
        (p) => p.bestUnbeaten,
      ),
      value: (p) => p.bestUnbeaten,
    },
  ];
  const inForm = top(active, (p) => p.formPoints);

  return (
    <div className="page-shell py-12 records">
      {head}

      <section aria-labelledby="ranking" className="records-section !mt-2">
        <h2 id="ranking" className="records-h2">
          XGamer Ranking
        </h2>
        <p className="text-sm text-slate-400 -mt-2 mb-4">
          All-time, across every tournament. Champion {RANKING_POINTS.champion}{" "}
          pts · Runner-up {RANKING_POINTS.runnerUp} · Third{" "}
          {RANKING_POINTS.third} · Knockout reached {RANKING_POINTS.knockout} ·{" "}
          {RANKING_POINTS.leagueWin} per league win. Separate from each
          tournament&apos;s own standings.
        </p>
        {players.length ? (
          <div className="panel overflow-x-auto">
            <table className="records-table">
              <thead>
                <tr>
                  {[
                    ["#", "Rank"],
                    ["Player", "Player"],
                    ["T", "Tournaments"],
                    ["Cups", "Titles"],
                    ["Pod", "Podiums"],
                    ["KO", "Knockouts reached"],
                    ["P", "Played"],
                    ["W", "Won"],
                    ["D", "Drawn"],
                    ["L", "Lost"],
                    ["GF", "Goals for"],
                    ["GA", "Goals against"],
                    ["GD", "Goal difference"],
                    ["Win%", "Win rate"],
                    ["Pts", "Ranking points"],
                  ].map(([h, title]) => (
                    <th key={h} scope="col" title={title}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.id} className={i < 3 ? `rank-${i + 1}` : ""}>
                    <td>{i + 1}</td>
                    <th scope="row">
                      <Link href={`/players/${p.code}`}>{p.name}</Link>
                    </th>
                    {[
                      p.tournaments,
                      p.titles,
                      p.podiums,
                      p.knockouts,
                      p.played,
                      p.won,
                      p.drawn,
                      p.lost,
                      p.gf,
                      p.ga,
                      p.gd > 0 ? `+${p.gd}` : p.gd,
                      p.played ? `${p.winRate}%` : "—",
                    ].map((v, j) => (
                      <td key={j}>{v}</td>
                    ))}
                    <td className="records-pts">{p.ranking}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="notice">Rankings start once players are confirmed.</p>
        )}
      </section>

      <section aria-labelledby="boards" className="records-section">
        <h2 id="boards" className="records-h2">
          All-time leaderboards
        </h2>
        <div className="boards">
          {boards.map((b) => (
            <section key={b.title} className="board">
              <h3>
                {b.title}
                {b.note && <span>{b.note}</span>}
              </h3>
              {b.rows.length ? (
                <ol>
                  {b.rows.map((p, i) => (
                    <li key={p.id}>
                      <span className="board-rank">{i + 1}</span>
                      <Link href={`/players/${p.code}`} className="board-name">
                        {p.name}
                      </Link>
                      <span className="board-value">{b.value(p)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="board-empty">Not enough results yet.</p>
              )}
            </section>
          ))}
          <section className="board">
            <h3>
              In form<span>last 5 matches</span>
            </h3>
            {inForm.length ? (
              <ol>
                {inForm.map((p, i) => (
                  <li key={p.id}>
                    <span className="board-rank">{i + 1}</span>
                    <Link href={`/players/${p.code}`} className="board-name">
                      {p.name}
                    </Link>
                    <span className="board-form">
                      {p.form.map((r, j) => (
                        <span key={j} className={`form-chip form-${r}`}>
                          {r}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="board-empty">Not enough results yet.</p>
            )}
          </section>
        </div>
      </section>

      <section aria-labelledby="matches" className="records-section">
        <h2 id="matches" className="records-h2">
          Match records
        </h2>
        <div className="boards boards-2">
          <MatchBoard title="Biggest wins" rows={biggestWins} />
          <MatchBoard title="Highest-scoring matches" rows={highestScoring} />
        </div>
      </section>
    </div>
  );
}

function MatchBoard({ title, rows }: { title: string; rows: MatchRecord[] }) {
  return (
    <section className="board">
      <h3>{title}</h3>
      {rows.length ? (
        <ol>
          {rows.map((m, i) => (
            <li key={i} className="board-match">
              <span className="board-rank">{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate">
                  <Link href={`/players/${m.winner.code}`}>
                    {m.winner.name}
                  </Link>{" "}
                  <b className="text-cyan-300">
                    {m.winnerGoals}–{m.loserGoals}
                  </b>{" "}
                  <Link href={`/players/${m.loser.code}`}>{m.loser.name}</Link>
                </span>
                <span className="block text-xs text-slate-500 truncate">
                  {m.tournament} · Round {m.round}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="board-empty">No results yet.</p>
      )}
    </section>
  );
}
