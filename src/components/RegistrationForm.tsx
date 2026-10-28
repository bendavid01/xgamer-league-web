"use client";
import { useState } from "react";

type Result =
  | { kind: "success"; status: string; playerId: string }
  | { kind: "error"; message: string }
  | null;

const STATUS_TEXT: Record<string, string> = {
  pending: "Received — waiting for organizer review",
  waitlisted: "Received — added to the waitlist (all slots are taken)",
};

export default function RegistrationForm({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  if (result?.kind === "success")
    return (
      <div className="panel p-6 md:p-8" role="status">
        <p className="eyebrow !mb-3">APPLICATION RECEIVED</p>
        <h2 className="text-2xl font-bold">
          {STATUS_TEXT[result.status] ?? "Received"}
        </h2>
        <p className="mt-4 text-slate-300">
          Your player ID — save a screenshot of this:
        </p>
        <p className="mt-2 font-mono text-cyan-200 break-all">
          {result.playerId}
        </p>
        <p className="mt-4 text-sm text-slate-400 leading-relaxed">
          An organizer will contact you on WhatsApp to verify your number before
          approving your entry. Submitting does not confirm your slot.
        </p>
      </div>
    );

  return (
    <form
      className="panel p-5 md:p-8 space-y-5"
      noValidate={false}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!enabled || busy) return;
        setBusy(true);
        setResult(null);
        const data = new FormData(event.currentTarget);
        try {
          const res = await fetch("/api/registrations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              gamingName: data.get("gamingName"),
              efootballId: data.get("efootballId"),
              whatsapp: data.get("whatsapp"),
              discord: data.get("discord") || undefined,
              website: data.get("website") ?? "",
              consent: data.get("consent") === "on",
              tournament: "xgamer-2026-10",
            }),
          });
          const body = await res.json().catch(() => ({}));
          setResult(
            res.ok
              ? {
                  kind: "success",
                  status: body.status,
                  playerId: body.playerId,
                }
              : {
                  kind: "error",
                  message:
                    body.error ??
                    "We could not confirm your application. Please try again later.",
                },
          );
        } catch {
          setResult({
            kind: "error",
            message:
              "We could not confirm submission. Contact an organizer before trying again if you are unsure.",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      {!enabled && (
        <p className="notice">
          Registration isn&apos;t open yet. You can see the details we&apos;ll
          ask for below — follow the announcements for the opening date.
        </p>
      )}
      <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
        <label className="block">
          <span className="field-label">In-game name</span>
          <input
            required
            name="gamingName"
            minLength={2}
            maxLength={40}
            className="control-input"
            autoComplete="nickname"
          />
          <span className="field-hint">
            Shown publicly in fixtures and standings.
          </span>
        </label>
        <label className="block">
          <span className="field-label">eFootball user ID</span>
          <input
            required
            name="efootballId"
            minLength={6}
            maxLength={32}
            pattern="[A-Za-z0-9-]{6,32}"
            className="control-input font-mono uppercase"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <span className="field-hint">
            Copy it from your eFootball profile. Never share your game password.
          </span>
        </label>
        <label className="block">
          <span className="field-label">WhatsApp number</span>
          <input
            required
            name="whatsapp"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={30}
            placeholder="98765 43210"
            className="control-input"
          />
          <span className="field-hint">
            Indian numbers can be entered without +91. Organizers use this to
            verify you and share match updates.
          </span>
        </label>
        <label className="block">
          <span className="field-label">
            Discord username <span className="text-slate-500">(optional)</span>
          </span>
          <input
            name="discord"
            maxLength={40}
            placeholder="your.username"
            className="control-input"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        <div hidden aria-hidden="true">
          <label>
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <label className="flex gap-3 text-sm leading-relaxed text-slate-300">
          <input
            required
            name="consent"
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0"
          />
          I agree to private storage of my game ID and contact details for entry
          verification and updates. My in-game name and results may be public. I
          can ask an organizer to remove my data.
        </label>
        <button
          className="button-primary w-full min-h-12"
          disabled={!enabled || busy}
        >
          {busy
            ? "Submitting…"
            : enabled
              ? "Submit registration"
              : "Registration not open yet"}
        </button>
      </fieldset>
      {result?.kind === "error" && (
        <p role="alert" className="text-rose-300 break-words">
          {result.message}
        </p>
      )}
    </form>
  );
}
