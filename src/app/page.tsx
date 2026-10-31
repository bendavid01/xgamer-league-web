import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Trophy } from "lucide-react";
import HomeIntro from "@/components/HomeIntro";
import EditorialReveal from "@/components/EditorialReveal";
import { XMark } from "@/components/Brand";
import LiveNow from "@/components/LiveNow";
import TournamentTile from "@/components/TournamentTile";
import { getChampions, listTournaments } from "@/lib/tournaments";
import { getLiveStatus, liveNow } from "@/lib/live";
import { communityLinks } from "@/lib/community";
import { championTitle } from "@/lib/labels";

export const revalidate = 30;

export default async function Home() {
  const [live, list, champions] = await Promise.all([
    getLiveStatus().catch(() => []),
    listTournaments(),
    getChampions(),
  ]);
  // Current champion of each competition (latest season) and each one-off cup.
  const seen = new Set<string>();
  const current = champions
    .filter((c) => {
      const key = c.competition?.toLowerCase() ?? `cup:${c.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
  const running = list?.live ?? [];
  const upcoming = list?.upcoming ?? [];
  return (
    <div className="editorial-home">
      <HomeIntro />
      <LiveNow live={liveNow(live)} />

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
          <ul className="xg-tiles">
            {[...running, ...upcoming].map((t) => (
              <li key={t.id}>
                <TournamentTile
                  t={t}
                  href={`/tournaments?t=${encodeURIComponent(t.id)}`}
                  withActions
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="notice">
            No tournament is running right now. The next one is announced on our
            Discord and here.
          </p>
        )}
      </section>

      {current.length > 0 && (
        <section
          id="champions"
          className="page-shell champions"
          aria-labelledby="champions-title"
        >
          <EditorialReveal>
            <div className="section-index">
              <span>02 / CHAMPIONS</span>
              <span>REIGNING CHAMPIONS</span>
            </div>
            <div className="section-heading">
              <h2 id="champions-title" className="statement">
                Current
                <br />
                <i>champions.</i>
              </h2>
              <Link href="/champions" className="editorial-link">
                Hall of Fame <ArrowUpRight size={20} />
              </Link>
            </div>
          </EditorialReveal>
          <ul className="champion-shelf">
            {current.map((c) => {
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
            <span>03 / HOW IT WORKS</span>
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
          <span>04 / COMMUNITY</span>
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
