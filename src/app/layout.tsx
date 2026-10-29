import type { Metadata } from "next";
import "./globals.css";
import RouteMotion from "@/components/RouteMotion";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import { Space_Grotesk, Barlow_Condensed } from "next/font/google";
import Brand from "@/components/Brand";
import { communityLinks } from "@/lib/community";
import { getLiveStream } from "@/lib/youtube";
const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const displayFont = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});
export const metadata: Metadata = {
  metadataBase: new URL("https://xgamer-league-web.vercel.app"),
  title: { default: "X-Gamer Pro League | 2.0", template: "%s | X-Gamer" },
  description:
    "The home of X-Gamer competitive eFootball. Competitions, fixtures, results and standings.",
  openGraph: {
    images: [{ url: "/images/og-xgamer.jpg", width: 1200, height: 630 }],
  },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const live = await getLiveStream();
  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body>
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        <div className="min-h-screen flex flex-col">
          <Navbar liveUrl={live?.url ?? null} />
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
                <Link href="/rules">Rules</Link>
                <Link href="/admin">Organizers</Link>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
