"use client";
import { useCallback, useEffect, useState } from "react";
import type { Act, Home, Section, Workspace } from "./types";

const SECTIONS: Section[] = [
  "overview",
  "tournaments",
  "players",
  "audit",
  "health",
  "access",
];

/** /admin?t=<id> (the original deep link) opens a tournament; ?s=<section> a section. */
function readUrl(): { section: Section; tid: string | null } {
  const q = new URLSearchParams(window.location.search);
  const tid = q.get("t");
  if (tid) return { section: "tournaments", tid };
  const sec = q.get("s") as Section | null;
  return {
    section: sec && SECTIONS.includes(sec) ? sec : "overview",
    tid: null,
  };
}
const urlFor = (section: Section, tid: string | null) =>
  tid
    ? `/admin?t=${encodeURIComponent(tid)}`
    : section === "overview"
      ? "/admin"
      : `/admin?s=${section}`;

/**
 * All Organizer Manager state. The load / act / refresh logic is the original
 * ControlCenter root, unchanged apart from knowing which section is shown.
 */
export function useOm() {
  const [section, setSection] = useState<Section>("overview");
  const [open, setOpen] = useState<string | null>(null);
  const [homeData, setHome] = useState<Home | null>(null);
  const [work, setWork] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  /** Bumped after every successful change or refresh, so derived views refetch. */
  const [version, setVersion] = useState(0);

  const load = useCallback(async (tid: string | null) => {
    const r = await fetch(
      tid ? `/api/admin?t=${encodeURIComponent(tid)}` : "/api/admin",
      { cache: "no-store" },
    );
    const value = await r.json();
    if (!r.ok) throw new Error(value.error);
    if (tid) setWork(value);
    else setHome(value);
  }, []);

  // First load, and browser back/forward between sections and tournaments.
  useEffect(() => {
    let active = true;
    const first = async () => {
      const { section: sec, tid } = readUrl();
      try {
        await load(null);
        if (!active) return;
        setSection(sec);
        if (tid) {
          setOpen(tid);
          await load(tid);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void first();
    const onPop = () => {
      const { section: sec, tid } = readUrl();
      setError("");
      setNotice("");
      setSection(sec);
      setOpen(tid);
      setWork(null);
      void load(tid).catch((e) => setError((e as Error).message));
    };
    window.addEventListener("popstate", onPop);
    return () => {
      active = false;
      window.removeEventListener("popstate", onPop);
    };
  }, [load]);

  const show = async (sec: Section, tid: string | null) => {
    setError("");
    setNotice("");
    setSection(sec);
    setOpen(tid);
    setWork(null);
    window.history.pushState(null, "", urlFor(sec, tid));
    try {
      await load(tid);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  /** Open a tournament (or the tournament list when null). */
  const navigate = (tid: string | null) => show("tournaments", tid);
  /** Switch section; any open tournament is closed, as on the original home. */
  const go = (sec: Section) => show(sec, null);

  const act: Act = async (value, done) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          open &&
            !("tournament" in value) &&
            value.action !== "create" &&
            value.action !== "coordinator"
            ? { ...value, tournament: open }
            : value,
        ),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      if (value.action === "delete_tournament") {
        await navigate(null);
      } else if (
        (value.action === "create" || value.action === "rerun") &&
        result.id
      ) {
        await navigate(result.id);
      } else {
        await Promise.all([load(null), open ? load(open) : Promise.resolve()]);
      }
      setVersion((v) => v + 1);
      if (
        value.action === "newPlayer.approve" &&
        typeof result.code === "string"
      )
        setNotice(`New player approved with permanent ID ${result.code}.`);
      else if (result.restored === true)
        setNotice(
          `Removed entry restored under the existing XG ID, keeping its recorded team${typeof result.team === "string" ? ` (${result.team})` : ""}. Correct the team in Edit player details if needed.`,
        );
      else if (done) setNotice(done);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setError("");
    try {
      await Promise.all([load(null), open ? load(open) : Promise.resolve()]);
      setVersion((v) => v + 1);
      setNotice("Up to date.");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  /** Signals a change made by a self-contained panel (player edits, reviews). */
  const changed = useCallback(() => setVersion((v) => v + 1), []);

  return {
    section,
    open,
    homeData,
    work,
    error,
    notice,
    busy,
    version,
    user: homeData?.user ?? work?.user,
    load,
    navigate,
    go,
    act,
    refresh,
    changed,
  };
}
export type Om = ReturnType<typeof useOm>;
