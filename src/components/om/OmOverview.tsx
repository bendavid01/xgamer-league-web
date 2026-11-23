"use client";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
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
import { ACTION_LABEL, PHASE, formatLabel } from "./labels";
import type { Queues } from "./queues";
import { pendingIn, unplayedIn, type Snapshots } from "./snapshots";
import type { Home, TournamentTab, Workspace } from "./types";
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
      {/* "Opens something": brightens and nudges on hover and keyboard focus. */}
      <ArrowUpRight size={16} className={s.kpiGo} aria-hidden="true" />
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

  // Needs attention: every queue with something waiting, each opening the
  // place where it is handled.
  const firstWith = (has: (w: Workspace) => boolean) =>
    active.find((t) => {
      const w = snaps.data.get(t.id);
      return !!w && has(w);
    })?.id ?? null;
  const approvals = home.playerApprovals;
  const rosterPending = [...snaps.data.values()].reduce(
    (n, w) => n + w.applications.filter((a) => a.status === "pending").length,
    0,
  );
  const queuesList: {
    key: string;
    label: string;
    hint: string;
    count: number;
    go: () => void;
  }[] = [
    ...(approvals
      ? [
          {
            key: "auth",
            label: "XG Player Auth approvals",
            hint: `${approvals.registered} registered (${approvals.accounts} with login ready) · ${approvals.guests} guest`,
            count: approvals.registered + approvals.guests,
            go: () =>
              openTournament(
                firstWith((w) => !!w.newPlayerRequests?.length),
                "entries",
              ),
          },
          {
            key: "returning",
            label: "Returning-player requests",
            hint: "Existing XG IDs asking to enter",
            count: approvals.returning,
            go: () =>
              openTournament(
                firstWith((w) => !!w.returningRequests?.length),
                "entries",
              ),
          },
        ]
      : []),
    {
      key: "roster",
      label: "Pending roster entries",
      hint: "Entries waiting for review, including 1-click player joins",
      count: rosterPending,
      go: () =>
        openTournament(
          firstWith((w) => w.applications.some((a) => a.status === "pending")),
          "entries",
        ),
    },
    ...(admin
      ? [
          {
            key: "contacts",
            label: "Open WhatsApp changes",
            hint: queues.contacts?.forMe
              ? `${queues.contacts.forMe} waiting for you as second admin`
              : "Number changes in progress",
            count: queues.contacts?.open ?? 0,
            go: () => goPlayers("contacts"),
          },
          {
            key: "teams",
            label: "Team names to review",
            hint: "Entries with no tournament team",
            count: queues.teams ?? 0,
            go: () => goPlayers("teams"),
          },
        ]
      : []),
    {
      key: "fixtures",
      label: "Unplayed fixtures",
      hint: "League matches without a score",
      count: unplayed,
      go: () =>
        leagues[0]
          ? openTournament(leagues[0].t.id, "fixtures")
          : openTournament(null),
    },
  ];
  const waiting = queuesList.filter((q) => q.count > 0);
  const recent = home.recentActivity ?? home.audit.slice(0, 5);

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

      {/* Two independent columns, so a short panel never waits for its
          neighbour's height: work queues on the left, tools on the right. */}
      <div className={s.overviewCols}>
        <div className={s.mainColumn}>
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
                          {u > 0 && (
                            <span className={s.badge}>{u} unplayed</span>
                          )}
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

          <section className="panel" aria-labelledby="ov-attention">
            <div className={s.panelHead}>
              <h2 id="ov-attention">Needs attention</h2>
              <span className={s.panelHint}>Live queues</span>
            </div>
            {!ready ? (
              <p className={s.empty}>Checking queues…</p>
            ) : waiting.length ? (
              <ul className={s.rowList}>
                {waiting.map((q) => (
                  <li key={q.key}>
                    <button
                      type="button"
                      className={`${s.row} ${s.ovRow}`}
                      onClick={q.go}
                    >
                      <span className="min-w-0">
                        <strong className={s.rowTitle}>{q.label}</strong>
                        <span className={s.rowSub}>{q.hint}</span>
                      </span>
                      <span className={s.rowMeta}>
                        <span className={s.badge} data-tone="warn">
                          {q.count}
                        </span>
                        <ChevronRight
                          size={16}
                          aria-hidden="true"
                          className={s.rowChevron}
                        />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.allClear} role="status">
                <CheckCircle2 size={18} aria-hidden="true" /> All clear. Nothing
                is waiting for an organizer.
              </p>
            )}
          </section>
        </div>

        <div className={s.sideColumn}>
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

          {admin && (
            <section className="panel" aria-labelledby="ov-activity">
              <div className={s.panelHead}>
                <h2 id="ov-activity">Recent activity</h2>
                <button
                  type="button"
                  className={s.linkStrong}
                  onClick={goAudit}
                >
                  View full log →
                </button>
              </div>
              {recent.length ? (
                <ol className={s.activity}>
                  {recent.map((a) => (
                    <li key={a.id}>
                      <span className={s.activityWhat}>
                        {ACTION_LABEL[a.action] ?? a.summary ?? a.action}
                      </span>
                      <span className={s.rowSub}>
                        {a.actor_name ?? roleName(a.actor_role)}
                        {(a.affected ?? a.tournament_name) &&
                          ` · ${a.affected ?? a.tournament_name}`}
                      </span>
                      <time className={s.activityWhen} dateTime={a.created_at}>
                        {stamp(a.created_at)}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={s.empty}>No activity recorded yet.</p>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}

const roleName = (role: string | null) =>
  role === "player"
    ? "Player"
    : role === "coordinator"
      ? "Coordinator"
      : "Organizer";

/** "23 Nov, 2:05 pm" in India time: short and unambiguous. */
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
