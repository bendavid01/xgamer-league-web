"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Feedback } from "../ui";

/** Sends one main-admin correction; the server answers with { error } on failure. */
async function call(
  url: string,
  method: "POST" | "DELETE",
  value: Record<string, unknown>,
): Promise<
  { ok: true; data: Record<string, unknown> } | { ok: false; error: string }
> {
  try {
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok)
      return { ok: false, error: data.error ?? "Something went wrong." };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "No connection. Nothing was saved." };
  }
}

const reasonProblem = (reason: string) =>
  reason.trim().length < 3
    ? "Give a reason of at least 3 characters."
    : reason.trim().length > 200
      ? "Keep the reason under 200 characters."
      : "";

/**
 * Correct WhatsApp (main admins): for a number that was wrong from the start.
 * Only the form: the Contact card's action row opens it (WhatsAppSection.tsx),
 * so it never competes with the verified change.
 */
export function CorrectWhatsApp({
  id,
  playerId,
  saved,
  cancel,
}: {
  id?: string;
  playerId: string;
  /** Closes the form, shows the result and reloads the drawer and Players list. */
  saved: (notice: string) => Promise<void>;
  cancel: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);

  const phoneProblem = !phone.trim()
    ? "Enter the new WhatsApp number."
    : !/^\+?[0-9 ().-]+$/.test(phone.trim())
      ? "Use digits, spaces or dashes, with an optional + at the start."
      : phone.replace(/\D/g, "").length < 10
        ? "That number looks too short."
        : "";
  const problem = phoneProblem || reasonProblem(reason);

  return (
    <form
      id={id}
      className="om-fix om-subpanel space-y-3"
      aria-label="Correct WhatsApp number"
      noValidate
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) cancel();
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        setTouched(true);
        setError("");
        if (problem) return;
        setBusy(true);
        const r = await call(
          `/api/admin/players/${encodeURIComponent(playerId)}/whatsapp`,
          "POST",
          { whatsapp: phone.trim(), reason: reason.trim() },
        );
        setBusy(false);
        if (!r.ok) return setError(r.error);
        const cancelled = Number(r.data.cancelledChanges ?? 0);
        await saved(
          `WhatsApp number corrected to ${String(r.data.masked ?? "the new number")}.${cancelled ? " The open number change was cancelled." : ""}`,
        );
      }}
    >
      <div>
        <p className="font-semibold">Correct WhatsApp number</p>
        <p className="om-hint">
          Fix a wrong number entered at signup. Saves immediately. Switched
          numbers? Use Change WhatsApp number.
        </p>
      </div>
      <div className="om-fix-grid">
        <label className="om-fix-field">
          <span>New WhatsApp</span>
          <input
            className="control-input !mt-0 font-mono"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            maxLength={32}
            placeholder="+91 98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={touched && !!phoneProblem}
            aria-describedby="fix-phone-help"
          />
          <small
            id="fix-phone-help"
            className={touched && phoneProblem ? "text-amber-200" : ""}
          >
            {touched && phoneProblem
              ? phoneProblem
              : "Indian numbers can skip +91."}
          </small>
        </label>
        <label className="om-fix-field">
          <span>Reason</span>
          <input
            className="control-input !mt-0"
            maxLength={200}
            placeholder="Initial wrong number fix"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={touched && !!reasonProblem(reason)}
            aria-describedby="fix-reason-help"
          />
          <small
            id="fix-reason-help"
            className={touched && reasonProblem(reason) ? "text-amber-200" : ""}
          >
            {touched && reasonProblem(reason)
              ? reasonProblem(reason)
              : "3–200 characters. No phone numbers here."}
          </small>
        </label>
      </div>
      <Feedback error={error} notice="" />
      <div className="flex flex-wrap gap-2">
        <button className="button-primary om-small" disabled={busy}>
          {busy ? "Saving…" : "Save number"}
        </button>
        <button
          type="button"
          className="button-secondary om-small"
          disabled={busy}
          onClick={cancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Remove a rejected entry with no matches (main admins): reason first, then an
 * explicit confirmation.
 */
export function ClearRejected({
  playerId,
  entryId,
  label,
  cleared,
}: {
  playerId: string;
  entryId: string;
  label: string;
  cleared: () => Promise<void>;
}) {
  const [step, setStep] = useState<"idle" | "reason" | "confirm">("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);

  if (step === "idle")
    return (
      <button
        type="button"
        className="om-link om-danger-link"
        onClick={() => setStep("reason")}
      >
        <Trash2 size={14} aria-hidden="true" /> Remove rejected entry
      </button>
    );

  const problem = reasonProblem(reason);
  return (
    <div
      className="om-fix space-y-2"
      role="group"
      aria-label={`Remove rejected entry in ${label}`}
    >
      {step === "reason" ? (
        <form
          className="space-y-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!problem) setStep("confirm");
          }}
        >
          <label className="om-fix-field">
            <span>Reason for removing</span>
            <input
              className="control-input !mt-0"
              maxLength={200}
              placeholder="Old registration on a reserved ID"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={touched && !!problem}
              autoFocus
            />
            {touched && problem && (
              <small className="text-amber-200">{problem}</small>
            )}
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="button-secondary om-small">Continue</button>
            <button
              type="button"
              className="om-link"
              onClick={() => {
                setStep("idle");
                setTouched(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">
            Remove the rejected entry in <strong>{label}</strong>? It disappears
            from this player&apos;s entries. The audit log keeps a record.
          </p>
          <Feedback error={error} notice="" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="button-primary om-small om-danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                const r = await call(
                  `/api/admin/players/${encodeURIComponent(playerId)}/rejected-entries/${encodeURIComponent(entryId)}`,
                  "DELETE",
                  { reason: reason.trim() },
                );
                setBusy(false);
                if (!r.ok) return setError(r.error);
                await cleared();
              }}
            >
              {busy ? "Removing…" : "Yes, remove entry"}
            </button>
            <button
              type="button"
              className="om-link"
              disabled={busy}
              onClick={() => setStep("reason")}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
