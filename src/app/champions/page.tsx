import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  Layers,
  Trophy,
} from "lucide-react";
import { PageTitle, Unavailable } from "@/components/LeagueUI";
import { LaurelTrophy } from "@/components/ChampionsArt";
import { getRecords } from "@/lib/records";
import { championTitle, FORMAT_SHORT, formatChoice } from "@/lib/labels";
import {
  listTournaments,
  STATUS_LABEL,
  type PublicTournament,
} from "@/lib/tournaments";

export const dynamic = "force-dynamic";
const SUBTITLE =
  "Hall of Fame · Explore the history of every XGamer competition.";
export const metadata: Metadata = { title: "Champions", description: SUBTITLE };

/**
 * Champions landing, tournament-first and compact:
 * Hall of Fame → Tournaments → Archive → All-Time Ranking.
 * The all-time tables live on /champions/rankings.
 */
export default async function Champions() {
  const [records, list] = await Promise.all([getRecords(), listTournaments()]);
  const heading = (
    <PageTitle
      compact
      label="HALL OF FAME"
      title="Champions."
      description={SUBTITLE}
    />
  );
  if (!records)
    return (
      <div className="page-shell py-12">
        <div className="champ-home">
          {heading}
          <Unavailable />
        </div>
      </div>
    );
  const tournaments = [
    ...(list?.live ?? []),
    ...(list?.upcoming ?? []),
    ...(list?.past ?? []),
  ];
  const official = new Set(records.hall.map((h) => h.id));
  // No official champion yet: still being played, or finished but final positions not confirmed.
  const undecided = tournaments.filter(
    (t) =>
      t.status === "league" ||
      t.status === "knockout" ||
      (t.status === "completed" && !official.has(t.id)),
  );

  return (
    <div className="page-shell py-12">
      <div className="champ-home">
        {heading}

        <section aria-labelledby="hall" className="champ-fame">
          <div className="champ-fame-head">
            <LaurelTrophy className="champ-fame-emblem" />
            <div className="min-w-0">
              <h2 id="hall" className="champ-fame-title">
                Hall of Fame
              </h2>
              <p className="champ-fame-text">
                Official champions of completed tournaments.
              </p>
            </div>
          </div>
          {records.hall.length || undecided.length ? (
            <ul className="champ-fame-list">
              {records.hall.map((h) => {
                const champion = h.places[0];
                return (
                  <li key={h.id}>
                    <Link
                      href={`/champions/${h.id}`}
                      className="champ-fame-row"
                    >
                      <span className="champ-fame-icon" aria-hidden="true">
                        <Trophy />
                      </span>
                      <span className="champ-fame-info">
                        <span className="champ-fame-name">{h.label}</span>
                        <span className="champ-fame-sub">
                          {championTitle(h)}
                          {champion && (
                            <>
                              : <b>{champion.name}</b>{" "}
                              <span className="champ-code">
                                {champion.code}
                              </span>
                            </>
                          )}
                        </span>
                      </span>
                      <ChevronRight className="champ-chev" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
              {undecided.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/champions/${t.id}`}
                    className="champ-fame-row is-pending"
                  >
                    <span className="champ-fame-icon" aria-hidden="true">
                      <Trophy />
                    </span>
                    <span className="champ-fame-info">
                      <span className="champ-fame-name">{t.label}</span>
                      <span className="champ-fame-sub">
                        {t.status === "completed"
                          ? "Finished — champion not confirmed yet"
                          : "In progress — champion not decided"}
                      </span>
                    </span>
                    <ChevronRight className="champ-chev" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="champ-fame-empty">
              No champions yet. Winners appear here when a tournament finishes.
            </p>
          )}
        </section>

        <section aria-labelledby="tournaments" className="champ-block">
          <div className="champ-block-head">
            <h2 id="tournaments" className="champ-h2">
              Tournaments
            </h2>
            <span className="champ-count">
              {tournaments.length}{" "}
              {tournaments.length === 1 ? "tournament" : "tournaments"}
            </span>
          </div>
          {tournaments.length ? (
            <ul className="champ-cards">
              {tournaments.map((t) => (
                <li key={t.id}>
                  <TournamentCard t={t} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="notice">No tournament is published yet.</p>
          )}
        </section>

        <nav aria-label="More from Champions" className="champ-more">
          <Link href="/champions/archive" className="champ-link-card">
            <Layers className="champ-link-icon" aria-hidden="true" />
            <span className="champ-link-text">
              <strong>Archive</strong> — Results from before XGamer 2.0
            </span>
            <ChevronRight className="champ-chev" aria-hidden="true" />
          </Link>
          <Link
            href="/champions/rankings"
            className="champ-link-card champ-rank-card"
          >
            <BarChart3 className="champ-link-icon" aria-hidden="true" />
            <span className="champ-link-text">
              <strong>All-Time Ranking</strong>
              <span className="champ-link-sub">
                Overall ranking, 13 leaderboards and match records
              </span>
            </span>
            <ChevronRight className="champ-chev" aria-hidden="true" />
          </Link>
        </nav>
      </div>
    </div>
  );
}

function TournamentCard({ t }: { t: PublicTournament }) {
  return (
    <Link href={`/champions/${t.id}`} className="champ-tcard">
      <span className="champ-tcard-art" aria-hidden="true" />
      <span className="champ-tcard-body">
        <span className={`champ-pill champ-pill-${t.status}`}>
          {STATUS_LABEL[t.status]}
        </span>
        <span className="champ-tcard-name">{t.competition ?? t.name}</span>
        <span className="champ-tcard-format">
          {FORMAT_SHORT[formatChoice(t)]}
        </span>
        {t.season && (
          <span className="champ-tcard-season">
            <CalendarDays aria-hidden="true" /> Season {t.season}
          </span>
        )}
      </span>
      <span className="champ-tcard-go">
        <span className="sr-only">Explore Tournament</span>
        <ChevronRight className="champ-chev" aria-hidden="true" />
      </span>
    </Link>
  );
}
