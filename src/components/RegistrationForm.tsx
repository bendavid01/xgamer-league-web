"use client";
import { useState } from "react";

type Result = { kind: "success" } | { kind: "error"; message: string } | null;

export default function RegistrationForm({
  tournament,
}: {
  /** Tournament the entry goes to; null while no tournament is open. */
  tournament: string | null;
}) {
  const enabled = !!tournament;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  if (result?.kind === "success")
    return (
      <div className="panel p-6 md:p-10" role="status">
        <p className="eyebrow">REGISTRATION RECEIVED</p>
        <h2 className="text-3xl font-bold">You&apos;re on the list.</h2>
        <p className="text-slate-300 mt-4 leading-relaxed">
          An organizer will message you on WhatsApp to confirm your entry. Keep
          your eFootball ID ready — they&apos;ll ask for it after you&apos;re
          approved.
        </p>
      </div>
    );

  return (
    <form
      className="panel p-6 md:p-10 space-y-6"
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
              playerName: data.get("playerName"),
              teamName: data.get("teamName"),
              phone: data.get("phone"),
              website: data.get("website") ?? "",
              consent: data.get("consent") === "on",
              tournament,
            }),
          });
          const body = await res.json().catch(() => ({}));
          setResult(
            res.ok
              ? { kind: "success" }
              : {
                  kind: "error",
                  message:
                    body.error ??
                    "We couldn't confirm your registration. Please try again.",
                },
          );
        } catch {
          setResult({
            kind: "error",
            message:
              "We couldn't confirm your registration. Check your connection and try again.",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      {!enabled && (
        <p className="notice">
          Registration isn&apos;t open right now. Follow our Discord or WhatsApp
          group to hear when it opens.
        </p>
      )}
      {/* WHY: fields stay editable while closed; only submitting waits for registration to open. */}
      <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
        <label className="block">
          Player name
          <input
            required
            name="playerName"
            minLength={2}
            maxLength={40}
            className="control-input"
            autoComplete="nickname"
            placeholder="The name you play as"
          />
        </label>
        <label className="block">
          Team name
          <input
            required
            name="teamName"
            minLength={2}
            maxLength={40}
            className="control-input"
            autoComplete="off"
            placeholder="Your eFootball team"
          />
        </label>
        <label className="block">
          WhatsApp number
          <span className="phone-field">
            <span className="phone-prefix" aria-hidden="true">
              +91
            </span>
            <input
              required
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              minLength={10}
              maxLength={10}
              pattern="[6-9][0-9]{9}"
              title="10-digit Indian mobile number"
              className="control-input"
              placeholder="9876543210"
              aria-describedby="phone-hint"
              onInput={(e) => {
                // Digits only; a pasted +91 / 0 prefix is dropped.
                const el = e.currentTarget;
                let d = el.value.replace(/\D/g, "");
                if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
                if (d.length > 10 && d.startsWith("0")) d = d.slice(1);
                el.value = d.slice(0, 10);
              }}
            />
          </span>
          <span id="phone-hint" className="block mt-2 text-sm text-slate-400">
            10-digit Indian mobile number. Only organizers see it.
          </span>
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
          I agree to XGamer storing my details privately to confirm my entry and
          send match updates. My player and team name may appear on the website.
        </label>
        <button
          className="button-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!enabled}
        >
          {busy
            ? "Registering…"
            : enabled
              ? "Register"
              : "Registration opens soon"}
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
