import Link from "next/link";
import type { Metadata } from "next";
import CommunityChannels from "@/components/CommunityChannels";
import { XMark } from "@/components/Brand";
import { communityLinks } from "@/lib/community";
export const metadata: Metadata = {
  title: "Community",
  description:
    "All eight official XGamer channels. Find your rivals, follow the league and explore the draft competition guide.",
};
export default function Community() {
  return (
    <div className="page-shell py-10 md:py-16">
      <section className="hub-hero">
        <div className="relative z-10 max-w-2xl">
          <p className="eyebrow">THE COMMUNITY / YOUR HOME GROUND</p>
          <h1 className="hero-title">
            RIVALS IN GAME.
            <br />
            <span className="text-cyan-300">FAMILY OUTSIDE.</span>
          </h1>
          <p className="text-slate-300 text-lg leading-relaxed mt-6 max-w-lg">
            The final whistle is just the beginning. Meet your next opponent,
            find your people, and be part of what comes next.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <a
              className="button-primary"
              href={communityLinks[0].href}
              target="_blank"
              rel="noopener noreferrer"
            >
              Join Discord ↗
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <Link className="button-secondary" href="/rules">
              Read the competition guide →
            </Link>
          </div>
        </div>
        <XMark className="hub-emblem" />
        <div className="hub-coordinate" aria-hidden="true">
          XG / COMMUNITY NETWORK / 08 CHANNELS
        </div>
      </section>
      <CommunityChannels />
      <section className="community-guide panel mt-10 p-6 md:p-9 flex flex-wrap justify-between items-center gap-6">
        <div className="max-w-xl">
          <p className="eyebrow">BEFORE YOUR FIRST KICKOFF</p>
          <h2 className="text-2xl font-bold mb-3">
            Great competition starts with respect.
          </h2>
          <p className="text-slate-400 leading-relaxed">
            Explore the standings guide and proposed community rules. Draft
            rules are pending admin approval; confirm your match settings with
            an organizer.
          </p>
        </div>
        <Link className="button-secondary" href="/rules">
          Explore the rules →
        </Link>
      </section>
      <p className="text-xs text-slate-400 mt-6">
        External channels open in a new tab. Group access and stream schedules
        are managed on each platform. Joining a channel does not register you
        for a competition.
      </p>
    </div>
  );
}
