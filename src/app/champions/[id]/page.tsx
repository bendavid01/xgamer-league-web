import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Flame,
  Medal,
  ShieldCheck,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { Unavailable } from "@/components/LeagueUI";
import { LaurelTrophy, PodiumSteps } from "@/components/ChampionsArt";
import {
  DEFENCE_MIN_MATCHES,
  getChampionsTournament,
  type Holders,
  type Who,
} from "@/lib/champions";
import { codeNumber } from "@/lib/codes";
import { STATUS_LABEL } from "@/lib/tournaments";
import { FORMAT_SHORT, formatChoice, PLACE_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "podium", label: "Podium", Icon: Trophy },
  { key: "players", label: "Players", Icon: Users },
  { key: "records", label: "Records", Icon: BarChart3 },
] as const;
type Tab = (typeof TABS)[number]["key"];

const initials = (name: string) => name.slice(0, 2).toUpperCase();
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, "-");

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
  const tab: Tab = TABS.find((x) => x.key === raw)?.key ?? "podium";
  const byId = new Map(data.players.map((p) => [p.id, p]));
  const statsHref = (p: Who) =>
    `/players/${p.code}?t=${encodeURIComponent(t.id)}`;
  const finished = t.status === "completed";
  // Permanent ID order.
  const roster = [...data.players].sort(
    (a, b) => (codeNumber(a.code) ?? 0) - (codeNumber(b.code) ?? 0),
  );
  const r = data.records;

  return (
    <div className="page-shell py-10">
      <div className="champ">
        <Link href="/champions" className="hub-back">
          <ArrowLeft size={16} aria-hidden="true" /> Back to Champions
        </Link>
        <header className="champ-hero">
          <span className="champ-emblem" aria-hidden="true" />
          <div className="min-w-0">
            <h1 className="champ-title">{t.competition ?? t.name}</h1>
            <p className="champ-meta">
              <span className={`champ-pill champ-pill-${t.status}`}>
                {STATUS_LABEL[t.status]}
              </span>
              <span>
                {FORMAT_SHORT[formatChoice(t)]}
                {t.season ? ` · Season ${t.season}` : ""}
              </span>
            </p>
          </div>
        </header>

        <nav className="champ-tabs" aria-label="Tournament records">
          {TABS.map(({ key, label, Icon }) => (
            <Link
              key={key}
              href={`/champions/${t.id}?tab=${key}`}
              scroll={false}
              aria-current={key === tab ? "page" : undefined}
              className={key === tab ? "champ-tab is-on" : "champ-tab"}
            >
              <Icon aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>

        {tab === "podium" &&
          (data.official ? (
            <section className="champ-panel" aria-labelledby="podium-h">
              <h2 id="podium-h" className="sr-only">
                Official final positions
              </h2>
              <ol className="champ-podium">
                {data.podium.map((pid, i) => {
                  const p = pid ? byId.get(pid) : null;
                  if (!p) return null;
                  const n = i + 1;
                  return (
                    <li
                      key={n}
                      className={`champ-place champ-place-${n}`}
                      tabIndex={0}
                    >
                      <div className="champ-place-card">
                        {n === 1 && t.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element -- consented champion photo from our own route
                          <img
                            className="champ-place-photo"
                            src={`/api/photo/${t.id}?v=${t.photo}`}
                            alt={`${p.name}, champion`}
                          />
                        ) : (
                          <span
                            className="champ-place-avatar"
                            aria-hidden="true"
                          >
                            {initials(p.name)}
                          </span>
                        )}
                        <span className="champ-place-label">
                          {n === 1 ? (
                            <Trophy aria-hidden="true" />
                          ) : (
                            <Medal aria-hidden="true" />
                          )}
                          {PLACE_LABEL[n]}
                        </span>
                        <strong className="champ-place-name">{p.name}</strong>
                        <span className="champ-code">{p.code}</span>
                        {p.team && (
                          <span className="champ-place-team">{p.team}</span>
                        )}
                        <Link href={statsHref(p)} className="champ-action">
                          View Player Stats
                        </Link>
                      </div>
                      <span
                        className={`champ-step champ-step-${n}`}
                        aria-hidden="true"
                      >
                        {n}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : (
            <section
              className="champ-panel champ-pending"
              aria-labelledby="pending-h"
            >
              <LaurelTrophy tone="muted" className="champ-pending-art" />
              <h2 id="pending-h">Podium Pending</h2>
              <p>
                Official 1st, 2nd and 3rd places will appear after the
                tournament is finalized.
              </p>
              <PodiumSteps />
            </section>
          ))}

        {tab === "players" && (
          <section className="champ-panel" aria-labelledby="players-h">
            <div className="champ-panel-head">
              <div>
                <h2 id="players-h">Tournament Participants</h2>
                <p>All approved competitors in this tournament.</p>
              </div>
              <span className="champ-count">
                {roster.length} {roster.length === 1 ? "player" : "players"}
              </span>
            </div>
            {roster.length ? (
              <div className="champ-roster-wrap">
                <div className="champ-roster-head" aria-hidden="true">
                  <span>#</span>
                  <span />
                  <span>Player (XG ID)</span>
                  <span>Status</span>
                  <span />
                </div>
                <ol className="champ-roster">
                  {roster.map((p, i) => {
                    const l = r.lines[p.id];
                    const status = data.status[p.id];
                    return (
                      <li key={p.id}>
                        <Link href={statsHref(p)} className="champ-roster-row">
                          <span className="champ-roster-n">{i + 1}</span>
                          <span className="champ-avatar" aria-hidden="true">
                            {initials(p.name)}
                          </span>
                          <span className="champ-roster-name">
                            {p.name}{" "}
                            <span className="champ-code">({p.code})</span>
                          </span>
                          <span className="champ-roster-line">
                            {l.played} played · {l.won}W {l.drawn}D {l.lost}L ·
                            GD {signed(l.gd)}
                            {p.team ? ` · ${p.team}` : ""}
                          </span>
                          <span
                            className={`champ-status champ-status-${slug(status)}`}
                          >
                            {status}
                          </span>
                          <span className="champ-roster-go">
                            <span className="champ-roster-go-text">
                              View Player Details
                            </span>
                            <ChevronRight aria-hidden="true" />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : (
              <p className="notice">
                Players appear here once the organizers approve them.
              </p>
            )}
          </section>
        )}

        {tab === "records" && (
          <section className="champ-panel" aria-labelledby="records-h">
            <div className="champ-panel-head">
              <div>
                <h2 id="records-h">Tournament Records</h2>
                <p>
                  {finished
                    ? "Final records, from official results only."
                    : "From official results only — they update as results come in."}
                </p>
              </div>
            </div>
            {r.matches === 0 && (
              <p className="champ-note">
                No official results yet. Records appear after the first scores
                are entered.
              </p>
            )}
            <h3 className="champ-subhead">Featured records</h3>
            <div className="champ-records">
              <RecordCard
                tone="cyan"
                icon={<Target />}
                title="Top Scorer"
                desc="Most goals scored"
                holders={r.topScorer}
                unit="goals"
                href={statsHref}
              />
              <RecordCard
                tone="green"
                icon={<ShieldCheck />}
                title="Best Defence"
                desc="Fewest goals conceded (per match)"
                holders={
                  r.bestDefence && {
                    value: r.bestDefence.perMatch,
                    players: r.bestDefence.players,
                  }
                }
                unit="conceded per match"
                empty={`Insufficient matches (needs ${r.defenceMin}+)`}
                href={statsHref}
              />
              <RecordCard
                tone="orange"
                icon={<Flame />}
                title="Longest Winning Streak"
                desc="Consecutive wins (round order)"
                holders={r.longestStreak}
                unit="wins in a row"
                href={statsHref}
              />
              <article className="champ-record tone-yellow">
                <RecordTop
                  icon={<Zap />}
                  title="Biggest Victory"
                  desc="Largest goal difference in a single match"
                />
                {r.biggestVictory.length ? (
                  <ul className="champ-victories">
                    {r.biggestVictory.map((v) => (
                      <li key={v.fixtureId}>
                        <span className="champ-record-value">
                          {v.winnerGoals}–{v.loserGoals}
                        </span>
                        <span className="block">
                          <Link href={statsHref(v.winner)}>
                            {v.winner.name}
                          </Link>{" "}
                          <span className="champ-code">{v.winner.code}</span>{" "}
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
            <h3 className="champ-subhead">Secondary records</h3>
            <div className="champ-records champ-records-small">
              <RecordCard
                title="Most Wins"
                holders={r.mostWins}
                unit="wins"
                href={statsHref}
              />
              <RecordCard
                title="Most Draws"
                holders={r.mostDraws}
                unit="draws"
                href={statsHref}
              />
              <RecordCard
                title="Highest Goal Difference"
                holders={r.highestGoalDifference}
                unit="goal difference"
                signedValue
                href={statsHref}
              />
            </div>
            <p className="champ-note">
              Best Defence: fewest goals conceded per match among players with
              at least {DEFENCE_MIN_MATCHES} matches and at least half of the
              most active player&apos;s matches. Winning streaks follow the
              official round order, not necessarily the order the matches were
              played (match dates aren&apos;t recorded). Ties list every player.
              Walkovers aren&apos;t recorded separately.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function RecordTop({
  icon,
  title,
  desc,
}: {
  icon?: React.ReactNode;
  title: string;
  desc?: string;
}) {
  return (
    <div className="champ-record-top">
      {icon && (
        <span className="champ-record-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h4>{title}</h4>
        {desc && <p className="champ-record-desc">{desc}</p>}
      </div>
    </div>
  );
}

function RecordCard({
  tone = "violet",
  icon,
  title,
  desc,
  holders,
  unit,
  empty = "Not enough results yet",
  signedValue = false,
  href,
}: {
  tone?: "cyan" | "green" | "orange" | "yellow" | "violet";
  icon?: React.ReactNode;
  title: string;
  desc?: string;
  holders: Holders | null;
  unit: string;
  empty?: string;
  signedValue?: boolean;
  href: (p: Who) => string;
}) {
  return (
    <article className={`champ-record tone-${tone}`}>
      <RecordTop icon={icon} title={title} desc={desc} />
      {holders ? (
        <div className="champ-record-body">
          <p>
            <span className="champ-record-value">
              {signedValue ? signed(holders.value) : holders.value}
            </span>{" "}
            <span className="champ-record-unit">{unit}</span>
          </p>
          <ul className="champ-holders">
            {holders.players.map((p) => (
              <li key={p.id}>
                <Link href={href(p)}>{p.name}</Link>{" "}
                <span className="champ-code">{p.code}</span>
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
        </div>
      ) : (
        <p className="champ-record-empty">{empty}</p>
      )}
    </article>
  );
}
