"use client";
import { useCallback, useEffect, useState } from "react";
import { profileHref } from "@/components/PlayerName";
import AccountAccess from "./AccountAccess";
import { ClearRejected, CorrectWhatsApp } from "./AdminFixes";
import Link from "next/link";
import { useEditSender } from "../client";
import { SOURCE_TAG } from "../labels";
import type { PlayerDetailsData } from "../types";
import { Feedback, XgId } from "../ui";
import WhatsAppSection from "./WhatsAppSection";

/**
 * Edit player details (shown in the slide-over drawer). The XG ID, results,
 * fixtures and standings never change here.
 */
export default function PlayerDetails({
  tournament,
  playerId,
  changed,
  retarget,
}: {
  tournament: string;
  playerId: string;
  changed: () => Promise<void>;
  /**
   * Opens the drawer in another tournament's context (or closes it with null)
   * after the entry it was opened from is removed.
   */
  retarget?: (tournament: string | null) => void;
}) {
  const [d, setD] = useState<PlayerDetailsData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const send = useEditSender();
  const load = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/admin?t=${encodeURIComponent(tournament)}&player=${encodeURIComponent(playerId)}`,
        { cache: "no-store" },
      );
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setD(v);
    } catch (e) {
      setError((e as Error).message || "Could not load the player.");
    }
  }, [tournament, playerId]);
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
    if (r.ok) {
      setNotice(
        r.data?.repeated === true
          ? "This request was already recorded. Review the current value below."
          : done,
      );
    } else setError(r.error!);
    // Reload either way: after a conflict the organizer sees the current values.
    await load();
    if (r.ok) await changed();
    setBusy(false);
    return r.ok;
  };

  const afterClear = async (entry: { tournament: string; label: string }) => {
    setError("");
    if (entry.tournament !== tournament) {
      setNotice(`Removed the rejected entry in ${entry.label}.`);
      await load();
      await changed();
      return;
    }
    // The drawer was opened from that entry: move to another one or close.
    await changed();
    const next = d?.entries.find(
      (e) =>
        !e.removed && !e.tournamentDeleted && e.tournament !== entry.tournament,
    );
    if (retarget) return retarget(next?.tournament ?? null);
    setGone(true);
    setNotice(
      `Removed the rejected entry in ${entry.label}. Close this panel to continue.`,
    );
  };

  return (
    <section
      className="space-y-5"
      aria-label="Edit player details"
      aria-busy={busy}
    >
      {d && (
        <p className="flex flex-wrap items-center gap-2">
          <XgId code={d.player.code} />
          <span className="text-slate-400">
            Permanent XG ID · never changes
          </span>
          {!d.player.removed && profileHref(d.player.code) && (
            <Link
              href={`/players/${d.player.code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="om-link ml-auto"
            >
              View public profile ↗
            </Link>
          )}
        </p>
      )}
      <p className="text-sm text-slate-400">
        The XG ID, results, fixtures and standings never change here. Every save
        needs a reason and is recorded in the activity log.
      </p>
      <Feedback error={error} notice={notice} />
      {!d && !error && <p className="text-slate-400">Loading…</p>}
      {d?.account && !d.player.removed && !gone && (
        <AccountAccess
          playerId={playerId}
          name={d.player.gaming_name}
          account={d.account}
          changed={load}
        />
      )}
      {d && (
        <fieldset disabled={busy || gone} className="space-y-5">
          {d.player.removed && (
            <p className="notice">
              This player record was removed, so it can&apos;t be edited.
            </p>
          )}
          <EditField
            key={JSON.stringify(["name", d.player.gaming_name])}
            label="Gaming name"
            name="name"
            current={d.player.gaming_name}
            editable={d.canEdit.name}
            note="Changes the name shown everywhere. Results stay with the same player."
            onSave={(value, reason) =>
              submit(
                "name",
                {
                  action: "player.edit_name",
                  tournament,
                  playerId,
                  expected: d.player.gaming_name,
                  name: value,
                  reason,
                },
                "Gaming name saved.",
              )
            }
          />
          <EditField
            key={JSON.stringify(["team", d.player.team_name])}
            label="Current team"
            name="team"
            current={d.player.team_name}
            editable={d.canEdit.team}
            note="The player's team from now on. It never changes a tournament's team."
            onSave={(value, reason) =>
              submit(
                "team",
                {
                  action: "player.edit_team",
                  tournament,
                  playerId,
                  expected: d.player.team_name,
                  team: value,
                  reason,
                },
                "Current team saved.",
              )
            }
          />
          {d.player.efootballVersion && (
            <EditField
              key={d.player.efootballVersion}
              label="eFootball ID"
              name="efootball"
              current={d.player.efootballId ?? null}
              editable={d.canEdit.efootball}
              mono
              note="Must be unique. Stored encrypted; the log never shows it."
              onSave={(value, reason) =>
                submit(
                  `efootball:${d.player.efootballVersion}`,
                  {
                    action: "player.edit_efootball",
                    tournament,
                    playerId,
                    expectedVersion: d.player.efootballVersion,
                    efootballId: value,
                    reason,
                  },
                  "eFootball ID saved.",
                )
              }
            />
          )}
          {d.contact && (
            <WhatsAppSection
              tournament={tournament}
              playerId={playerId}
              contact={d.contact}
              admin={d.role === "admin"}
              removed={d.player.removed}
              reload={async () => {
                await load();
                await changed();
              }}
            />
          )}
          {d.canEdit.correctWhatsApp && !gone && (
            <CorrectWhatsApp
              playerId={playerId}
              saved={async () => {
                await load();
                await changed();
              }}
            />
          )}
          {d.canEdit.tournamentTeams && (
            <div>
              <h3 className="font-semibold mb-2">Tournament entries</h3>
              <ul className="om-entry-list">
                {d.entries.map((e) => (
                  <li key={e.id} className="om-entry">
                    <div className="om-entry-head">
                      <span className="min-w-0 font-semibold">{e.label}</span>
                      <span
                        className={`om-status om-${e.removed ? "withdrawn" : e.status}`}
                      >
                        {e.removed ? "removed" : e.status}
                      </span>
                    </div>
                    <dl className="om-entry-facts">
                      <div>
                        <dt>Team</dt>
                        <dd>{e.team_name ?? "Not recorded"}</dd>
                      </div>
                      <div>
                        <dt>Source</dt>
                        <dd>
                          {e.team_name_source
                            ? SOURCE_TAG[e.team_name_source]
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Matches</dt>
                        <dd>{e.matches}</dd>
                      </div>
                    </dl>
                    {!e.removed && !e.tournamentDeleted && (
                      <div className="om-entry-actions">
                        <CorrectTeam
                          key={JSON.stringify([
                            e.team_name,
                            e.team_name_source,
                          ])}
                          entry={e}
                          onSave={(v) =>
                            submit(
                              `correct-${e.id}`,
                              {
                                action: "application.team_correct",
                                tournament: e.tournament,
                                applicationId: e.id,
                                expectedTeam: e.team_name,
                                expectedSource: e.team_name_source,
                                ...v,
                              },
                              `Team saved for ${e.label}.`,
                            )
                          }
                        />
                        {d.canEdit.clearRejected &&
                          e.status === "rejected" &&
                          e.matches === 0 && (
                            <ClearRejected
                              playerId={playerId}
                              entryId={e.id}
                              label={e.label}
                              cleared={() => afterClear(e)}
                            />
                          )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500 mt-2">
                Entries with no team can also be attested from Players →
                Team-name review.
              </p>
            </div>
          )}
          {d.history.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm">
                Changes to this player ({d.history.length})
              </summary>
              <ul className="mt-2 text-sm text-slate-400 space-y-1">
                {d.history.map((h) => (
                  <li key={h.id}>
                    {new Date(h.created_at).toLocaleString("en-IN")} ·{" "}
                    {h.actor_name ?? "—"} · {h.summary ?? h.action}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </fieldset>
      )}
    </section>
  );
}

function EditField({
  label,
  name,
  current,
  editable,
  note,
  mono,
  onSave,
}: {
  label: string;
  name: string;
  current: string | null;
  editable: boolean;
  note: string;
  mono?: boolean;
  onSave: (value: string, reason: string) => Promise<boolean>;
}) {
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        void onSave(
          String(f.get("value") ?? ""),
          String(f.get("reason") ?? ""),
        ).then((ok) => {
          if (ok) form.reset();
        });
      }}
    >
      <p className="font-semibold">{label}</p>
      <p className={mono ? "font-mono" : ""}>{current ?? "—"}</p>
      {editable && (
        <div className="grid gap-2 md:grid-cols-[1fr_1.4fr_auto]">
          <input
            name="value"
            required
            minLength={name === "efootball" ? 6 : 2}
            maxLength={name === "efootball" ? 32 : 40}
            placeholder={`New ${label.toLowerCase()}`}
            className={`control-input !mt-0 ${mono ? "font-mono uppercase" : ""}`}
            aria-label={`New ${label.toLowerCase()}`}
          />
          <input
            name="reason"
            required
            minLength={5}
            maxLength={300}
            placeholder="Reason (required)"
            className="control-input !mt-0"
            aria-label={`Reason for changing the ${label.toLowerCase()}`}
          />
          <button className="button-secondary">Save</button>
        </div>
      )}
      <p className="text-xs text-slate-500">{note}</p>
    </form>
  );
}

/** Set or correct one tournament's team, with a written evidence note. */
export function CorrectTeam({
  entry,
  onSave,
}: {
  entry: { label: string; team_name: string | null };
  onSave: (v: {
    team: string;
    evidence: string;
    reason: string;
    confirmOverwrite: boolean;
  }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button className="om-link" onClick={() => setOpen(true)}>
        {entry.team_name ? "Correct" : "Set with evidence"}
      </button>
    );
  return (
    <form
      className="space-y-2 w-full"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void onSave({
          team: String(f.get("team") ?? ""),
          evidence: String(f.get("evidence") ?? ""),
          reason: String(f.get("reason") ?? ""),
          confirmOverwrite: f.get("overwrite") === "on",
        }).then((ok) => ok && setOpen(false));
      }}
    >
      <input
        name="team"
        required
        minLength={2}
        maxLength={40}
        placeholder="Team in this tournament"
        className="control-input !mt-0"
        aria-label={`Team in ${entry.label}`}
      />
      <input
        name="evidence"
        required
        minLength={5}
        maxLength={300}
        placeholder="Evidence (e.g. WhatsApp registration message, 29 Oct)"
        className="control-input !mt-0"
        aria-label="Evidence"
      />
      <input
        name="reason"
        required
        minLength={5}
        maxLength={300}
        placeholder="Reason"
        className="control-input !mt-0"
        aria-label="Reason"
      />
      {entry.team_name && (
        <label className="flex gap-2 text-sm">
          <input type="checkbox" name="overwrite" required />
          Replace the recorded team &ldquo;{entry.team_name}&rdquo;
        </label>
      )}
      <div className="flex gap-2">
        <button className="button-secondary om-small">Save</button>
        <button
          type="button"
          className="om-link"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
