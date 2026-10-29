import { ArrowUpRight } from "lucide-react";
import type { LiveStream } from "@/lib/youtube";

/** Shown only while the official channel is live. */
export default function LiveNow({ stream }: { stream: LiveStream }) {
  return (
    <a
      href={stream.url}
      target="_blank"
      rel="noopener noreferrer"
      className="live-banner"
    >
      <span className="live-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail, not optimised by Next */}
        <img
          src={stream.thumbnail}
          alt=""
          width={160}
          height={90}
          loading="lazy"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="live-pill">
          <span className="live-dot" aria-hidden="true" /> LIVE NOW
        </span>
        <span className="live-title">{stream.title}</span>
      </span>
      <span className="live-cta">
        Watch on YouTube <ArrowUpRight size={16} aria-hidden="true" />
        <span className="sr-only"> (opens in a new tab)</span>
      </span>
    </a>
  );
}
