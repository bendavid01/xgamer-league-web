"use client";
import { useMemo, useState } from "react";
import { ChevronRight, Plus, RotateCcw } from "lucide-react";
import { tournamentLabel } from "@/lib/labels";
import { PHASE, competitionsOf, formatLabel } from "./labels";
import { pendingIn } from "./snapshots";
import EntriesTab from "./tournament/EntriesTab";
import FixturesTab from "./tournament/FixturesTab";
import NewTournament from "./tournament/NewTournament";
import SetupTab from "./tournament/SetupTab";
import StandingsTab from "./tournament/StandingsTab";
import type {
  Act,
  Competitions,
  Home,
  Status,
  TournamentTab,
  Workspace,
} from "./types";
import { PageHead, Tabs, type TabDef } from "./ui";
import type { Om } from "./useOm";
import s from "./om.module.css";

const TAB_LABEL: Record<TournamentTab, string> = {
  entries: "Entries & Roster",
  fixtures: "Fixtures & Scores",
  standings: "Standings & Podium",
  setup: "Setup & Announcements",
};

export default function OmTournaments({
  om,
  adding,
  setAdding,
  tabIntent,
  openTournament,
}: {
  om: Om;
  adding: boolean;
  setAdding: (v: boolean) => void;
  /** Tab to open first in that tournament (from Overview shortcuts). */
  tabIntent: { id: string; tab: TournamentTab } | null;
  openTournament: (id: string) => void;
}) {
  const home = om.homeData;
  const competitions = useMemo(
    () => competitionsOf(home?.tournaments ?? []),
    [home],
  );
  if (om.open)
    return om.work ? (
      <TournamentWorkspace
        key={om.work.tournament.id}
        data={om.work}
        act={om.act}
        competitions={competitions}
        reload={() => om.load(om.open)}
        changed={om.changed}
        initialTab={
          tabIntent?.id === om.work.tournament.id ? tabIntent.tab : null
        }
      />
    ) : (
      !om.error && <p className="notice">Opening tournament…</p>
    );
  if (!home) return null;
  return (
    <TournamentList
      data={home}
      act={om.act}
      adding={adding}
      setAdding={setAdding}
      openTournament={openTournament}
    />
  );
}

/* ─────────────────────────── List ─────────────────────────── */

