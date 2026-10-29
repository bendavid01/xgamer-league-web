import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  CalendarDays,
  ListOrdered,
  Trophy,
  UserPlus,
} from "lucide-react";
import HomeIntro from "@/components/HomeIntro";
import EditorialReveal from "@/components/EditorialReveal";
import { XMark } from "@/components/Brand";
import LiveNow from "@/components/LiveNow";
import { MatchRow } from "@/components/hub/RoundList";
import {
  getChampions,
  getTournament,
  listTournaments,
  STATUS_LABEL,
  type PublicTournament,
} from "@/lib/tournaments";
import { getLiveStream } from "@/lib/youtube";
import { communityLinks } from "@/lib/community";
import { championTitle, FORMAT_LABEL, formatChoice } from "@/lib/labels";

export const revalidate = 30;

export default async function Home() {
  const [live, list, champions] = await Promise.all([
    getLiveStream(),
    listTournaments(),
    getChampions(),
  ]);
  const running = list?.live ?? [];
  const upcoming = list?.upcoming ?? [];
  // The league being played now: its whole current round goes on the homepage.
  const league = running.find((t) => t.status === "league");
  const data = league ? await getTournament(league.id) : null;
  const open = data?.fixtures.filter((f) => f.home_score === null) ?? [];
  const round = open.length ? Math.min(...open.map((f) => f.round)) : null;
  const roundMatches = data?.fixtures.filter((f) => f.round === round) ?? [];
  const who = (id: string) => {
    const p = data?.players.find((x) => x.id === id);
    return { name: p?.name ?? "Player", code: p?.code ?? "" };
  };
  const register = running.find((t) => t.status === "open");

  return (
    <div className="editorial-home">
      <HomeIntro />
      {live && <LiveNow stream={live} />}

      <nav className="quick-nav page-shell" aria-label="Quick links">
        <Link href="/tournaments?tab=fixtures" className="quick-link">
          <CalendarDays aria-hidden="true" /> Fixtures
        </Link>
        <Link href="/tournaments?tab=standings" className="quick-link">
          <ListOrdered aria-hidden="true" /> Standings
        </Link>
        <Link href="/tournaments?tab=results" className="quick-link">
          <Trophy aria-hidden="true" /> Results
        </Link>
        <Link
          href={register ? `/register?t=${register.id}` : "/register"}
          className="quick-link quick-link-hot"
        >
          <UserPlus aria-hidden="true" /> Register
        </Link>
      </nav>

      <section
        id="whats-on"
        className="page-shell whats-on"
        aria-labelledby="whats-on-title"
      >
        <div className="section-index">
          <span>01 / WHAT’S ON</span>
          <span>ACTIVE &amp; UPCOMING</span>
        </div>
        <h2 id="whats-on-title" className="sr-only">
          Active and upcoming tournaments
        </h2>
        {running.length + upcoming.length ? (
          <ul className="on-box">
            {[...running, ...upcoming].slice(0, 6).map((t) => (
              <OnRow key={t.id} t={t} />
            ))}
          </ul>
        ) : (
          <p className="notice">
            No tournament is running right now. The next one is announced on our
            Discord and here.
          </p>
        )}
      </section>

      {league && round !== null && (
        <section className="arena-section">
          <div className="page-shell">
            <EditorialReveal>
              <div className="section-index">
                <span>02 / THIS ROUND</span>
                <span>{league.label.toUpperCase()}</span>
              </div>
              <div className="section-heading">
                <h2>
                  Round {round}
                  <br />
                  <i>
                    {roundMatches.filter((f) => f.home_score !== null).length}{" "}
                    of {roundMatches.length} played.
                  </i>
                </h2>
                <Link
                  href={`/tournaments?t=${league.id}&tab=fixtures`}
                  className="editorial-link"
                >
                  All fixtures <ArrowUpRight size={20} />
                </Link>
              </div>
            </EditorialReveal>
            <ul className="hub-round home-round">
              {roundMatches.map((f) => (
                <MatchRow
                  key={f.id}
                  m={{
                    id: f.id,
                    home: who(f.home),
                    away: who(f.away),
                    homeScore: f.home_score,
                    awayScore: f.away_score,
                  }}
                />
              ))}
            </ul>
          </div>
        </section>
      )}

      {champions.length > 0 && (
        <section
          id="champions"
          className="page-shell champions"
          aria-labelledby="champions-title"
        >
          <EditorialReveal>
            <div className="section-index">
              <span>03 / CHAMPIONS</span>
              <span>THE ROLL OF HONOUR</span>
            </div>
            <h2 id="champions-title" className="statement">
              Champions.
            </h2>
          </EditorialReveal>
          <ul className="champion-shelf">
            {champions.map((c) => {
              const winner = c.places.find((p) => p.place === 1)!;
              const runnerUp = c.places.find((p) => p.place === 2);
              return (
                <li key={c.id} className="champion-card">
                  <div className="champion-photo">
                    {c.photo ? (
                      <Image
                        src={`/api/photo/${c.id}?v=${c.photo}`}
                        alt={`${winner.name}, ${championTitle(c)}`}
                        fill
                        sizes="(max-width: 640px) 90vw, 320px"
                        unoptimized
                      />
                    ) : (
                      <span className="champion-initials" aria-hidden="true">
                        {winner.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <Trophy className="champion-cup" aria-hidden="true" />
                  </div>
                  <div className="champion-body">
                    <span className="champion-title">{championTitle(c)}</span>
                    <Link
                      href={`/players/${winner.code}`}
                      className="champion-name"
                    >
                      {winner.name}
                    </Link>
                    {winner.team && (
                      <span className="text-sm text-slate-400">
                        {winner.team}
                      </span>
                    )}
                    <Link
                      href={`/tournaments?t=${c.id}&tab=standings`}
                      className="champion-tournament"
                    >
                      {c.competition ?? c.name}
                    </Link>
                    {runnerUp && (
                      <span className="text-xs text-slate-500">
                        Runner-up: {runnerUp.name}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="page-shell journey-section">
        <EditorialReveal>
          <div className="section-index">
            <span>04 / HOW IT WORKS</span>
            <span>FROM SIGN-UP TO KICK-OFF</span>
          </div>
        </EditorialReveal>
        <div className="journey-rows">
          {[
            [
              "01",
              "Register",
              "Name, team and WhatsApp number. Registration opens per tournament.",
              "/register",
            ],
            [
              "02",
              "Get confirmed",
              "Organizers verify you on WhatsApp, then you appear in the players list.",
              "/rules",
            ],
            [
              "03",
              "Play your fixtures",
              "Rounds, results and the live table — updated as scores come in.",
              "/tournaments",
            ],
          ].map(([n, title, copy, href]) => (
            <Link href={href} key={n} className="journey-row">
              <span>{n}</span>
              <div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
              <ArrowUpRight />
            </Link>
          ))}
        </div>
      </section>

      <section className="community-finale page-shell">
        <div className="section-index">
          <span>05 / COMMUNITY</span>
          <span>DISCORD · WHATSAPP · YOUTUBE</span>
        </div>
        <EditorialReveal>
          <h2>
            Match-day chat,
            <br />
            <i>announcements, streams.</i>
          </h2>
        </EditorialReveal>
        <div className="finale-bottom">
          <p>
            Fixtures are arranged and announcements posted on our Discord.
            <br />
            Big matches stream live on YouTube.
          </p>
          <a
            href={communityLinks[0].href}
            target="_blank"
            rel="noopener noreferrer"
            className="button-primary"
          >
            Join our Discord <ArrowUpRight size={18} />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <Link href="/community" className="editorial-link">
            All channels <ArrowUpRight size={20} />
          </Link>
        </div>
        <XMark className="finale-mark" />
      </section>
    </div>
  );
}

function OnRow({ t }: { t: PublicTournament }) {
  const cta =
    t.status === "open"
      ? { label: "Register", href: `/register?t=${t.id}`, hot: true }
      : t.status === "draft"
        ? { label: "Details", href: `/tournaments?t=${t.id}`, hot: false }
        : { label: "Follow", href: `/tournaments?t=${t.id}`, hot: false };
  return (
    <li className="on-row">
      <span className={`status-pill status-${t.status}`}>
        {STATUS_LABEL[t.status]}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate">{t.label}</strong>
        <span className="text-sm text-slate-400">
          {FORMAT_LABEL[formatChoice(t)]}
          {t.starts_on
            ? ` · ${new Date(t.starts_on).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
            : ""}
        </span>
      </span>
      <Link
        href={cta.href}
        className={
          cta.hot ? "button-primary om-small" : "button-secondary om-small"
        }
      >
        {cta.label} <ArrowUpRight size={14} />
      </Link>
    </li>
  );
}
