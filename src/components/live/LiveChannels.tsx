"use client";
import { useEffect, useState } from "react";
import StreamCard from "./StreamCard";
import type { ChannelStatus } from "@/lib/live";

/**
 * The three official channels, refreshed from /api/live about once a minute
 * while the page is visible. Starts from the server's data (no flash).
 */
export default function LiveChannels({
  initial,
  refreshSeconds,
}: {
  initial: ChannelStatus[];
  refreshSeconds: number;
}) {
  const [channels, setChannels] = useState(initial);
  const [checked, setChecked] = useState<Date | null>(null);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/live", { cache: "no-store" });
        if (!r.ok) return;
        const next = (await r.json()) as { channels?: ChannelStatus[] };
        if (!stop && Array.isArray(next.channels)) {
          setChannels(next.channels);
          setChecked(new Date());
        }
      } catch {
        /* keep the last known state */
      }
    };
    const id = window.setInterval(tick, refreshSeconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stop = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refreshSeconds]);
  return (
    <>
      <ul className="stream-grid" aria-live="polite">
        {channels.map((c) => (
          <li key={c.platform}>
            <StreamCard c={c} />
          </li>
        ))}
      </ul>
      <p className="stream-foot">
        Status updates automatically about every minute
        {checked
          ? ` · last checked ${checked.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
          : ""}
        .
      </p>
    </>
  );
}
