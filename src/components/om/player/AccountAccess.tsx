"use client";
import { useState } from "react";
import { Copy, KeyRound, MessageCircle } from "lucide-react";
import type { PlayerDetailsData } from "../types";
import { Feedback } from "../ui";

type Issued = {
  xgId: string;
  purpose: "claim" | "reset";
  code: string;
  expiresAt: string;
};

/**
 * Account Access (main admins, registered players only): one-time claim and
 * reset codes to send on WhatsApp. The code is shown once and lives only in
 * this component's state, which is discarded when the drawer closes.
 */
export default function AccountAccess({
  playerId,
  name,
  account,
  changed,
}: {
  playerId: string;
  name: string;
  account: NonNullable<PlayerDetailsData["account"]>;
  /** Reloads the drawer (the claimed state and history). */
  changed: () => Promise<void>;
}) {
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  if (account.type !== "registered") return null;

  const generate = async (purpose: Issued["purpose"]) => {
    setBusy(true);
    setError("");
    setCopied("");
    setIssued(null);
    try {
      const res = await fetch(
        `/api/admin/players/${encodeURIComponent(playerId)}/one-time-code`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purpose }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not create a code.");
      setIssued({
        xgId: body.xgId,
        purpose: body.purpose,
        code: body.code,
        expiresAt: body.expiresAt,
      });
      await changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const message = issued
    ? `Hi ${name}! Your XGamer ${issued.purpose === "claim" ? "account claim" : "password reset"} code for ${issued.xgId} is ${issued.code}. Go to ${window.location.origin}/login, choose "Claim XG ID / Reset", and enter your XG ID, this code and a new password. The code works once and expires in 24 hours. Please don't share it with anyone.`
    : "";
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setError(
        "Copy didn't work in this browser. Select the code and copy it.",
      );
    }
  };

  return (
    <section className="om-card space-y-3" aria-labelledby="account-access">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id="account-access" className="font-bold">
          Account access
        </h4>
        <span className="text-sm text-slate-400">
          {account.claimed
            ? account.lastLoginAt
              ? `Login active · last sign-in ${new Date(account.lastLoginAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}`
              : "Login active"
            : "Login not activated yet"}
        </span>
      </div>
      <p className="text-sm text-slate-400">
        Codes are 6 characters, work once and expire after 24 hours. A new code
        replaces any earlier one of the same kind. Send it only to the
        player&apos;s verified WhatsApp number.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="button-secondary om-small"
          disabled={busy || account.claimed}
          onClick={() => void generate("claim")}
          title={
            account.claimed ? "This account is already claimed." : undefined
          }
        >
          <KeyRound size={15} aria-hidden="true" /> Generate Claim Code
        </button>
        <button
          type="button"
          className="button-secondary om-small"
          disabled={busy || !account.claimed}
          onClick={() => void generate("reset")}
          title={
            account.claimed
              ? undefined
              : "Activate the login with a claim code first."
          }
        >
          <KeyRound size={15} aria-hidden="true" /> Generate Password Reset Code
        </button>
      </div>
      <Feedback error={error} notice="" />
      {issued && (
        <div className="om-code-panel" role="status" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            <code
              className="om-code"
              aria-label={`Code ${issued.code.split("").join(" ")}`}
            >
              {issued.code}
            </code>
            <span className="om-code-expiry">Expires in 24h</span>
            <span className="text-sm text-slate-400">
              {issued.purpose === "claim" ? "Claim" : "Password reset"} ·{" "}
              {issued.xgId}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Shown once. It isn&apos;t stored and disappears when you close this
            panel.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="button-secondary om-small"
              onClick={() => void copy(issued.code, "code")}
            >
              <Copy size={15} aria-hidden="true" /> Copy Code
            </button>
            <button
              type="button"
              className="button-primary om-small"
              onClick={() => void copy(message, "message")}
            >
              <MessageCircle size={15} aria-hidden="true" /> Copy WhatsApp
              Message
            </button>
            <button
              type="button"
              className="button-secondary om-small"
              onClick={() => {
                setIssued(null);
                setCopied("");
              }}
            >
              Done
            </button>
          </div>
          {copied && (
            <p className="text-sm text-cyan-200" role="status">
              {copied === "code" ? "Code copied." : "WhatsApp message copied."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
