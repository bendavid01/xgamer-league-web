import type { Metadata } from "next";
import Link from "next/link";
import TournamentHero from "@/components/TournamentHero";
import {
  AnnouncementList,
  FormatBlock,
  RuleCards,
} from "@/components/TournamentContent";
import { getAnnouncements, getFeaturedTournament } from "@/lib/content";

export const revalidate = 30;

export async function generateMetadata(): Promise<Metadata> {
  const { tournament } = await getFeaturedTournament();
  return {
    title: tournament?.title ?? "Tournament",
    description:
      tournament?.summary ??
      "Format, slots, match rules and announcements for the current XGamer tournament.",
  };
}

export default async function TournamentPage() {
  const [{ tournament, available }, announcements] = await Promise.all([
    getFeaturedTournament(),
    getAnnouncements(10),
  ]);
  if (!tournament)
    return (
      <div className="page-shell py-12 max-w-2xl">
        <h1 className="page-title">Tournament</h1>
        <p className="notice mt-6">
          {available
            ? "The next tournament hasn't been announced yet. Follow the announcements and community channels for news."
            : "Tournament details are temporarily unavailable. Please try again shortly."}
        </p>
        <Link href="/community" className="button-primary mt-6">
          Join the community
        </Link>
      </div>
    );
  return (
    <>
      <TournamentHero tournament={tournament} detailsLink={false} />
      <div className="page-shell py-10 space-y-12">
        <FormatBlock tournament={tournament} />
        <RuleCards cards={tournament.matchRules} />
        <AnnouncementList announcements={announcements} />
      </div>
    </>
  );
}
