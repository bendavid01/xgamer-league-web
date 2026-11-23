"use client";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import OmDrawer from "./OmDrawer";
import ContactApprovals from "./player/ContactApprovals";
import PlayerDetails from "./player/PlayerDetails";
import TeamReview from "./player/TeamReview";
import type { Queues } from "./queues";
import { directoryOf, type Snapshots } from "./snapshots";
import type { Home } from "./types";
import { PageHead, Tabs, XgId, type TabDef } from "./ui";
import s from "./om.module.css";

export type PlayersTab = "directory" | "teams" | "contacts";
export type OpenPlayer = { id: string; tournament: string; name: string };

export default function OmPlayers({
  home,
  snaps,
  queues,
  tab,
  setTab,
  player,
  setPlayer,
  changed,
}: {
  home: Home;
  snaps: Snapshots;
  queues: Queues;
  tab: PlayersTab;
  setTab: (t: PlayersTab) => void;
  player: OpenPlayer | null;
  setPlayer: (p: OpenPlayer | null) => void;
  changed: () => void;
}) {
  const admin = home.user.role === "admin";
  const tabs: TabDef[] = [
    { key: "directory", label: "Directory" },
    ...(admin
      ? [
          {
            key: "teams",
            label: "Team-name review",
            count: queues.teams ?? undefined,
          },
          {
            key: "contacts",
            label: "WhatsApp changes",
            count: queues.contacts?.open,
          },
        ]
      : []),
  ];
  const current = tabs.some((t) => t.key === tab) ? tab : "directory";
  return (
    <>
      <PageHead
        title="Players"
        sub="Every player keeps one permanent XG ID across all tournaments."
      />
      <Tabs
        label="Players"
        tabs={tabs}
        value={current}
        onChange={(v) => setTab(v as PlayersTab)}
      />
      <div role="tabpanel" aria-labelledby={`tab-${current}`} className="mt-5">
        {current === "directory" && (
          <Directory home={home} snaps={snaps} open={setPlayer} />
        )}
        {current === "teams" && admin && <TeamReview changed={changed} />}
        {current === "contacts" && admin && (
          <ContactApprovals changed={changed} />
        )}
      </div>
      <OmDrawer
        open={!!player}
        onClose={() => setPlayer(null)}
        title="Player details"
        subtitle={player?.name}
      >
        {player && (
          <PlayerDetails
            key={`${player.id}:${player.tournament}`}
            tournament={player.tournament}
            playerId={player.id}
            changed={async () => changed()}
            retarget={(t) => setPlayer(t ? { ...player, tournament: t } : null)}
          />
        )}
      </OmDrawer>
    </>
  );
}

function Directory({
  home,
  snaps,
  open,
}: {
  home: Home;
  snaps: Snapshots;
  open: (p: OpenPlayer) => void;
}) {
  const [q, setQ] = useState("");
  const all = directoryOf(home.tournaments, snaps.data);
  const term = q.trim().toLowerCase();
  const shown = term
    ? all.filter((p) =>
        `${p.code} ${p.name} ${p.currentTeam ?? ""}`
          .toLowerCase()
          .includes(term),
      )
    : all;
  return (
    <section className="panel" aria-label="Player directory">
      <div className={s.panelHead}>
        <input
          type="search"
          className={`control-input !mt-0 ${s.search}`}
          placeholder="Search by XG ID, name or team"
          aria-label="Search players"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className={s.panelHint} aria-live="polite">
          {snaps.loading
            ? "Loading players…"
            : `${shown.length} of ${all.length} players`}
        </span>
      </div>
      {snaps.failed.length > 0 && (
        <p className="notice text-amber-200 mx-4 mb-4">
          {snaps.failed.length} tournament
          {snaps.failed.length === 1 ? "" : "s"} could not be read, so some
          players may be missing. Press Refresh to try again.
        </p>
      )}
      {/* Phones and small tablets: one tappable card per player. */}
      <ul className={s.dirCards} aria-label="Players">
        {shown.map((p) => {
          const latest = p.entries[0];
          return (
            <li key={p.id}>
              <button
                type="button"
                className={s.dirCard}
                onClick={() =>
                  open({ id: p.id, tournament: latest.tournament, name: p.name })
                }
              >
                <span className={s.dirCardMain}>
                  <span className={s.dirCardTop}>
                    <XgId code={p.code} />
                    <strong className={s.dirCardName}>{p.name}</strong>
                  </span>
                  <span className={s.rowSub}>
                    {p.currentTeam ?? "No current team"}
                  </span>
                  <span className={s.dirCardMeta}>
                    <span className={`om-status om-${latest.status}`}>
                      {latest.status}
                    </span>
                    <span className={s.dirCardLabel}>{latest.label}</span>
                    <span className={s.dirCardCount}>
                      {p.entries.length} tournament
                      {p.entries.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </span>
                <ChevronRight
                  size={18}
                  aria-hidden="true"
                  className={s.rowChevron}
                />
              </button>
            </li>
          );
        })}
      </ul>
      <div className={`overflow-x-auto ${s.dirTableWrap}`}>
        <table className={`control-table ${s.numTable} ${s.dirTable}`}>
          <thead>
            <tr>
              <th>XG ID</th>
              <th>Player</th>
              <th>Current team</th>
              <th>Latest entry</th>
              <th>Tournaments</th>
              <th className="sr-only">Open</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const latest = p.entries[0];
              return (
                <tr key={p.id}>
                  <td>
                    <XgId code={p.code} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={s.linkStrong}
                      onClick={() =>
                        open({
                          id: p.id,
                          tournament: latest.tournament,
                          name: p.name,
                        })
                      }
                    >
                      {p.name}
                    </button>
                  </td>
                  <td>{p.currentTeam ?? "—"}</td>
                  <td>
                    <span className={`om-status om-${latest.status}`}>
                      {latest.status}
                    </span>{" "}
                    <span className="text-slate-400 text-sm">
                      {latest.label}
                    </span>
                  </td>
                  <td>{p.entries.length}</td>
                  <td>
                    <button
                      type="button"
                      className={s.iconBtn}
                      aria-label={`Open ${p.name}`}
                      onClick={() =>
                        open({
                          id: p.id,
                          tournament: latest.tournament,
                          name: p.name,
                        })
                      }
                    >
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!snaps.loading && !shown.length && (
        <p className={s.empty}>
          {all.length
            ? `No player matches “${q}”.`
            : "No players yet. Players appear here once they enter a tournament."}
        </p>
      )}
      <p className={s.footNote}>
        Lists players with an active entry in a current tournament. Details open
        in the context of their latest entry.
      </p>
    </section>
  );
}
