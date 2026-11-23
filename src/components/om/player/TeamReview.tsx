"use client";
import { useCallback, useEffect, useState } from "react";
import { useEditSender } from "../client";
import { ATTEST_REASON } from "../labels";
import type { ReviewEntry } from "../types";
import { Feedback, XgId } from "../ui";
import { CorrectTeam } from "./PlayerDetails";

/**
 * Players → Team-name review (main admins).
 * Lists entries with no tournament team and what the database knows about them.
 * "Confirm team" copies the player's current team shown here; nothing is typed in.
 */
export default function TeamReview({ changed }: { changed?: () => void }) {
  const [data, setData] = useState<{
    display: string;
    entries: ReviewEntry[];
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const send = useEditSender();
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin?teams=1", { cache: "no-store" });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setData(v);
    } catch (e) {
      setError((e as Error).message || "Could not load the review.");
    }
  }, []);
  useEffect(() => {
    const go = async () => {
      await load();
    };
    void go();
  }, [load]);
  const submit = async (
    form: string,
    value: Record<string, unknown>,
    done: string,
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    const r = await send(form, value);
    if (r.ok) setNotice(done);
    else setError(r.error!);
    await load();
    if (r.ok) changed?.();
    setBusy(false);
    return r.ok;
  };
  return (
    <section className="panel p-4 md:p-7 space-y-5" aria-labelledby="tr-title">
      <div>
        <h2 id="tr-title" className="text-2xl font-bold">
          Team names per tournament: review
        </h2>
        <p className="text-slate-400 mt-1 text-sm">
          Tournament entries with no team name. &ldquo;Confirm team&rdquo; uses
          the player&apos;s current team; for any other team, use &ldquo;Add
          missing team&rdquo;. Every change is logged.
        </p>
      </div>
      <Feedback error={error} notice={notice} />
      {!data && !error && <p className="text-slate-400">Checking…</p>}
      {data && !data.entries.length && (
        <p className="text-slate-300">Every entry has a recorded team.</p>
      )}
      <fieldset disabled={busy} className="space-y-3">
        {data?.entries.map((e) => (
          <article key={e.applicationId} className="om-card space-y-2">
            <p>
              <strong>{e.gaming_name}</strong>{" "}
              <span className="text-slate-400">
                · <XgId code={e.code} /> · {e.label} · {e.status}
              </span>
            </p>
            <p>
              Suggested team: <strong>{e.currentTeam ?? "—"}</strong>{" "}
              <span className="text-xs text-slate-500">
                (the player&apos;s current team)
              </span>
            </p>
            <ul className="text-sm text-slate-400 list-disc pl-5">
              <li>Tournaments this player entered: {e.evidence.entries}</li>
              <li>
                Signup records: {e.evidence.registration_records}
                {e.evidence.registration_audit_id !== null &&
                  ` (record #${e.evidence.registration_audit_id}${e.evidence.registration_at ? `, ${new Date(e.evidence.registration_at).toLocaleString("en-IN")}` : ""})`}
                {e.evidence.record_has_team
                  ? ", one includes a team"
                  : ", none include a team"}
              </li>
              <li>
                Team changes made here since signup: {e.evidence.team_edits}
              </li>
            </ul>
            {e.eligible ? (
              <form
                className="space-y-2"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  const f = new FormData(ev.currentTarget);
                  void submit(
                    `attest-${e.applicationId}`,
                    {
                      action: "application.team_attest",
                      tournament: e.tournament,
                      applicationId: e.applicationId,
                      expectedTeam: e.currentTeam,
                      confirm: f.get("confirm") === "on",
                      reason: String(f.get("reason") ?? ""),
                    },
                    `Confirmed ${e.currentTeam} for ${e.gaming_name} in ${e.label}.`,
                  );
                }}
              >
                <label className="flex gap-2 text-sm">
                  <input type="checkbox" name="confirm" required />I confirm
                  this player registered once through the website and the team
                  shown is the team they registered with.
                </label>
                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    name="reason"
                    required
                    minLength={5}
                    maxLength={300}
                    defaultValue={ATTEST_REASON}
                    className="control-input !mt-0"
                    aria-label="Reason"
                  />
                  <button className="button-primary">Confirm team</button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-amber-200">
                Can&apos;t confirm this one automatically:{" "}
                {e.reasons.join("; ")}.
              </p>
            )}
            <CorrectTeam
              entry={{ label: e.label, team_name: null }}
              onSave={(v) =>
                submit(
                  `correct-${e.applicationId}`,
                  {
                    action: "application.team_correct",
                    tournament: e.tournament,
                    applicationId: e.applicationId,
                    expectedTeam: null,
                    expectedSource: null,
                    ...v,
                  },
                  `Team saved for ${e.gaming_name} in ${e.label}.`,
                )
              }
            />
          </article>
        ))}
      </fieldset>
      {data && (
        <p className="text-xs text-slate-500">
          The website currently shows{" "}
          {data.display === "entry"
            ? "each tournament's own team names."
            : "each player's current team everywhere."}
        </p>
      )}
    </section>
  );
}
