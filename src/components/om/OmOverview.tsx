"use client";
import type { ReactNode } from "react";
import {
  Activity,
  CalendarClock,
  ChevronRight,
  Inbox,
  MessageCircle,
  PenLine,
  Plus,
  ScrollText,
  Search,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { tournamentLabel } from "@/lib/labels";
import { PHASE, formatLabel } from "./labels";
import type { Queues } from "./queues";
import { pendingIn, unplayedIn, type Snapshots } from "./snapshots";
import type { Home, TournamentTab } from "./types";
import { PageHead } from "./ui";
import s from "./om.module.css";

/** One headline number. The whole card is the button to the place that acts on it. */
function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint: ReactNode;
  tone?: "warn";
  onClick: () => void;
}) {
  return (
    <button type="button" className={s.kpi} data-tone={tone} onClick={onClick}>
      <span className={s.kpiLabel}>
        <span className={s.kpiIcon} aria-hidden="true">
          <Icon size={15} />
        </span>
        {label}
      </span>
      <span className={s.kpiValue}>{value}</span>
      <span className={s.kpiHint}>{hint}</span>
    </button>
  );
}

export default function OmOverview({
  home,
  snaps,
  queues,
  openTournament,
  goPlayers,
  goAudit,
  goHealth,
  newTournament,
  openSearch,
}: {
  home: Home;
  snaps: Snapshots;
  queues: Queues;
  openTournament: (id: string | null, tab?: TournamentTab) => void;
  goPlayers: (tab?: "teams" | "contacts") => void;
  goAudit: () => void;
  goHealth: () => void;
  newTournament: () => void;
  openSearch: () => void;
}) {
  const admin = home.user.role === "admin";
  const active = home.tournaments.filter((t) => t.status !== "completed");
  const ready = !snaps.loading;
  const pending = [...snaps.data.values()].reduce(
    (n, w) => n + pendingIn(w),
    0,
  );
  const leagues = active
    .map((t) => ({ t, w: snaps.data.get(t.id) }))
    .filter(({ t, w }) => t.status === "league" && w && unplayedIn(w).length);
  const unplayed = leagues.reduce((n, { w }) => n + unplayedIn(w!).length, 0);
  const firstPending = active.find((t) => {
    const w = snaps.data.get(t.id);
    return w && pendingIn(w) > 0;
  });
  const value = (n: number | null | undefined) =>
    !ready || n === null || n === undefined ? "—" : n;

  return (
    <>
      <PageHead
        title="Overview"
        sub="What needs an organizer right now, across every tournament."
      />

      <div className={s.kpiWrap}>
        <div className={s.kpis} data-n={admin ? 5 : 3}>
          <Kpi
            icon={Inbox}
            label="Pending decisions"
            value={value(pending)}
            hint="Registrations, new and returning players"
            tone={pending ? "warn" : undefined}
            onClick={() =>
              firstPending
                ? openTournament(firstPending.id, "entries")
                : openTournament(null)
            }
          />
          <Kpi
            icon={Trophy}
            label="Active tournaments"
            value={active.length}
            hint={`${home.tournaments.length - active.length} completed`}
            onClick={() => openTournament(null)}
          />
          <Kpi
            icon={CalendarClock}
            label="Unplayed fixtures"
            value={value(unplayed)}
            hint="League matches without a score"
            onClick={() =>
              leagues[0]
                ? openTournament(leagues[0].t.id, "fixtures")
                : openTournament(null)
            }
          />
          {admin && (
            <Kpi
              icon={MessageCircle}
              label="WhatsApp changes"
              value={queues.contacts ? queues.contacts.open : "—"}
              hint={
                queues.contacts?.forMe
                  ? `${queues.contacts.forMe} waiting for you as second admin`
                  : "Open number changes"
              }
              tone={queues.contacts?.forMe ? "warn" : undefined}
              onClick={() => goPlayers("contacts")}
            />
          )}
          {admin && (
            <Kpi
              icon={PenLine}
              label="Team names to review"
              value={queues.teams ?? "—"}
              hint="Entries with no tournament team"
              onClick={() => goPlayers("teams")}
            />
          )}
        </div>
      </div>
      {snaps.failed.length > 0 && (
        <p className="notice text-amber-200 mt-4">
          {snaps.failed.length} tournament
          {snaps.failed.length === 1 ? "" : "s"} could not be read, so the
          counts may be incomplete. Press Refresh to try again.
        </p>
      )}

      <div className={s.overviewGrid}>
        <section className="panel" aria-labelledby="ov-active">
          <div className={s.panelHead}>
            <h2 id="ov-active">Active tournaments</h2>
            <span className={s.panelHint}>{active.length} running</span>
          </div>
          {active.length ? (
            <ul className={s.rowList}>
              {active.map((t) => {
                const w = snaps.data.get(t.id);
                const p = w ? pendingIn(w) : 0;
                const u = w ? unplayedIn(w).length : 0;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={`${s.row} ${s.ovRow}`}
                      onClick={() => openTournament(t.id)}
                    >
                      <span className="min-w-0">
                        <strong className={s.rowTitle}>
                          {tournamentLabel(t)}
                        </strong>
                        <span className={s.rowSub}>{formatLabel(t)}</span>
                      </span>
                      <span className={s.rowMeta}>
                        {p > 0 && (
                          <span className={s.badge} data-tone="warn">
                            {p} pending
                          </span>
                        )}
                        {u > 0 && <span className={s.badge}>{u} unplayed</span>}
                        {!t.published && (
                          <span className="status-pill om-hidden">
                            Not on website
                          </span>
                        )}
                        <span className={`status-pill status-${t.status}`}>
                          {PHASE[t.status]}
                        </span>
                        <ChevronRight
                          size={16}
                          aria-hidden="true"
                          className={s.rowChevron}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={s.empty}>
              No active tournaments.
              {admin && " Create one from Quick actions."}
            </p>
          )}
        </section>

        <section className="panel" aria-labelledby="ov-actions">
          <div className={s.panelHead}>
            <h2 id="ov-actions">Quick actions</h2>
          </div>
          <div className={s.actionList}>
            {admin && (
              <button
                type="button"
                className="button-primary"
                onClick={newTournament}
              >
                <Plus size={16} aria-hidden="true" /> New tournament
              </button>
            )}
            <button
              type="button"
              className="button-secondary"
              onClick={openSearch}
            >
              <Search size={16} aria-hidden="true" /> Find a player or
              tournament
            </button>
            {admin && (
              <button
                type="button"
                className="button-secondary"
                onClick={goAudit}
              >
                <ScrollText size={16} aria-hidden="true" /> Audit log
              </button>
            )}
            {admin && (
              <button
                type="button"
                className="button-secondary"
                onClick={goHealth}
              >
                <Activity size={16} aria-hidden="true" /> Run health checks
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
