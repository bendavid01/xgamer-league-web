"use client";
import { useEffect, useState } from "react";
import { tournamentLabel } from "@/lib/labels";
import type { TournamentRow, Workspace } from "./types";

/**
 * There is no cross-tournament endpoint, so Overview counts, the player directory
 * and quick-jump search read the existing per-tournament workspace
 * (GET /api/admin?t=<id>, read-only), a few at a time, only while a view needs it.
 */
export type Snapshots = {
  data: Map<string, Workspace>;
  failed: string[];
  loading: boolean;
  /** True when the data reflects the latest change (not an older read). */
  fresh: boolean;
};

async function pool<T>(items: T[], size: number, run: (t: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await run(items[next++]);
    }),
  );
}

export function useSnapshots(
  tournaments: TournamentRow[] | undefined,
  enabled: boolean,
  version: number,
): Snapshots {
  const ids = (tournaments ?? []).map((t) => t.id).join(",");
  const key = `${version}|${ids}`;
  const [state, setState] = useState<{
    key: string;
    data: Map<string, Workspace>;
    failed: string[];
  }>({ key: "", data: new Map(), failed: [] });

  useEffect(() => {
    if (!enabled || !ids) return;
    let active = true;
    const go = async () => {
      const data = new Map<string, Workspace>();
      const failed: string[] = [];
      await pool(ids.split(","), 4, async (id) => {
        try {
          const r = await fetch(`/api/admin?t=${encodeURIComponent(id)}`, {
            cache: "no-store",
          });
          if (!r.ok) throw new Error();
          data.set(id, await r.json());
        } catch {
          failed.push(id);
        }
      });
      if (active) setState({ key, data, failed });
    };
    void go();
    return () => {
      active = false;
    };
  }, [enabled, ids, key]);

  return {
    data: state.data,
    failed: state.failed,
    loading: enabled && !!ids && state.key !== key,
    fresh: !!ids && state.key === key,
  };
}

/** Entries waiting for an organizer decision in one tournament. */
export const pendingIn = (w: Workspace) =>
  w.applications.filter((a) => a.status === "pending").length +
  (w.newPlayerRequests?.length ?? 0) +
  (w.returningRequests?.length ?? 0);

/** League fixtures (not byes) without a score yet. */
export const unplayedIn = (w: Workspace) =>
  w.fixtures.filter((f) => f.away && f.home_score === null);

export type DirectoryPlayer = {
  id: string;
  code: string;
  name: string;
  currentTeam: string | null;
  /** Most recent tournament first (the OM home order). */
  entries: { tournament: string; label: string; status: string }[];
};

/** Every player with an active entry in a tournament the organizer can open. */
export function directoryOf(
  tournaments: TournamentRow[],
  data: Map<string, Workspace>,
): DirectoryPlayer[] {
  const out = new Map<string, DirectoryPlayer>();
  for (const t of tournaments) {
    const w = data.get(t.id);
    if (!w) continue;
    for (const a of w.applications) {
      const p = out.get(a.player_id) ?? {
        id: a.player_id,
        code: a.code,
        name: a.gaming_name,
        currentTeam: a.current_team,
        entries: [],
      };
      p.entries.push({
        tournament: t.id,
        label: tournamentLabel(t),
        status: a.status,
      });
      out.set(a.player_id, p);
    }
  }
  const n = (code: string) => Number(code.replace(/\D/g, "")) || 0;
  return [...out.values()].sort((a, b) => n(a.code) - n(b.code));
}
