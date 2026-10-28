"use client";
import { useEffect, useState } from "react";

/** Live countdown to a real published time. Renders nothing before hydration or after the time passes. */
export default function Countdown({
  target,
  label,
}: {
  target: string;
  label: string;
}) {
  const end = new Date(target).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  if (now === null || Number.isNaN(end) || end <= now) return null;
  const s = Math.floor((end - now) / 1000);
  const parts = [
    [Math.floor(s / 86400), "days"],
    [Math.floor((s % 86400) / 3600), "hrs"],
    [Math.floor((s % 3600) / 60), "min"],
    [s % 60, "sec"],
  ] as const;
  return (
    <div className="countdown" role="timer" aria-live="off">
      <p className="countdown-label">{label}</p>
      <div className="countdown-digits">
        {parts.map(([value, unit]) => (
          <span key={unit} className="countdown-cell">
            <strong>{String(value).padStart(2, "0")}</strong>
            <small>{unit}</small>
          </span>
        ))}
      </div>
    </div>
  );
}
