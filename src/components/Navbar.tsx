"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ArrowUpRight } from "lucide-react";
import Brand from "@/components/Brand";
const items = [
  ["Tournaments", "/tournaments"],
  ["Champions", "/#champions"],
  ["Community", "/community"],
  ["Rules", "/rules"],
];
/** Player profiles live under Tournaments. */
const isCurrent = (pathname: string, href: string) =>
  href === "/tournaments"
    ? pathname === href || pathname.startsWith("/players")
    : pathname === href;
export default function Navbar({
  liveUrl = null,
}: {
  liveUrl?: string | null;
}) {
  const toggle = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <nav
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
      aria-label="Main navigation"
      className={`sticky top-0 z-50 border-b border-slate-800 ${open ? "bg-[#0b1118]" : "bg-slate-950/95"}`}
    >
      <div className="page-shell flex min-h-20 items-center justify-between gap-5">
        <Link
          href="/"
          aria-label="X-Gamer home"
          className="text-xl font-black italic tracking-tighter whitespace-nowrap"
        >
          <Brand />
        </Link>
        <div className="hidden lg:flex gap-6">
          {items.map(([name, href]) => (
            <Link
              aria-current={isCurrent(pathname, href) ? "page" : undefined}
              className={
                isCurrent(pathname, href)
                  ? "text-cyan-300 text-sm"
                  : "text-slate-400 text-sm hover:text-white"
              }
              key={href}
              href={href}
            >
              {name}
            </Link>
          ))}
        </div>
        {liveUrl && (
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="nav-live ml-auto lg:ml-0"
          >
            <span className="live-dot" aria-hidden="true" /> LIVE
            <span className="sr-only"> on YouTube (opens in a new tab)</span>
          </a>
        )}
        <Link
          href="/register"
          className="button-primary hidden lg:inline-flex text-sm"
        >
          Join the arena <ArrowUpRight size={16} />
        </Link>
        <button
          ref={toggle}
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen(!open)}
          className="lg:hidden p-3 min-h-11 min-w-11"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.22 }}
            id="mobile-nav"
            className="lg:hidden overflow-hidden"
          >
            <div className="page-shell pb-5 flex flex-col gap-1">
              {[...items, ["Join the arena", "/register"]].map(
                ([name, href]) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    aria-current={
                      isCurrent(pathname, href) ? "page" : undefined
                    }
                    className="p-3 rounded-lg hover:bg-slate-900"
                  >
                    {name}
                  </Link>
                ),
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
