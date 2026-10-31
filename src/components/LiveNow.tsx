import Link from "next/link";
import { ArrowRight, ExternalLink, Play } from "lucide-react";
import type { ChannelStatus } from "@/lib/live";

/** Homepage strip, shown only while an official channel is confirmed live. */
export default function LiveNow({ live }: { live: ChannelStatus[] }) {
  if (!live.length) return null;
  return (
    <section className="page-shell live-now" aria-label="XGamer is live">
      {live.map((c) => (
        <div key={c.platform} className="live-banner">
          <span className="live-thumb">
            {c.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element -- platform thumbnail, not optimised by Next
              <img
                src={c.thumbnail}
                alt=""
                width={160}
                height={90}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="live-pill">
              <span className="live-dot" aria-hidden="true" /> XGamer LIVE on{" "}
              {c.name}
            </span>
            <span className="live-title">{c.title}</span>
          </span>
          {c.watchUrl && (
            <a
              href={c.watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="live-cta"
            >
              <Play size={15} aria-hidden="true" /> Watch Live{" "}
              <ExternalLink size={14} aria-hidden="true" />
              <span className="sr-only"> on {c.name} (opens in a new tab)</span>
            </a>
          )}
        </div>
      ))}
      <Link href="/live" className="live-all">
        All XGamer streams <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </section>
  );
}
