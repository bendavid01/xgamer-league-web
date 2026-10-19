"use client";
import { useState } from "react";
export default function RegistrationForm({ enabled }: { enabled: boolean }) {
  const [preference, setPreference] = useState("whatsapp"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      className="panel p-6 md:p-10 space-y-6"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!enabled || busy) return;
        setBusy(true);
        setMessage("");
        const form = event.currentTarget;
        const data = new FormData(form);
        try {
          const res = await fetch("/api/registrations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...Object.fromEntries(data),
              consent: data.get("consent") === "on",
              tournament: "xgamer-2026-10",
            }),
          });
          const result = await res.json();
          setMessage(
            res.ok
              ? `Application received: ${result.status}. Your player ID is ${result.playerId}. Save this ID. An organizer will verify your contact before approval.`
              : result.error,
          );
          if (res.ok) form.reset();
        } catch {
          setMessage(
            "We could not confirm submission. Contact an organizer before trying again if you are unsure.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {!enabled && (
        <p className="notice">
          Applications are awaiting secure setup. No details can be submitted
          yet.
        </p>
      )}
      <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
        <label className="block">
          Gaming name
          <input
            required
            name="gamingName"
            minLength={2}
            maxLength={40}
            className="control-input"
            autoComplete="nickname"
          />
        </label>
        <label className="block">
          eFootball ID
          <input
            required
            name="efootballId"
            minLength={6}
            maxLength={32}
            className="control-input"
            autoComplete="off"
          />
          <span className="text-sm text-slate-400">
            Use your in-game ID. Never enter your game password.
          </span>
        </label>
        <label className="block">
          Contact preference
          <select
            name="preference"
            className="control-input"
            value={preference}
            onChange={(e) => setPreference(e.target.value)}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="discord">Discord</option>
          </select>
        </label>
        <label className="block">
          {preference === "whatsapp"
            ? "WhatsApp number, including +country code"
            : "Discord username"}
          <input
            required
            name="contact"
            className="control-input"
            maxLength={80}
            type={preference === "whatsapp" ? "tel" : "text"}
            placeholder={
              preference === "whatsapp" ? "+919876543210" : "your.username"
            }
          />
        </label>
        <div hidden aria-hidden="true">
          <label>
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <label className="flex gap-3 text-sm leading-relaxed">
          <input
            required
            name="consent"
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0"
          />
          I agree to private storage of my game ID and contact for entry
          verification and updates. My gaming name and results may be public. I
          can ask an organizer to remove my private data.
        </label>
        <button className="button-primary w-full" disabled={!enabled || busy}>
          {busy ? "Submitting…" : "Submit application ↗"}
        </button>
      </fieldset>
      <p role="status" className="text-cyan-200 break-words">
        {message}
      </p>
      <p className="text-xs text-slate-400">
        Submitting an application does not confirm approval.
      </p>
    </form>
  );
}
