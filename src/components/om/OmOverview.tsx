"use client";
import {
  Activity,
  CalendarClock,
  ChevronRight,
  Inbox,
  Plus,
  ScrollText,
  Search,
  Trophy,
} from "lucide-react";
import { tournamentLabel } from "@/lib/labels";
import { PHASE, formatLabel } from "./labels";
import type { Queues } from "./queues";
import { pendingIn, unplayedIn, type Snapshots } from "./snapshots";
import type { Home, TournamentTab } from "./types";
import { PageHead } from "./ui";
import s from "./om.module.css";

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

      <div className={s.statGrid}>
        <button
          type="button"
          className={s.stat}
          data-tone={pending ? "warn" : undefined}
          onClick={() =>
            firstPending
              ? openTournament(firstPending.id, "entries")
              : openTournament(null)
          }
        >
          <span className={s.statLabel}>
            <Inbox size={16} aria-hidden="true" /> Pending decisions
          </span>
          <span className={s.statValue}>{value(pending)}</span>
          <span className={s.statHint}>
            Registrations, new and returning players
          </span>
        </button>
        <button
          type="button"
          className={s.stat}
          onClick={() => openTournament(null)}
        >
          <span className={s.statLabel}>
            <Trophy size={16} aria-hidden="true" /> Active tournaments
          </span>
          <span className={s.statValue}>{active.length}</span>
          <span className={s.statHint}>
            {home.tournaments.length - active.length} completed
          </span>
        </button>
        <button
          type="button"
          className={s.stat}
          onClick={() =>
            leagues[0]
              ? openTournament(leagues[0].t.id, "fixtures")
              : openTournament(null)
          }
        >
          <span className={s.statLabel}>
            <CalendarClock size={16} aria-hidden="true" /> Unplayed fixtures
          </span>
          <span className={s.statValue}>{value(unplayed)}</span>
          <span className={s.statHint}>League matches without a score</span>
        </button>
        {admin && (
          <button
            type="button"
            className={s.stat}
            data-tone={queues.contacts?.forMe ? "warn" : undefined}
            onClick={() => goPlayers("contacts")}
          >
            <span className={s.statLabel}>
              <Inbox size={16} aria-hidden="true" /> WhatsApp changes
            </span>
            <span className={s.statValue}>
              {queues.contacts ? queues.contacts.open : "—"}
            </span>
            <span className={s.statHint}>
              {queues.contacts?.forMe
                ? `${queues.contacts.forMe} waiting for you as second admin`
                : "Open number changes"}
            </span>
          </button>
        )}
        {admin && (
          <button
            type="button"
            className={s.stat}
            onClick={() => goPlayers("teams")}
          >
            <span className={s.statLabel}>
              <Inbox size={16} aria-hidden="true" /> Team names to review
            </span>
            <span className={s.statValue}>{queues.teams ?? "—"}</span>
            <span className={s.statHint}>Entries with no tournament team</span>
          </button>
        )}
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
                      className={s.row}
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
                        <ChevronRight size={16} aria-hidden="true" />
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

      <section className="panel mt-6" aria-labelledby="ov-fixtures">
        <div className={s.panelHead}>
          <h2 id="ov-fixtures">Unplayed fixtures</h2>
          <span className={s.panelHint}>Current round of each league</span>
        </div>
        {!ready ? (
          <p className={s.empty}>Loading fixtures…</p>
        ) : leagues.length ? (
          <div className={s.fixtureGroups}>
            {leagues.map(({ t, w }) => {
              const list = unplayedIn(w!);
              const round = Math.min(...list.map((f) => f.round));
              const names = new Map([
                ...w!.applications.map(
                  (a) => [a.player_id, a.gaming_name] as const,
                ),
                ...w!.standings.map(({ id, name }) => [id, name] as const),
              ]);
              const now = list.filter((f) => f.round === round);
              return (
                <div key={t.id} className={s.fixtureGroup}>
                  <div className={s.fixtureGroupHead}>
                    <strong>{tournamentLabel(t)}</strong>
                    <span className={s.panelHint}>
                      Round {round} · {list.length} left in total
                    </span>
                  </div>
                  <ul className={s.fixtureList}>
                    {now.slice(0, 6).map((f) => (
                      <li key={f.id}>
                        <span>{names.get(f.home)}</span>
                        <span className={s.vs}>vs</span>
                        <span>{names.get(f.away ?? "")}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="button-secondary om-small"
                    onClick={() => openTournament(t.id, "fixtures")}
                  >
                    Enter scores
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className={s.empty}>Every league fixture has a score.</p>
        )}
      </section>
    </>
  );
}
