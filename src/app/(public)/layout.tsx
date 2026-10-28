import type { Metadata } from "next";
import RouteMotion from "@/components/RouteMotion";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import Brand from "@/components/Brand";
import { communityLinks } from "@/lib/community";
import { getFeaturedTournament } from "@/lib/content";
export const metadata: Metadata = {
  metadataBase: new URL("https://xgamer-league-web.vercel.app"),
  title: {
    default: "X-Gamer Pro League | eFootball Mobile",
    template: "%s | XGamer",
  },
  description:
    "X-Gamer Pro League: eFootball Mobile tournaments, format, rules, fixtures and standings.",
};
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tournament } = await getFeaturedTournament();
  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <div className="min-h-screen flex flex-col">
        <Navbar registrationOpen={tournament?.status === "registration_open"} />
        <main id="content" className="flex-grow">
          <RouteMotion>{children}</RouteMotion>
        </main>
        <footer className="border-t border-slate-800 py-8">
          <div className="page-shell mb-8 flex flex-wrap justify-between gap-8">
            <Link href="/" aria-label="XGamer home">
              <Brand />
            </Link>
            <div
              className="flex flex-wrap gap-x-5 gap-y-3 max-w-xl"
              aria-label="Official social channels"
            >
              {communityLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-social"
                >
                  {link.name}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ))}
            </div>
          </div>
          <div className="page-shell flex flex-wrap justify-between gap-5 text-sm text-slate-500">
            <p>© 2026 X-Gamer Pro League · Built for the game.</p>
            <div className="flex gap-5">
              <Link href="/tournament">Tournament</Link>
              <Link href="/rules">Rules</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
