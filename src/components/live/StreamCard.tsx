import { CircleAlert, ExternalLink, Heart, Play } from "lucide-react";
import type { ChannelStatus } from "@/lib/live";

const BADGE: Record<ChannelStatus["platform"], string> = {
  youtube: "YT",
  twitch: "TW",
  kick: "K",
};

/** One official XGamer channel: LIVE, Offline or Unavailable. Shared everywhere. */
export default function StreamCard({ c }: { c: ChannelStatus }) {
  const live = c.state === "live";
  return (
    <article className={`stream-card stream-${c.platform} stream-${c.state}`}>
      <header className="stream-head">
        <span className="stream-badge" aria-hidden="true">
          {BADGE[c.platform]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="stream-name">{c.name}</span>
          <span className="stream-handle">{c.handle}</span>
        </span>
        <span className={`stream-state stream-state-${c.state}`}>
          {live ? (
            <>
              <span className="live-dot" aria-hidden="true" /> LIVE
            </>
          ) : c.state === "offline" ? (
            "Offline"
          ) : (
            <>
              <CircleAlert size={13} aria-hidden="true" /> Unavailable
            </>
          )}
        </span>
      </header>
      <div className="stream-body">
        <div className="stream-thumb" aria-hidden={!live || !c.thumbnail}>
          {live && c.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- platform thumbnail, not optimised by Next
            <img
              src={c.thumbnail}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="stream-thumb-mark">
              XGAMER
              {c.state !== "unavailable" && (
                <small>{live ? "LIVE" : "OFFLINE"}</small>
              )}
            </span>
          )}
        </div>
        <div className="min-w-0">
          {live ? (
            <>
              <p className="stream-title">{c.title}</p>
              <p className="stream-sub">XGamer LIVE on {c.name}</p>
            </>
          ) : c.state === "offline" ? (
            <>
              <p className="stream-title">Not streaming right now</p>
              <p className="stream-sub">
                Follow the channel for future streams
              </p>
            </>
          ) : (
            <>
              <p className="stream-title">Status temporarily unavailable</p>
              <p className="stream-sub">Please try again later</p>
            </>
          )}
        </div>
      </div>
      {live && c.watchUrl ? (
        <a
          href={c.watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="stream-button stream-button-live"
        >
          <Play size={16} aria-hidden="true" /> Watch Live
          <ExternalLink size={14} aria-hidden="true" />
          <span className="sr-only"> on {c.name} (opens in a new tab)</span>
        </a>
      ) : (
        <a
          href={c.channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="stream-button"
        >
          <Heart size={16} aria-hidden="true" /> Visit Channel
          <ExternalLink size={14} aria-hidden="true" />
          <span className="sr-only"> on {c.name} (opens in a new tab)</span>
        </a>
      )}
    </article>
  );
}
