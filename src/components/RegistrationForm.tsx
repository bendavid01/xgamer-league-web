"use client";
import { useState } from "react";

type Tier = "registered" | "guest";
type Result =
  | { kind: "success"; reference?: string; tier?: Tier }
  | { kind: "error"; message: string }
  | null;

/** Checked here for a quick answer; the server applies the same rules. */
function accountProblem(data: FormData) {
  const password = String(data.get("password") ?? "");
  const nickname = String(data.get("displayNickname") ?? "").trim();
  if ([...nickname].length < 2 || [...nickname].length > 24)
    return "Display nicknames are 2–24 characters.";
  if (password.length < 8 || password.length > 128)
    return "Passwords are 8–128 characters.";
  if (password !== data.get("confirmPassword"))
    return "The two passwords don't match.";
  return null;
}

export default function RegistrationForm({
  tournament,
}: {
  /** Tournament the entry goes to; null while no tournament is open. */
  tournament: string | null;
}) {
  const enabled = !!tournament;
  const [kind, setKind] = useState<"new" | "existing">("new");
  const [tier, setTier] = useState<Tier>("registered");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  if (result?.kind === "success")
    return (
      <div className="panel p-6 md:p-10" role="status">
        <p className="eyebrow">REGISTRATION RECEIVED</p>
        <h2 className="text-3xl font-bold">Request received.</h2>
        {result.reference ? (
          <>
            <p className="mt-4">Application reference</p>
            <code className="block mt-2 break-all text-cyan-200">
              {result.reference}
            </code>
            <p className="text-slate-300 mt-4 leading-relaxed">
              Share your reference privately with an organizer on Discord.{" "}
              {result.tier === "guest"
                ? "If they approve it, you play this tournament as a guest."
                : "If they approve it, you receive your permanent XG ID and can sign in at /login with the password you chose."}
            </p>
          </>
        ) : (
          <p className="text-slate-300 mt-4 leading-relaxed">
            Message an organizer privately on Discord to verify your XG ID and
            WhatsApp number. Your entry is pending until they approve it.
          </p>
        )}
      </div>
    );

  return (
    <form
      className="panel reg-card space-y-6"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!enabled || busy) return;
        setBusy(true);
        setResult(null);
        const data = new FormData(event.currentTarget);
        const registered = kind === "new" && tier === "registered";
        const problem = registered ? accountProblem(data) : null;
        if (problem) {
          setResult({ kind: "error", message: problem });
          setBusy(false);
          return;
        }
        try {
          const res = await fetch("/api/registrations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind,
              ...(kind === "existing"
                ? { xgId: data.get("xgId") }
                : {
                    playerName: data.get("playerName"),
                    tier,
                    ...(registered
                      ? {
                          password: data.get("password"),
                          displayNickname: String(
                            data.get("displayNickname") ?? "",
                          ).trim(),
                        }
                      : {}),
                  }),
              teamName: data.get("teamName"),
              phone: data.get("phone"),
              website: data.get("website") ?? "",
              consent: data.get("consent") === "on",
              tournament,
            }),
          });
          const body = await res.json().catch(() => ({}));
          setResult(
            res.ok &&
              (kind === "existing" || typeof body.reference === "string")
              ? {
                  kind: "success",
                  reference: kind === "new" ? body.reference : undefined,
                  tier: kind === "new" ? tier : undefined,
                }
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
      <fieldset disabled={busy} className="space-y-7 disabled:opacity-60">
        <fieldset className="reg-switch" data-active={kind}>
          <legend className="sr-only">Register as</legend>
          <span className="reg-switch-thumb" aria-hidden="true" />
          {(
            [
              ["new", "New Player"],
              ["existing", "Existing Player"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="reg-switch-option">
              <input
                type="radio"
                name="registrationKind"
                value={value}
                checked={kind === value}
                className="sr-only"
                onChange={() => {
                  setKind(value);
                  setResult(null);
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <section className="reg-section" aria-labelledby="reg-account">
          <h2 id="reg-account" className="reg-section-title">
            <span aria-hidden="true">1.</span> Player Account
          </h2>
          {kind === "new" && (
            <fieldset className="tier-choice">
              <legend className="reg-label">How do you want to play?</legend>
              <div className="tier-grid">
                <label className="tier-option">
                  <input
                    type="radio"
                    name="tier"
                    value="registered"
                    checked={tier === "registered"}
                    onChange={() => {
                      setTier("registered");
                      setResult(null);
                    }}
                  />
                  <span>
                    <strong>
                      Registered XG Player{" "}
                      <span className="tier-tag">Recommended</span>
                    </strong>
                    <span className="block text-sm text-slate-400 mt-1">
                      Once approved: a permanent XG ID, public profile, career
                      stats and a Player Hub login.
                    </span>
                  </span>
                </label>
                <label className="tier-option">
                  <input
                    type="radio"
                    name="tier"
                    value="guest"
                    checked={tier === "guest"}
                    onChange={() => {
                      setTier("guest");
                      setResult(null);
                    }}
                  />
                  <span>
                    <strong>Single-Tournament Guest</strong>
                    <span className="block text-sm text-slate-400 mt-1">
                      Play this tournament only. No account, no XG ID.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
          )}
          {kind === "new" && tier === "guest" && (
            <p className="guest-warning" role="note">
              <strong>Playing as a Guest?</strong> Your name will appear only
              on this tournament&apos;s fixtures and standings. You will not
              receive a permanent XG ID, public profile page, career stats, or
              all-time rankings—stats only track once you hold an approved XG
              ID.
            </p>
          )}
          {kind === "existing" ? (
            <label className="block">
              Permanent XG ID
              <input
                key="xgId"
                required
                name="xgId"
                maxLength={16}
                className="control-input"
                autoComplete="off"
                placeholder="XG-0007"
                aria-describedby="xgid-hint"
              />
              <span id="xgid-hint" className="reg-hint">
                The ID on your player profile. An organizer checks it against
                your WhatsApp number.
              </span>
            </label>
          ) : (
            <div
              className={
                tier === "registered" ? "grid gap-5 sm:grid-cols-2" : undefined
              }
            >
              <label className="block">
                Gaming name
                <input
                  key="playerName"
                  required
                  name="playerName"
                  minLength={2}
                  maxLength={40}
                  className="control-input"
                  autoComplete="nickname"
                  placeholder="e.g. Arjun Nair"
                  aria-describedby="name-hint"
                />
                <span id="name-hint" className="reg-hint">
                  Your in-game name, used on fixtures and the tournament roster.
                </span>
              </label>
              {tier === "registered" && (
                <label className="block">
                  Display nickname
                  <input
                    required
                    name="displayNickname"
                    minLength={2}
                    maxLength={24}
                    className="control-input"
                    autoComplete="off"
                    placeholder="e.g. The Wall"
                    aria-describedby="nickname-hint"
                  />
                  <span id="nickname-hint" className="reg-hint">
                    Your public profile handle (2–24 characters). Locked once
                    you&apos;re approved.
                  </span>
                </label>
              )}
            </div>
          )}
          {kind === "new" && tier === "registered" && (
            <div>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block">
                  Password
                  <input
                    required
                    name="password"
                    type="password"
                    minLength={8}
                    maxLength={128}
                    className="control-input"
                    autoComplete="new-password"
                    aria-describedby="password-hint"
                  />
                </label>
                <label className="block">
                  Confirm password
                  <input
                    required
                    name="confirmPassword"
                    type="password"
                    minLength={8}
                    maxLength={128}
                    className="control-input"
                    autoComplete="new-password"
                    aria-describedby="password-hint"
                  />
                </label>
              </div>
              <p id="password-hint" className="reg-hint">
                At least 8 characters. Once approved, you sign in to the Player
                Hub with your XG ID and this password.
              </p>
            </div>
          )}
        </section>

        <section className="reg-section" aria-labelledby="reg-entry">
          <h2 id="reg-entry" className="reg-section-title">
            <span aria-hidden="true">2.</span> Tournament Entry
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
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
              {kind === "existing" ? (
                <input
                  key="existingPhone"
                  required
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  maxLength={32}
                  className="control-input"
                  aria-describedby="phone-hint"
                />
              ) : (
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
              )}
              <span id="phone-hint" className="reg-hint">
                {kind === "existing"
                  ? "A number you control. Include the country code outside India."
                  : "A 10-digit Indian mobile number you control."}
              </span>
            </label>
          </div>
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
            I agree to XGamer storing my details privately to confirm my entry
            and send match updates. My player and team name may appear on the
            website.
          </label>
        </section>
        <button
          className="button-primary reg-submit w-full disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!enabled}
        >
          {busy
            ? "Registering…"
            : enabled
              ? kind === "existing"
                ? "Submit for verification"
                : "Register"
              : "Registration closed"}
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
