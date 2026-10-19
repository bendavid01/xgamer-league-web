"use client";
import { useState } from "react";
export default function FinalsAccess() {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="panel p-7 mt-8 max-w-2xl">
      <p className="text-slate-400 mb-6">
        Sign in with the Discord account verified by an organizer. Room details
        are released only to the eight qualified players. Keep them private.
      </p>
      <button
        disabled={busy}
        className="button-primary"
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/finals", { cache: "no-store" });
            const data = await r.json();
            setMessage(r.ok ? data.credentials : data.error);
          } catch {
            setMessage("Finals access is unavailable. Contact an organizer.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Checking access…" : "View my finals details"}
      </button>
      <p role="status" className="whitespace-pre-wrap mt-6">
        {message}
      </p>
    </div>
  );
}
