"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ArrowUpRight } from "lucide-react";
const items = [
  ["Competitions", "/competitions"],
  ["Matches", "/matches"],
  ["Standings", "/table"],
  ["Players", "/players"],
  ["Community", "/community"],
];
export default function Navbar() {
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
      className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95"
    >
      <div className="page-shell flex min-h-20 items-center justify-between gap-5">
        <Link
          href="/"
          aria-label="X-Gamer home"
          className="text-xl font-black italic tracking-tighter whitespace-nowrap"
        >
          X-<span className="text-cyan-300">GAMER</span>
          <span className="text-[10px] align-top ml-2 text-slate-500 not-italic">
            2.0
          </span>
        </Link>
        <div className="hidden lg:flex gap-6">
          {items.map(([name, href]) => (
            <Link
              aria-current={pathname === href ? "page" : undefined}
              className={
                pathname === href
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
          className="lg:hidden p-3"
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
              {[
                ...items,
                ["Join the arena", "/register"],
                ["Rules", "/rules"],
              ].map(([name, href]) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={pathname === href ? "page" : undefined}
                  className="p-3 rounded-lg hover:bg-slate-900"
                >
                  {name}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
