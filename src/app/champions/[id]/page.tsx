import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Flame,
  Medal,
  Shield,
  Swords,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { Unavailable } from "@/components/LeagueUI";
import {
  DEFENCE_MIN_MATCHES,
  getChampionsTournament,
  type Holders,
  type Who,
} from "@/lib/champions";
import { STATUS_LABEL } from "@/lib/tournaments";
import { FORMAT_SHORT, formatChoice, PLACE_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

const TABS = [
  ["podium", "Podium"],
  ["players", "Players"],
  ["records", "Records"],
] as const;
type Tab = (typeof TABS)[number][0];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const data = await getChampionsTournament((await params).id).catch(
    () => null,
  );
  return data
    ? {
        title: `${data.tournament.label} — Champions`,
        description: `Podium, players and records of ${data.tournament.label}.`,
      }
    : { title: "Champions" };
}

export default async function TournamentChampions({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab: raw }] = await Promise.all([params, searchParams]);
  if (!/^[a-z0-9-]{3,80}$/.test(id)) notFound();
  const data = await getChampionsTournament(id);
  if (!data) {
    if (!process.env.DATABASE_URL)
      return (
        <div className="page-shell py-12">
          <Unavailable />
        </div>
      );
    notFound();
  }
  const t = data.tournament;
  const tab: Tab = TABS.some(([k]) => k === raw) ? (raw as Tab) : "podium";
  const byId = new Map(data.players.map((p) => [p.id, p]));
  const statsHref = (p: Who) =>
    `/players/${p.code}?t=${encodeURIComponent(t.id)}`;
  const finished = t.status === "completed";

  return (
    <div className="page-shell py-10 champ">
      <Link href="/champions" className="hub-back">
        <ArrowLeft size={16} aria-hidden="true" /> Champions
      </Link>
      <header className="champ-head">
        <span className="champ-crest" aria-hidden="true">
          <Trophy />
        </span>
        <div className="min-w-0">
          {t.season && <p className="champ-season">Season {t.season}</p>}
          <h1 className="champ-title">{t.competition ?? t.name}</h1>
          <p className="champ-meta">
            <span className={`status-pill status-${t.status}`}>
              {STATUS_LABEL[t.status]}
            </span>
            <span>{FORMAT_SHORT[formatChoice(t)]}</span>
            <span>
              <Users size={14} aria-hidden="true" /> {data.players.length}{" "}
              players
            </span>
            {data.rounds > 0 && <span>{data.rounds} rounds</span>}
            {t.starts_on && (
              <span>
                Started{" "}
                {new Date(t.starts_on).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            )}
          </p>
        </div>
      </header>

      <nav className="champ-tabs" aria-label="Tournament records">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/champions/${t.id}?tab=${k}`}
            aria-current={k === tab ? "page" : undefined}
            className={k === tab ? "champ-tab champ-tab-on" : "champ-tab"}
          >
            {k === "podium" ? (
              <Trophy size={17} aria-hidden="true" />
            ) : k === "players" ? (
              <Users size={17} aria-hidden="true" />
            ) : (
              <BarChart3 size={17} aria-hidden="true" />
            )}
            {label}
            {k === "players" && ` (${data.players.length})`}
          </Link>
        ))}
      </nav>

      {tab === "podium" &&
        (data.official ? (
          <ol className="champ-podium" aria-label="Official final positions">
            {data.podium.map((pid, i) => {
              const p = pid ? byId.get(pid) : null;
              if (!p) return null;
              return (
                <li
                  key={i}
                  className={`champ-place champ-place-${i + 1}`}
                  tabIndex={0}
                >
                  {i === 0 && t.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- consented champion photo from our own route
                    <img
                      className="champ-place-photo"
                      src={`/api/photo/${t.id}?v=${t.photo}`}
                      alt={`${p.name}, champion`}
                    />
                  ) : (
                    <span className="champ-place-avatar" aria-hidden="true">
                      {p.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="champ-place-label">
                    {i === 0 ? (
                      <Trophy size={16} aria-hidden="true" />
                    ) : (
                      <Medal size={16} aria-hidden="true" />
                    )}
                    {PLACE_LABEL[i + 1]}
                  </span>
                  <strong className="champ-place-name">{p.name}</strong>
                  <span className="champ-place-code">{p.code}</span>
                  {p.team && <span className="champ-place-team">{p.team}</span>}
                  <Link href={statsHref(p)} className="champ-action">
                    View Player Stats
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="champ-empty">
            <Trophy aria-hidden="true" />
            <h2>Podium pending</h2>
            <p>
              {finished
                ? "The final positions haven't been confirmed by the organizers yet."
                : "The champion is decided when the tournament finishes. Official placements appear here once an organizer confirms them."}
            </p>
          </div>
        ))}

      {tab === "players" &&
        (data.players.length ? (
          <ul className="champ-players">
            {data.players.map((p) => {
              const l = data.records.lines[p.id];
              return (
                <li key={p.id} className="champ-player">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block truncate">{p.name}</strong>
                      <span className="text-sm text-slate-400">
                        <span className="font-mono text-cyan-300">
                          {p.code}
                        </span>
                        {p.team ? ` · ${p.team}` : ""}
                      </span>
                    </div>
                    <span
                      className={`champ-status champ-status-${data.status[p.id].toLowerCase().replace(/[^a-z]+/g, "-")}`}
                    >
                      {data.status[p.id]}
                    </span>
                  </div>
                  <p className="champ-line">
                    <span>
                      <b>{l.played}</b> P
                    </span>
                    <span>
                      <b>{l.won}</b>W <b>{l.drawn}</b>D <b>{l.lost}</b>L
                    </span>
                    <span>
                      Goals <b>{l.gf}</b>–<b>{l.ga}</b>
                    </span>
                    <span>
                      GD <b>{l.gd > 0 ? `+${l.gd}` : l.gd}</b>
                    </span>
                  </p>
                  <Link href={statsHref(p)} className="champ-link">
                    View Player Details →
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="notice">
            Players appear here once the organizers approve them.
          </p>
        ))}

      {tab === "records" && (
        <section aria-label="Tournament records">
          <p className="champ-note">
            {finished
              ? "Final records, calculated from official results only."
              : "Current records — they update as official results come in."}{" "}
            Goals are those scored by each player&apos;s eFootball team.
          </p>
          {data.records.matches === 0 ? (
            <p className="notice">
              No official results yet. Records appear after the first scores are
              entered.
            </p>
          ) : (
            <>
              <div className="champ-records">
                <RecordCard
                  icon={<Target />}
                  title="Top Scorer"
                  holders={data.records.topScorer}
                  unit="goals"
                  href={statsHref}
                />
                <RecordCard
                  icon={<Shield />}
                  title="Best Defence"
                  holders={
                    data.records.bestDefence && {
                      value: data.records.bestDefence.perMatch,
                      players: data.records.bestDefence.players,
                    }
                  }
                  unit="conceded per match"
                  empty={`Insufficient matches (needs ${data.records.defenceMin}+)`}
                  href={statsHref}
                />
                <RecordCard
                  icon={<Flame />}
                  title="Longest Winning Streak"
                  holders={data.records.longestStreak}
                  unit="wins in a row"
                  href={statsHref}
                />
                <article className="champ-record">
                  <h3>
                    <Swords aria-hidden="true" /> Biggest Victory
                  </h3>
                  {data.records.biggestVictory.length ? (
                    <ul className="space-y-3">
                      {data.records.biggestVictory.map((v) => (
                        <li key={v.fixtureId}>
                          <span className="champ-record-value">
                            {v.winnerGoals}–{v.loserGoals}
                          </span>
                          <span className="block">
                            <Link href={statsHref(v.winner)}>
                              {v.winner.name}
                            </Link>{" "}
                            <span className="font-mono text-xs text-cyan-300">
                              {v.winner.code}
                            </span>{" "}
                            beat {v.loser.name}
                          </span>
                          <span className="text-xs text-slate-500">
                            Round {v.round}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="champ-record-empty">No wins yet</p>
                  )}
                </article>
              </div>
              <h2 className="champ-subhead">More records</h2>
              <div className="champ-records champ-records-small">
                <RecordCard
                  title="Most Wins"
                  holders={data.records.mostWins}
                  unit="wins"
                  href={statsHref}
                />
                <RecordCard
                  title="Most Draws"
                  holders={data.records.mostDraws}
                  unit="draws"
                  href={statsHref}
                />
                <RecordCard
                  title="Highest Goal Difference"
                  holders={data.records.highestGoalDifference}
                  unit="goal difference"
                  signed
                  href={statsHref}
                />
              </div>
              <p className="champ-note">
                Best Defence: fewest goals conceded per match among players with
                at least {DEFENCE_MIN_MATCHES} matches and at least half of the
                most active player&apos;s matches. Winning streaks follow the
                official round order, not necessarily the order the matches were
                played (match dates aren&apos;t recorded). Ties list every
                player. Walkovers aren&apos;t recorded separately.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function RecordCard({
  icon,
  title,
  holders,
  unit,
  empty = "Not enough results yet",
  signed = false,
  href,
}: {
  icon?: React.ReactNode;
  title: string;
  holders: Holders | null;
  unit: string;
  empty?: string;
  signed?: boolean;
  href: (p: Who) => string;
}) {
  return (
    <article className="champ-record">
      <h3>
        {icon && <span aria-hidden="true">{icon}</span>}
        {title}
      </h3>
      {holders ? (
        <>
          <p>
            <span className="champ-record-value">
              {signed && holders.value > 0
                ? `+${holders.value}`
                : holders.value}
            </span>{" "}
            <span className="text-sm text-slate-400">{unit}</span>
          </p>
          <ul className="champ-holders">
            {holders.players.map((p) => (
              <li key={p.id}>
                <Link href={href(p)}>{p.name}</Link>{" "}
                <span className="font-mono text-xs text-cyan-300">
                  {p.code}
                </span>
                {p.team && (
                  <span className="text-xs text-slate-500"> · {p.team}</span>
                )}
              </li>
            ))}
          </ul>
          {holders.players.length > 1 && (
            <p className="text-xs text-slate-500 mt-1">
              Shared by {holders.players.length} players
            </p>
          )}
        </>
      ) : (
        <p className="champ-record-empty">{empty}</p>
      )}
    </article>
  );
}
