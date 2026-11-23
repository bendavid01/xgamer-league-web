"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { clearPlayerHint } from "../playerHint";
import s from "./player.module.css";

type Mode = "signin" | "claim";

/** "xg 7", "XG0007", " xg-0007 " → "XG-0007". Anything else is left as typed. */
export function tidyXgId(raw: string) {
  const m = /^\s*xg[\s-]*(\d{1,10})\s*$/i.exec(raw);
  return m ? `XG-${m[1].padStart(4, "0")}` : raw.trim().toUpperCase();
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    error: typeof json.error === "string" ? json.error : null,
  };
}

/** Card 1: XG tournament player sign-in, and claim/reset with an organizer's code. */
export default function LoginPortal({ available }: { available: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Signed-in players are redirected away from /login, so any navbar hint is stale.
  useEffect(() => clearPlayerHint(), []);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const xgId = tidyXgId(String(f.get("xgId") ?? ""));
    setBusy(true);
    setError(null);
    const nickname = String(f.get("displayNickname") ?? "").trim();
    const result =
      mode === "signin"
        ? await post("/api/player/login", { xgId, password: f.get("password") })
        : await post("/api/player/redeem-code", {
            xgId,
            code: f.get("code"),
            newPassword: f.get("newPassword"),
            ...(nickname ? { displayNickname: nickname } : {}),
          });
    if (result.ok) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }
    setBusy(false);
    setError(result.error ?? "We couldn't sign you in. Please try again.");
  };

  const choose = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  return (
    <section className={`${s.card} ${s.cardActive}`} aria-labelledby="xg-card">
      <div className={s.cardHead}>
        <span className={`${s.mark} ${s.markXg}`} aria-hidden="true">
          XG.
        </span>
        <div>
          <h2 id="xg-card" className={s.cardTitle}>
            Tournament Player
          </h2>
          <p className={s.cardSub}>Sign in with your permanent XG ID.</p>
        </div>
      </div>

      <div className={s.segment} role="tablist" aria-label="Player access">
        {(
          [
            ["signin", "Sign in"],
            ["claim", "Claim XG ID / Reset"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            id={`tab-${m}`}
            aria-selected={mode === m}
            aria-controls="player-form"
            className={s.tab}
            onClick={() => choose(m)}
          >
            {label}
          </button>
        ))}
      </div>

      {!available && (
        <p className={s.note}>
          Player sign-in isn&apos;t switched on yet. Your XG ID and results are
          safe; check back soon.
        </p>
      )}

      <form
        id="player-form"
        role="tabpanel"
        aria-labelledby={`tab-${mode}`}
        className={s.form}
        onSubmit={submit}
        key={mode}
      >
        <fieldset disabled={busy || !available} className={s.form}>
          <label className={s.field}>
            XG ID
            <input
              name="xgId"
              required
              maxLength={16}
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="XG-0001"
              className={`${s.input} ${s.mono}`}
              onBlur={(e) => {
                e.currentTarget.value = tidyXgId(e.currentTarget.value);
              }}
            />
          </label>
          {mode === "signin" ? (
            <label className={s.field}>
              Password
              <input
                name="password"
                type="password"
                required
                maxLength={256}
                autoComplete="current-password"
                className={s.input}
              />
            </label>
          ) : (
            <>
              <label className={s.field}>
                6-character WhatsApp code
                <input
                  name="code"
                  required
                  maxLength={12}
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="K7Q2XM"
                  className={`${s.input} ${s.mono}`}
                  onChange={(e) => {
                    e.currentTarget.value = e.currentTarget.value.toUpperCase();
                  }}
                />
                <span className={s.hint}>
                  An organizer sends this on WhatsApp. It works once and expires
                  after 24 hours.
                </span>
              </label>
              <label className={s.field}>
                New password
                <input
                  name="newPassword"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  className={s.input}
                />
                <span className={s.hint}>8–128 characters.</span>
              </label>
              <label className={s.field}>
                Display nickname <span className={s.hint}>(optional)</span>
                <input
                  name="displayNickname"
                  minLength={2}
                  maxLength={24}
                  autoComplete="nickname"
                  className={s.input}
                />
              </label>
              <p className={s.note}>
                Your first nickname locks once it&apos;s set, for fair play.
                Leave it blank to keep your current one.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className={s.error}>
              {error}
            </p>
          )}
          <button className={s.primary}>
            {busy
              ? "Checking…"
              : mode === "signin"
                ? "Sign in"
                : "Set password and sign in"}
          </button>
        </fieldset>
      </form>

      <p className={s.below}>
        New to XGamer?{" "}
        <Link href="/register" className={s.link}>
          Register for a tournament →
        </Link>
      </p>
    </section>
  );
}

/** Card 2: the community membership that isn't built yet. Visual only. */
export function MemberPreview() {
  return (
    <section
      className={`${s.card} ${s.locked}`}
      aria-labelledby="xgm-card"
      aria-describedby="xgm-soon"
    >
      <span
        className={`${s.pill} ${s.lockBadge}`}
        data-tone="violet"
        id="xgm-soon"
      >
        <Lock size={12} aria-hidden="true" /> Coming soon
      </span>
      <div className={s.cardHead}>
        <span className={`${s.mark} ${s.markXgm}`} aria-hidden="true">
          XGM.
        </span>
        <div>
          <h2 id="xgm-card" className={s.cardTitle}>
            Community Member
          </h2>
          <p className={s.cardSub}>For fans and the wider XGamer community.</p>
        </div>
      </div>
      <p className={s.cardSub}>
        A membership for people who follow the league without entering every
        tournament. Not available yet.
      </p>
      <ul className={s.lockList}>
        <li>Follow players and tournaments</li>
        <li>Community events and watch parties</li>
        <li>Member badge on Discord</li>
      </ul>
      <button type="button" className={s.ghost} disabled aria-disabled="true">
        <Lock size={15} aria-hidden="true" /> Membership opens later
      </button>
    </section>
  );
}
