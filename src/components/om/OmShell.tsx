"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  ScrollText,
  Search,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { tournamentLabel } from "@/lib/labels";
import { SECTION_LABEL } from "./labels";
import OmDrawer from "./OmDrawer";
import OmQuickJump, { type JumpItem } from "./OmQuickJump";
import type { Section } from "./types";
import type { Om } from "./useOm";
import s from "./om.module.css";

const ICON: Record<Section, LucideIcon> = {
  overview: LayoutDashboard,
  tournaments: Trophy,
  players: Users,
  audit: ScrollText,
  health: Activity,
  access: KeyRound,
};

/** Which sections this organizer can open (same rules as the original OM tabs). */
export function visibleSections(user: Om["user"]): Section[] {
  if (!user) return [];
  const admin = user.role === "admin";
  return [
    "overview",
    "tournaments",
    ...(admin || user.operations.includes("registrations")
      ? (["players"] as const)
      : []),
    ...(admin ? (["audit", "health"] as const) : []),
  ];
}

export default function OmShell({
  om,
  section,
  pending,
  jump,
  setJump,
  jumpItems,
  jumpLoading,
  signOutAction,
  children,
}: {
  om: Om;
  /** Server action from /admin that calls the existing Auth.js signOut. */
  signOutAction: () => Promise<void>;
  /** The section being shown (already checked against this organizer's access). */
  section: Section;
  /** Entries awaiting a decision across tournaments (Overview badge). */
  pending?: number;
  jump: boolean;
  setJump: (open: boolean) => void;
  jumpItems: JumpItem[];
  jumpLoading: boolean;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const { user, work, open } = om;
  const admin = user?.role === "admin";
  const sections = visibleSections(user);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setJump(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setJump]);

  const goSection = (sec: Section) => {
    setMenu(false);
    void om.go(sec);
  };

  const nav = (
    <nav aria-label="Organizer workspace" className={s.nav}>
      <ul>
        {sections.map((sec) => {
          const Icon = ICON[sec];
          return (
            <li key={sec}>
              <button
                type="button"
                className={s.navItem}
                aria-current={section === sec ? "page" : undefined}
                onClick={() => goSection(sec)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{SECTION_LABEL[sec]}</span>
                {sec === "overview" && !!pending && (
                  <span
                    className={s.navBadge}
                    aria-label={`${pending} pending`}
                  >
                    {pending}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {admin && (
        <div className={s.navFoot}>
          <p className={s.navFootLabel}>Admin</p>
          <button
            type="button"
            className={s.navItem}
            aria-current={section === "access" ? "page" : undefined}
            onClick={() => goSection("access")}
          >
            <KeyRound size={18} aria-hidden="true" />
            <span>{SECTION_LABEL.access}</span>
          </button>
        </div>
      )}
      <Link href="/" className={s.publicLink} onClick={() => setMenu(false)}>
        <span>Public site</span>
        <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
    </nav>
  );

  const brand = (
    <div className={s.brand}>
      <span className={s.brandMark} aria-hidden="true">
        XG
      </span>
      <span>
        <strong>Organizer Manager</strong>
        <span className={s.brandSub}>XGamer Pro League</span>
      </span>
    </div>
  );

  return (
    <div className={`om ${s.ws} ${s.frame} ${user ? "" : s.solo}`}>
      {user && (
        <aside className={s.sidebar} aria-label="Workspace sections">
          {brand}
          {nav}
        </aside>
      )}
      <div className={s.main}>
        <header className={s.topbar}>
          {user && (
            <button
              type="button"
              className={`${s.iconBtn} ${s.menuBtn}`}
              aria-label="Open sections menu"
              aria-expanded={menu}
              onClick={() => setMenu(true)}
            >
              <Menu size={20} aria-hidden="true" />
            </button>
          )}
          <nav aria-label="Breadcrumb" className={s.crumbs}>
            <ol>
              <li>
                {user && section !== "overview" ? (
                  <button type="button" onClick={() => void om.go("overview")}>
                    Workspace
                  </button>
                ) : (
                  <span>Workspace</span>
                )}
              </li>
              <li>
                {section === "tournaments" && open ? (
                  <button type="button" onClick={() => void om.navigate(null)}>
                    {SECTION_LABEL.tournaments}
                  </button>
                ) : (
                  <span aria-current="page">{SECTION_LABEL[section]}</span>
                )}
              </li>
              {section === "tournaments" && open && (
                <li>
                  <span aria-current="page">
                    {work ? tournamentLabel(work.tournament) : "…"}
                  </span>
                </li>
              )}
            </ol>
          </nav>
          {user && (
            <div className={s.topActions}>
              <button
                type="button"
                className={s.searchBtn}
                onClick={() => setJump(true)}
                aria-keyshortcuts="Control+K"
              >
                <Search size={16} aria-hidden="true" />
                <span className={s.searchText}>Search</span>
                <kbd className={s.kbd}>Ctrl K</kbd>
              </button>
              <button
                type="button"
                className={s.iconBtn}
                onClick={() => void om.refresh()}
                disabled={om.busy}
                aria-label="Refresh"
                title="Refresh"
              >
                <RefreshCw size={17} aria-hidden="true" />
              </button>
              <div className={s.session}>
                <span className={s.sessionText}>
                  <span className={s.sessionName}>
                    {user.name ?? "Organizer"}
                  </span>
                  <span className={s.sessionRole}>
                    {admin ? "Main admin" : "Coordinator"}
                  </span>
                </span>
                <form action={signOutAction}>
                  <button
                    className={s.iconBtn}
                    aria-label="Sign out"
                    title="Sign out"
                  >
                    <LogOut size={17} aria-hidden="true" />
                  </button>
                </form>
              </div>
            </div>
          )}
        </header>

        <div className={s.content}>
          {!user && !om.error && <p className="notice">Loading…</p>}
          {om.error && (
            <div role="alert" className="notice text-amber-200 mb-6">
              {om.error}
              {!user && (
                <Link
                  className="button-secondary mt-4 flex w-fit"
                  href="/login"
                >
                  Sign in with Discord
                </Link>
              )}
            </div>
          )}
          {om.notice && (
            <p role="status" className="notice text-cyan-200 mb-6">
              {om.notice}
            </p>
          )}
          <fieldset disabled={om.busy} className="min-w-0 disabled:opacity-70">
            {user && children}
          </fieldset>
        </div>
      </div>

      <OmDrawer
        open={menu}
        onClose={() => setMenu(false)}
        side="left"
        title={brand}
      >
        {nav}
      </OmDrawer>
      <OmQuickJump
        open={jump}
        onClose={() => setJump(false)}
        items={jumpItems}
        loading={jumpLoading}
      />
    </div>
  );
}
