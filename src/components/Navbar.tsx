"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ArrowUpRight } from "lucide-react";
import Brand from "@/components/Brand";
import { communityLinks } from "@/lib/community";

type NavLink = { name: string; href: string; external?: boolean };

const desktop: NavLink[] = [
  { name: "Tournament", href: "/tournament" },
  { name: "Fixtures", href: "/matches" },
  { name: "Standings", href: "/table" },
  { name: "Players", href: "/players" },
  { name: "Rules", href: "/rules" },
  { name: "Community", href: "/community" },
];

function groups(
  registrationOpen: boolean,
): { title: string; links: NavLink[] }[] {
  return [
    {
      title: "Tournament",
      links: [
        ...(registrationOpen ? [{ name: "Register", href: "/register" }] : []),
        { name: "Tournament details", href: "/tournament" },
        { name: "Rules", href: "/rules" },
        { name: "Announcements", href: "/#announcements" },
      ],
    },
    {
      title: "League",
      links: [
        { name: "Fixtures & results", href: "/matches" },
        { name: "Standings", href: "/table" },
        { name: "Players", href: "/players" },
      ],
    },
    {
      title: "Community",
      links: [
        { name: "Discord", href: communityLinks[0].href, external: true },
        { name: "WhatsApp", href: communityLinks[1].href, external: true },
        { name: "All channels", href: "/community" },
      ],
    },
  ];
}

export default function Navbar({
  registrationOpen,
}: {
  registrationOpen: boolean;
}) {
  const toggle = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  // WHY: the drawer belongs to the page it was opened on, so any navigation
  // (links, back button) closes it without an extra effect.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (value: boolean) => setOpenedOn(value ? pathname : null);

  // Lock page scroll, trap focus and support Escape while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = drawer.current;
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        ) ?? [],
      );
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenedOn(null);
        toggle.current?.focus();
      } else if (e.key === "Tab") {
        const items = focusables();
        if (!items.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = (href: string) => (pathname === href ? "page" : undefined);
  const cta = registrationOpen
    ? { name: "Register now", href: "/register" }
    : { name: "Tournament", href: "/tournament" };

  return (
    <nav
      aria-label="Main navigation"
      className="sticky top-0 z-40 border-b border-slate-800 bg-[#080d12]"
    >
      <div className="page-shell flex min-h-16 items-center justify-between gap-5">
        <Link href="/" aria-label="X-Gamer home" className="whitespace-nowrap">
          <Brand />
        </Link>
        <div className="hidden lg:flex gap-6">
          {desktop.map(({ name, href }) => (
            <Link
              key={href}
              href={href}
              aria-current={current(href)}
              className={
                pathname === href
                  ? "text-cyan-300 text-sm"
                  : "text-slate-400 text-sm hover:text-white"
              }
            >
              {name}
            </Link>
          ))}
        </div>
        {registrationOpen && (
          <Link
            href="/register"
            className="button-primary hidden lg:inline-flex text-sm"
          >
            Register now <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        )}
        <button
          ref={toggle}
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen(true)}
          className="lg:hidden touch-target"
        >
          <Menu aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div
          id="mobile-nav"
          ref={drawer}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="mobile-drawer lg:hidden"
        >
          <div className="flex min-h-16 items-center justify-between border-b border-slate-800 px-5">
            <Brand />
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => {
                setOpen(false);
                toggle.current?.focus();
              }}
              className="touch-target"
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-6 space-y-7">
            {groups(registrationOpen).map((group) => (
              <section key={group.title} aria-label={group.title}>
                <p className="drawer-heading">{group.title}</p>
                <ul className="mt-2">
                  {group.links.map(({ name, href, external }) => (
                    <li key={name}>
                      {external ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="drawer-link"
                        >
                          {name}
                          <ArrowUpRight size={16} aria-hidden="true" />
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      ) : (
                        <Link
                          href={href}
                          aria-current={current(href)}
                          className="drawer-link"
                          onClick={() => setOpen(false)}
                        >
                          {name}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="border-t border-slate-800 p-5">
            <Link
              href={cta.href}
              className="button-primary w-full"
              onClick={() => setOpen(false)}
            >
              {cta.name} <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
