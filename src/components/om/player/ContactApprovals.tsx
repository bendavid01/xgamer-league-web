"use client";
import { useCallback, useEffect, useState } from "react";
import { useEditSender } from "../client";
import { EVIDENCE_LABEL } from "../labels";
import type { ContactChangeRow } from "../types";
import { Feedback, XgId } from "../ui";
import { CloseContactChange } from "./WhatsAppSection";

/** Players → WhatsApp changes: the second admin's review (main admins). */
export default function ContactApprovals({
  changed,
}: {
  changed?: () => void;
}) {
  const [data, setData] = useState<{
    editingOn: boolean;
    changes: ContactChangeRow[];
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const send = useEditSender();
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin?contactChanges=1", {
        cache: "no-store",
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setData(v);
    } catch (e) {
      setError((e as Error).message || "Could not load number changes.");
    }
  }, []);
  useEffect(() => {
    const go = async () => {
      await load();
    };
    void go();
  }, [load]);
  const post = async (
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
    return r;
  };
  return (
    <section className="panel p-4 md:p-7 space-y-5" aria-labelledby="wa-title">
      <div>
        <h2 id="wa-title" className="text-2xl font-bold">
          WhatsApp number changes
        </h2>
        <p className="text-slate-400 mt-1 text-sm">
          The requesting admin conducts and records the verification. A
          different main admin reviews that record and the supporting evidence,
          then approves or rejects the request.
          {data &&
            !data.editingOn &&
            " Number editing is currently switched off."}
        </p>
      </div>
      <Feedback error={error} notice={notice} />
      {data && !data.changes.length && (
        <p className="text-slate-300">No open number changes.</p>
      )}
      <fieldset disabled={busy || !data?.editingOn} className="space-y-3">
        {data?.changes.map((c) => (
          <article key={c.id} className="om-card space-y-2">
            <p>
              <strong>{c.gaming_name}</strong>{" "}
              <span className="text-slate-400">
                · <XgId code={c.code} /> · new number {c.newNumber} · started by{" "}
                {c.requestedByName ?? "an admin"}
              </span>
            </p>
            <p className="text-sm">
              {c.route === "established_channel"
                ? "Established channel"
                : `Evidence: ${EVIDENCE_LABEL[c.evidenceType ?? ""] ?? c.evidenceType}${c.evidenceObservedAt ? `, observed ${new Date(c.evidenceObservedAt).toLocaleString("en-IN")}` : ""}${c.challengeConfirmedAt ? " (challenge confirmed)" : ""}`}
            </p>
            {c.evidenceNote && (
              <p className="text-sm text-slate-300">
                Verification record: {c.evidenceNote}
              </p>
            )}
            {c.route === "independent_evidence" && c.codeCheckedAt && (
              <p className="text-sm text-slate-300">
                Verification code check recorded on{" "}
                {new Date(c.codeCheckedAt).toLocaleString("en-IN")}.
              </p>
            )}
            {c.reason && (
              <p className="text-sm text-slate-400">Reason: {c.reason}</p>
            )}
            <p className="text-sm text-slate-400">
              {c.status === "pending_code"
                ? "Waiting for the code from the new number."
                : `Waiting for a second admin until ${new Date(c.approveBy!).toLocaleString("en-IN")}.`}
            </p>
            {c.status === "awaiting_second_admin" && !c.requestedByMe && (
              <>
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void post(
                      `approve-${c.id}`,
                      {
                        action: "contact.change_approve",
                        tournament: c.tournament,
                        changeId: c.id,
                        reviewed: f.get("reviewed") === "on",
                        reason: String(f.get("reason") ?? ""),
                      },
                      `Number changed for ${c.gaming_name}.`,
                    );
                  }}
                >
                  <label className="flex gap-2 text-sm">
                    <input type="checkbox" name="reviewed" required />I have
                    independently reviewed the requesting administrator&apos;s
                    verification record and supporting evidence. Based on the
                    documented checks, I confirm that the required verification
                    procedure was completed and approve this contact change.
                  </label>
                  <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                    <input
                      name="reason"
                      required
                      minLength={5}
                      maxLength={300}
                      placeholder="Your reason (no phone numbers)"
                      className="control-input !mt-0"
                      aria-label="Reason for approving"
                    />
                    <button className="button-primary">Approve</button>
                  </div>
                </form>
                <CloseContactChange
                  reject
                  onClose={(reason) =>
                    post(
                      `reject-${c.id}`,
                      {
                        action: "contact.change_reject",
                        tournament: c.tournament,
                        changeId: c.id,
                        reason,
                      },
                      "Number change rejected.",
                    )
                  }
                />
              </>
            )}
            {c.status === "awaiting_second_admin" && c.requestedByMe && (
              <p className="text-sm text-amber-200">
                You started this change, so another main admin must review it.
              </p>
            )}
            {(c.status !== "awaiting_second_admin" || c.requestedByMe) && (
              <CloseContactChange
                onClose={(reason) =>
                  post(
                    `cancel-${c.id}`,
                    {
                      action: "contact.change_cancel",
                      tournament: c.tournament,
                      changeId: c.id,
                      reason,
                    },
                    "Number change cancelled.",
                  )
                }
              />
            )}
          </article>
        ))}
      </fieldset>
    </section>
  );
}
