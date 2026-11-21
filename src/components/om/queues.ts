"use client";
import { useEffect, useState } from "react";
import type { ContactChangeRow, ReviewEntry } from "./types";

export type Queues = {
  /** Entries with no team recorded for their tournament. */
  teams: number | null;
  /** Open WhatsApp number changes, and those waiting for me as second admin. */
  contacts: { open: number; forMe: number } | null;
};

/** Counts for the two admin review queues (existing read-only GETs). */
export function useQueues(enabled: boolean, version: number): Queues {
  const [state, setState] = useState<Queues & { version: number }>({
    teams: null,
    contacts: null,
    version: -1,
  });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const read = async <T>(url: string): Promise<T | null> => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        return r.ok ? ((await r.json()) as T) : null;
      } catch {
        return null;
      }
    };
    const go = async () => {
      const [teams, contacts] = await Promise.all([
        read<{ entries: ReviewEntry[] }>("/api/admin?teams=1"),
        read<{ changes: ContactChangeRow[] }>("/api/admin?contactChanges=1"),
      ]);
      if (!active) return;
      setState({
        version,
        teams: teams ? teams.entries.length : null,
        contacts: contacts
          ? {
              open: contacts.changes.length,
              forMe: contacts.changes.filter(
                (c) => c.status === "awaiting_second_admin" && !c.requestedByMe,
              ).length,
            }
          : null,
      });
    };
    void go();
    return () => {
      active = false;
    };
  }, [enabled, version]);
  return enabled ? state : { teams: null, contacts: null };
}
