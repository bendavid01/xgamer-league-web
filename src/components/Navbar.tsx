"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ArrowUpRight } from "lucide-react";
import Brand from "@/components/Brand";
const items = [
  ["Tournaments", "/tournaments"],
  ["Champions", "/champions"],
  ["Community", "/community"],
  ["Rules", "/rules"],
];
/** Private workspaces (Organizer Manager, player hub) have their own chrome. */
export const isWorkspace = (pathname: string) =>
  ["/admin", "/dashboard"].some((w) => pathname === w || pathname.startsWith(w + "/"));
/** Player profiles live under Tournaments. */
const isCurrent = (pathname: string, href: string) =>
  href === "/tournaments"
    ? pathname === href || pathname.startsWith("/players")
    : pathname === href;
export default function Navbar({
  livePlatforms = [],
}: {
  /** Official channels confirmed live right now (e.g. ["YouTube", "Kick"]). */
  livePlatforms?: string[];
}) {
  const toggle = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const sentinel = useRef<HTMLSpanElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const hidden = isWorkspace(pathname);
  // Re-attach after leaving /admin: the sentinel only exists while the navbar renders.
  useEffect(() => {
    if (hidden || !sentinel.current || !("IntersectionObserver" in window))
      return;
    const observer = new IntersectionObserver(([entry]) =>
      setScrolled(!entry.isIntersecting),
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hidden]);
  if (hidden) return null;
  return (
    <>
      <span ref={sentinel} className="nav-sentinel" aria-hidden="true" />
      <nav
        data-scrolled={scrolled}
        data-open={open}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            toggle.current?.focus();
          }
        }}
        aria-label="Main navigation"
        className="broadcast-nav sticky z-50"
      >
        <div className="page-shell flex min-h-20 items-center justify-between gap-2 sm:gap-5">
          <Link
            href="/"
            aria-label="X-Gamer home"
            className="text-xl font-black italic tracking-tighter whitespace-nowrap"
          >
            <Brand navbar />
          </Link>
          <div className="hidden lg:flex gap-1">
            {items.map(([name, href]) => (
              <Link
                aria-current={isCurrent(pathname, href) ? "page" : undefined}
                className="nav-item"
                key={href}
                href={href}
              >
                {name}
                {isCurrent(pathname, href) && (
                  <motion.span
                    aria-hidden="true"
                    className="nav-active"
                    layoutId="nav-active"
                    transition={{ duration: reduced ? 0 : 0.18 }}
                  />
                )}
              </Link>
            ))}
          </div>
          {livePlatforms.length > 0 && (
            <Link href="/live" className="nav-live ml-auto lg:ml-0">
              <span className="live-dot" aria-hidden="true" /> LIVE
              <span className="sr-only">
                {" "}
                now on {livePlatforms.join(" and ")} — watch XGamer live
              </span>
            </Link>
          )}
          <Link
            href="/register"
            className="button-primary hidden lg:inline-flex text-sm"
          >
            Register now <ArrowUpRight size={16} />
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
              initial={{ y: -6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -6, opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.22 }}
              id="mobile-nav"
              className="lg:hidden overflow-hidden"
            >
              <div className="page-shell pb-5 flex flex-col gap-1">
                {[...items, ["Register now", "/register"]].map(
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
    </>
  );
}
