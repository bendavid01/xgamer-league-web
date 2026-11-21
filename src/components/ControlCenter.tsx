"use client";
import { useCallback, useState } from "react";
import { tournamentLabel } from "@/lib/labels";
import { PHASE, SECTION_LABEL } from "@/components/om/labels";
import OmAccess from "@/components/om/OmAccess";
import OmAudit from "@/components/om/OmAudit";
import OmHealth from "@/components/om/OmHealth";
import OmOverview from "@/components/om/OmOverview";
import OmPlayers, {
  type OpenPlayer,
  type PlayersTab,
} from "@/components/om/OmPlayers";
import type { JumpItem } from "@/components/om/OmQuickJump";
import OmShell, { visibleSections } from "@/components/om/OmShell";
import OmTournaments from "@/components/om/OmTournaments";
import { useQueues } from "@/components/om/queues";
import {
  directoryOf,
  pendingIn,
  useSnapshots,
} from "@/components/om/snapshots";
import type { Section, TournamentTab } from "@/components/om/types";
import { useOm } from "@/components/om/useOm";

/**
 * Organizer Manager entry (/admin). Five sections — Overview, Tournaments,
 * Players, Audit Log, System Health — plus Coordinator access for main admins.
 * All behaviour lives in src/components/om/; this file only wires it together.
 */
export default function ControlCenter({
  signOutAction,
}: {
  signOutAction: () => Promise<void>;
}) {
  const om = useOm();
  const home = om.homeData;
  const admin = om.user?.role === "admin";
  const [adding, setAdding] = useState(false);
  const [tabIntent, setTabIntent] = useState<{
    id: string;
    tab: TournamentTab;
  } | null>(null);
  const [playersTab, setPlayersTab] = useState<PlayersTab>("directory");
  const [player, setPlayer] = useState<OpenPlayer | null>(null);
  const [jump, setJump] = useState(false);
  /** Quick jump searches players, so it needs the cross-tournament reads once opened. */
  const [jumpUsed, setJumpUsed] = useState(false);
  const openJump = useCallback((v: boolean) => {
    if (v) setJumpUsed(true);
    setJump(v);
  }, []);

  const allowed: Section[] = [
    ...visibleSections(om.user),
    ...(admin ? (["access"] as const) : []),
  ];
  // A section this organizer can't open (e.g. from an old link) shows Overview.
  const section: Section = allowed.includes(om.section)
    ? om.section
    : "overview";
  const crossTournament =
    section === "overview" || section === "players" || jumpUsed;
  const snaps = useSnapshots(
    home?.tournaments,
    !!home && crossTournament,
    om.version,
  );
  const queues = useQueues(
    admin && (section === "overview" || section === "players"),
    om.version,
  );
  const pending = snaps.fresh
    ? [...snaps.data.values()].reduce((n, w) => n + pendingIn(w), 0)
    : undefined;

  const openTournament = (id: string | null, tab?: TournamentTab) => {
    setTabIntent(id && tab ? { id, tab } : null);
    void om.navigate(id);
  };
  const goPlayers = (tab: PlayersTab = "directory") => {
    setPlayersTab(tab);
    void om.go("players");
  };

  const jumpItems: JumpItem[] = home
    ? [
        ...allowed.map((sec): JumpItem => ({
          id: `page:${sec}`,
          group: "Pages",
          label: SECTION_LABEL[sec],
          run: () => void om.go(sec),
        })),
        ...home.tournaments.map((t): JumpItem => ({
          id: `t:${t.id}`,
          group: "Tournaments",
          label: tournamentLabel(t),
          hint: PHASE[t.status],
          run: () => openTournament(t.id),
        })),
        ...(allowed.includes("players")
          ? directoryOf(home.tournaments, snaps.data).map((p): JumpItem => ({
              id: `p:${p.id}`,
              group: "Players",
              label: p.name,
              hint: `${p.code}${p.currentTeam ? ` · ${p.currentTeam}` : ""}`,
              run: () => {
                setPlayer({
                  id: p.id,
                  tournament: p.entries[0].tournament,
                  name: p.name,
                });
                goPlayers("directory");
              },
            }))
          : []),
      ]
    : [];

  return (
    <OmShell
      om={om}
      section={section}
      pending={pending}
      jump={jump}
      setJump={openJump}
      jumpItems={jumpItems}
      jumpLoading={snaps.loading}
      signOutAction={signOutAction}
    >
      {section === "overview" && home && (
        <OmOverview
          home={home}
          snaps={snaps}
          queues={queues}
          openTournament={openTournament}
          goPlayers={goPlayers}
          goAudit={() => void om.go("audit")}
          goHealth={() => void om.go("health")}
          newTournament={() => {
            setAdding(true);
            void om.go("tournaments");
          }}
          openSearch={() => openJump(true)}
        />
      )}
      {section === "tournaments" && (
        <OmTournaments
          om={om}
          adding={adding}
          setAdding={setAdding}
          tabIntent={tabIntent}
          openTournament={(id) => openTournament(id)}
        />
      )}
      {section === "players" && home && (
        <OmPlayers
          home={home}
          snaps={snaps}
          queues={queues}
          tab={playersTab}
          setTab={setPlayersTab}
          player={player}
          setPlayer={setPlayer}
          changed={om.changed}
        />
      )}
      {section === "audit" && home && <OmAudit rows={home.audit} />}
      {section === "health" && (
        <OmHealth
          goTeams={() => goPlayers("teams")}
          goContacts={() => goPlayers("contacts")}
        />
      )}
      {section === "access" && home && <OmAccess data={home} act={om.act} />}
    </OmShell>
  );
}
