import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Link from "next/link";
export const metadata: Metadata = {
  metadataBase: new URL("https://xgamer-league-web.vercel.app"),
  title: { default: "X-Gamer Pro League | 2.0", template: "%s | X-Gamer" },
  description:
    "The home of X-Gamer competitive eFootball. Competitions, fixtures, results and standings.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        <div className="min-h-screen flex flex-col">
          <Navbar />
          <main id="content" className="flex-grow">
            {children}
          </main>
          <footer className="border-t border-slate-800 py-8">
            <div className="page-shell flex flex-wrap justify-between gap-5 text-sm text-slate-500">
              <p>© 2026 X-Gamer Pro League · Built for the game.</p>
              <div className="flex gap-5">
                <Link href="/rules">Rules</Link>
                <Link href="/status">Feature status</Link>
                <Link href="/admin">Organizers</Link>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
