import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import TournamentHero from "@/components/TournamentHero";
import {
  AnnouncementList,
  FormatBlock,
  RuleCards,
} from "@/components/TournamentContent";
import { getAnnouncements, getFeaturedTournament } from "@/lib/content";
import { communityLinks } from "@/lib/community";

export const revalidate = 30;

const league = [
  ["Fixtures & results", "/matches", "Every published match and score."],
  ["Standings", "/table", "Points, goal difference and the race to qualify."],
  ["Players", "/players", "League records and match history."],
] as const;

export default async function Home() {
  const [{ tournament }, announcements] = await Promise.all([
    getFeaturedTournament(),
    getAnnouncements(5),
  ]);
  const [discord, whatsapp] = communityLinks;
  return (
    <>
      <TournamentHero tournament={tournament} />
      <div className="page-shell py-10 space-y-12">
        {tournament && <FormatBlock tournament={tournament} />}
        {tournament && <RuleCards cards={tournament.matchRules} />}
        <AnnouncementList announcements={announcements} />

        <section aria-labelledby="league-title">
          <h2 id="league-title" className="text-2xl sm:text-3xl font-bold mb-4">
            League
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {league.map(([title, href, text]) => (
              <Link key={href} href={href} className="panel route-card p-5">
                <span className="flex justify-between gap-3 font-bold text-lg">
                  {title}
                  <ArrowUpRight
                    className="text-cyan-300 shrink-0"
                    size={20}
                    aria-hidden="true"
                  />
                </span>
                <span className="block mt-2 text-sm text-slate-400">
                  {text}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="community-title" className="panel p-5 sm:p-7">
          <h2 id="community-title" className="text-2xl font-bold">
            Join the community
          </h2>
          <p className="text-slate-400 mt-2">
            Match arrangements and organizer updates happen here.
          </p>
          <div className="mt-5 grid gap-3 sm:flex">
            {[discord, whatsapp].map((c) => (
              <a
                key={c.name}
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
                className="button-secondary"
              >
                {c.name} <ArrowUpRight size={16} aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ))}
            <Link href="/community" className="button-secondary">
              All channels
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
