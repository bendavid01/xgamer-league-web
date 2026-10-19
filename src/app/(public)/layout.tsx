import type { Metadata } from "next";
import RouteMotion from "@/components/RouteMotion";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import Brand from "@/components/Brand";
import { communityLinks } from "@/lib/community";
export const metadata: Metadata = {
  title: { default: "XGamer 2.0", template: "%s | XGamer" },
  description:
    "Join the XGamer eFootball community. Register and follow league announcements.",
};
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <div className="min-h-screen flex flex-col">
        <Navbar />
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
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
