"use client";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { HEALTH_LABEL } from "./labels";
import type { HealthSection } from "./types";
import { PageHead } from "./ui";
import s from "./om.module.css";

/** Read-only integrity report (main admins). Nothing here changes data. */
export default function OmHealth({
  goTeams,
  goContacts,
}: {
  goTeams: () => void;
  goContacts: () => void;
}) {
  const [sections, setSections] = useState<HealthSection[] | null>(null);
  const [error, setError] = useState("");
  const fetchReport = useCallback(async () => {
    try {
      const r = await fetch("/api/admin?health=1", { cache: "no-store" });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setSections(v);
      setError("");
    } catch (e) {
      setError((e as Error).message || "Could not load the report.");
    }
  }, []);
  const load = () => {
    setError("");
    setSections(null);
    void fetchReport();
  };
  useEffect(() => {
    const go = async () => {
      await fetchReport();
    };
    void go();
  }, [fetchReport]);

  const counts = { ok: 0, warn: 0, error: 0, info: 0 };
  for (const sec of sections ?? [])
    for (const c of sec.checks) counts[c.level]++;

  return (
    <>
      <PageHead
        title="System Health"
        sub="Read-only checks of player IDs, tournaments, results, placements, the ranking and the legacy archive. Nothing is changed, merged or deleted from here."
      >
        <button className="button-secondary" onClick={load}>
          <RefreshCw size={16} aria-hidden="true" /> Run again
        </button>
      </PageHead>

      {sections && (
        <div className={s.statGrid}>
          {(["error", "warn", "ok", "info"] as const).map((level) => (
            <div key={level} className={s.stat} data-tone={level}>
              <span className={s.statLabel}>
                <span className={`om-health om-health-${level}`}>
                  {HEALTH_LABEL[level]}
                </span>
              </span>
              <span className={s.statValue}>{counts[level]}</span>
              <span className={s.statHint}>
                {level === "error"
                  ? "Problems to fix"
                  : level === "warn"
                    ? "Worth a look"
                    : level === "ok"
                      ? "Checks passing"
                      : "For information"}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="notice text-amber-200 mt-6">{error}</p>}
      {!sections && !error && <p className="notice mt-6">Checking…</p>}
      <div className="space-y-6 mt-6">
        {sections?.map((sec) => (
          <section key={sec.title} className="panel p-4 md:p-6">
            <h2 className="text-lg font-bold mb-3">{sec.title}</h2>
            <ul className="space-y-2">
              {sec.checks.map((c) => (
                <li key={c.title} className="om-card" data-level={c.level}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`om-health om-health-${c.level}`}>
                      {HEALTH_LABEL[c.level]}
                    </span>
                    <strong>{c.title}</strong>
                  </div>
                  <p className="text-sm text-slate-300 mt-1">{c.detail}</p>
                  {c.items && c.items.length > 0 && (
                    <ul className="mt-2 text-sm text-slate-400 list-disc pl-5">
                      {c.items.slice(0, 50).map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className={s.footNote}>
        Review work that changes records lives in Players:{" "}
        <button type="button" className="om-link" onClick={goTeams}>
          Team-name review
        </button>{" "}
        and{" "}
        <button type="button" className="om-link" onClick={goContacts}>
          WhatsApp changes
        </button>
        .
      </p>
    </>
  );
}