function TournamentList({
  data,
  act,
  adding,
  setAdding,
  openTournament,
}: {
  data: Home;
  act: Act;
  adding: boolean;
  setAdding: (v: boolean) => void;
  openTournament: (id: string) => void;
}) {
  const admin = data.user.role === "admin";
  const [q, setQ] = useState("");
  const shown = data.tournaments.filter((t) =>
    `${tournamentLabel(t)} ${PHASE[t.status]}`
      .toLowerCase()
      .includes(q.trim().toLowerCase()),
  );
  return (
    <>
      <PageHead
        title="Tournaments"
        sub="Pick a tournament to open its matchday workspace."
      >
        {admin && !adding && (
          <button className="button-primary" onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden="true" /> New tournament
          </button>
        )}
      </PageHead>
      {adding && (
        <NewTournament
          competitions={competitionsOf(data.tournaments)}
          act={act}
          cancel={() => setAdding(false)}
        />
      )}
      <section className="panel" aria-label="All tournaments">
        {data.tournaments.length > 4 && (
          <div className={s.panelHead}>
            <input
              type="search"
              className={`control-input !mt-0 ${s.search}`}
              placeholder="Filter tournaments"
              aria-label="Filter tournaments"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        )}
        {data.tournaments.length ? (
          <ul className={s.rowList}>
            {shown.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={s.row}
                  onClick={() => openTournament(t.id)}
                >
                  <span className="min-w-0">
                    <strong className={s.rowTitle}>{tournamentLabel(t)}</strong>
                    <span className={s.rowSub}>{formatLabel(t)}</span>
                  </span>
                  <span className={s.rowMeta}>
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
            ))}
            {!shown.length && (
              <li className={s.empty}>No tournament matches “{q}”.</li>
            )}
          </ul>
        ) : (
          <p className={s.empty}>
            No tournaments yet.
            {admin && " Press New tournament to create the first one."}
          </p>
        )}
      </section>
      {admin && data.deleted.length > 0 && (
        <details className="om-card mt-6">
          <summary className="cursor-pointer">
            Deleted tournaments ({data.deleted.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {data.deleted.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <span>
                  {tournamentLabel(d)}{" "}
                  <span className="text-xs text-slate-500">
                    deleted {new Date(d.deleted_at).toLocaleDateString("en-IN")}
                  </span>
                </span>
                <button
                  className="button-secondary om-small"
                  onClick={() =>
                    void act(
                      { action: "restore_tournament", tournament: d.id },
                      `${tournamentLabel(d)} restored.`,
                    )
                  }
                >
                  <RotateCcw size={14} aria-hidden="true" /> Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/* ─────────────────────────── Workspace ─────────────────────────── */

function TournamentWorkspace({
  data,
  act,
  competitions,
  reload,
  changed,
  initialTab,
}: {
  data: Workspace;
  act: Act;
  competitions: Competitions;
  reload: () => Promise<void>;
  changed: () => void;
  initialTab: TournamentTab | null;
}) {
  const t = data.tournament;
  const can = (op: string) =>
    data.user.role === "admin" || data.user.operations.includes(op);
  const admin = data.user.role === "admin";
  // The same visibility rules as the original tabs, grouped four ways.
  const has: Record<TournamentTab, boolean> = {
    entries:
      can("registrations") ||
      !!data.newPlayerRequests ||
      !!data.returningRequests,
    fixtures:
      (t.format === "league" && (can("results") || admin)) ||
      (admin && t.format === "knockout"),
    standings:
      t.format === "league" ||
      (admin && ["knockout", "completed"].includes(t.status)),
    setup: admin || can("announcements"),
  };
  const tabs: TabDef[] = (Object.keys(TAB_LABEL) as TournamentTab[])
    .filter((k) => has[k])
    .map((k) => ({
      key: k,
      label: TAB_LABEL[k],
      count: k === "entries" ? pendingIn(data) : undefined,
    }));
  const preferred: TournamentTab[] = [
    ...(initialTab ? [initialTab] : []),
    ...(can("registrations") ? (["entries"] as const) : []),
    ...(can("results") ? (["fixtures"] as const) : []),
    "standings",
  ];
  const [tab, setTab] = useState<string>(
    preferred.find((k) => has[k]) ?? tabs[0]?.key ?? "standings",
  );
  const names = useMemo(
    () =>
      new Map([
        ...data.applications.map((a) => [a.player_id, a.gaming_name] as const),
        ...data.standings.map(({ id, name }) => [id, name] as const),
      ]),
    [data],
  );
  const next = nextStep(t, admin);
  return (
    <>
      <div className={s.wsHead}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className={s.pageTitle}>{tournamentLabel(t)}</h1>
            <span className={`status-pill status-${t.status}`}>
              {PHASE[t.status]}
            </span>
            {!t.published && (
              <span className="status-pill om-hidden">Not on website</span>
            )}
          </div>
          <p className={s.pageSub}>{formatLabel(t)}</p>
        </div>
      </div>

      <Lifecycle t={t} />
      {next && (
        <div className={s.nextStep}>
          <span>
            <strong>Next:</strong> {next.text}
          </span>
          {has[next.tab] && tab !== next.tab && (
            <button
              type="button"
              className="button-secondary om-small"
              onClick={() => setTab(next.tab)}
            >
              Go to {TAB_LABEL[next.tab]}
            </button>
          )}
        </div>
      )}

      <Tabs
        label="Tournament sections"
        tabs={tabs}
        value={tab}
        onChange={setTab}
      />
      <div role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-5">
        {tab === "entries" && has.entries && (
          <EntriesTab data={data} act={act} reload={reload} changed={changed} />
        )}
        {tab === "fixtures" && has.fixtures && (
          <FixturesTab data={data} act={act} names={names} />
        )}
        {tab === "standings" && has.standings && (
          <StandingsTab data={data} act={act} reload={reload} />
        )}
        {tab === "setup" && has.setup && (
          <SetupTab data={data} act={act} competitions={competitions} />
        )}
      </div>
    </>
  );
}

/** Where the tournament is in its life: setup → registration → play → completed. */
function Lifecycle({ t }: { t: Workspace["tournament"] }) {
  const steps: { key: Status; label: string }[] = [
    { key: "draft", label: "Setting up" },
    { key: "open", label: "Registration open" },
    { key: "locked", label: "Registration closed" },
    ...(t.format === "league"
      ? [{ key: "league" as const, label: "League" }]
      : []),
    ...(t.format === "knockout" || t.knockout
      ? [{ key: "knockout" as const, label: "Knockout" }]
      : []),
    { key: "completed", label: "Completed" },
  ];
  const now = steps.findIndex((x) => x.key === t.status);
  return (
    <ol className={s.lifecycle} aria-label="Tournament status">
      {steps.map((step, i) => (
        <li
          key={step.key}
          className={s.lcStep}
          data-state={i < now ? "done" : i === now ? "now" : "todo"}
          aria-current={i === now ? "step" : undefined}
        >
          <span className={s.lcDot} aria-hidden="true" />
          <span className={s.lcLabel}>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

function nextStep(
  t: Workspace["tournament"],
  admin: boolean,
): { text: string; tab: TournamentTab } | null {
  switch (t.status) {
    case "draft":
      return admin
        ? {
            text: "Check the settings, then open registration.",
            tab: "setup",
          }
        : null;
    case "open":
      return {
        text: "Review entries as they arrive. Close registration when the field is set.",
        tab: "entries",
      };
    case "locked":
      return t.format === "knockout"
        ? { text: "Start the knockout.", tab: "fixtures" }
        : { text: "Generate the league fixtures.", tab: "fixtures" };
    case "league":
      return {
        text: t.knockout
          ? `Enter scores, then confirm the Top ${t.qualifiers}.`
          : "Enter scores, then finish the league.",
        tab: "fixtures",
      };
    case "knockout":
      return admin
        ? {
            text: "Record the final positions, then mark the tournament completed.",
            tab: "standings",
          }
        : null;
    case "completed":
      return admin
        ? {
            text: "Finished. You can run it again as next season.",
            tab: "setup",
          }
        : null;
  }
}
