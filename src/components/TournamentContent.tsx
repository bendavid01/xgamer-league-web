import Link from "next/link";
import { ArrowUpRight, Pin } from "lucide-react";
import {
  describeFormat,
  formatDate,
  type Announcement,
  type RuleCard,
  type Tournament,
} from "@/lib/content";

/** "Tournament format" block: players needed, league/knockout and how qualification works. */
export function FormatBlock({ tournament }: { tournament: Tournament }) {
  const { label, facts } = describeFormat(tournament);
  return (
    <section aria-labelledby="format-title" className="panel p-5 sm:p-7">
      <p className="eyebrow !mb-3">TOURNAMENT FORMAT</p>
      <h2 id="format-title" className="text-2xl sm:text-3xl font-bold">
        {label}
      </h2>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        <li className="format-fact">
          <strong>{tournament.playersNeeded}</strong> players needed
        </li>
        {facts.map((fact) => (
          <li key={fact} className="format-fact">
            {fact}
          </li>
        ))}
        {tournament.registrationDeadline && (
          <li className="format-fact">
            Registration closes{" "}
            <strong>{formatDate(tournament.registrationDeadline, true)}</strong>
          </li>
        )}
      </ul>
    </section>
  );
}

/** Match parameters as a 1/2/4-column card grid. Only published rules are shown. */
export function RuleCards({ cards }: { cards: RuleCard[] }) {
  if (!cards.length) return null;
  return (
    <section aria-labelledby="rules-title">
      <div className="flex items-end justify-between gap-4 mb-4">
        <h2 id="rules-title" className="text-2xl sm:text-3xl font-bold">
          Match parameters & rules
        </h2>
        <Link href="/rules" className="insight-link shrink-0">
          All rules →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, i) => (
          <article key={card.title} className="panel rule-card p-5">
            <p className="rule-card-index">{String.fromCharCode(65 + i)}</p>
            <h3 className="font-bold text-lg">{card.title}</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              {card.items.map((item) => (
                <li key={item} className="rule-card-item">
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AnnouncementList({
  announcements,
}: {
  announcements: Announcement[] | null;
}) {
  return (
    <section
      aria-labelledby="announcements"
      className="scroll-mt-24"
      id="announcements-section"
    >
      <h2
        id="announcements"
        className="text-2xl sm:text-3xl font-bold mb-4 scroll-mt-24"
      >
        Announcements
      </h2>
      {announcements === null ? (
        <p className="notice">
          Updates are temporarily unavailable. Check back shortly.
        </p>
      ) : announcements.length ? (
        <div className="space-y-3">
          {announcements.map((a) => (
            <article key={a._id} className="panel p-5">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                {a.pinned && (
                  <span className="inline-flex items-center gap-1 text-cyan-300">
                    <Pin size={12} aria-hidden="true" /> Pinned ·
                  </span>
                )}
                <time dateTime={a.publishedAt}>
                  {formatDate(a.publishedAt)}
                </time>
              </div>
              <h3 className="text-lg font-semibold mt-2">{a.title}</h3>
              <p className="mt-2 text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
                {a.message}
              </p>
              {a.link &&
                (a.link.href.startsWith("/") ? (
                  <Link href={a.link.href} className="insight-link mt-3">
                    {a.link.label} →
                  </Link>
                ) : (
                  <a
                    href={a.link.href}
                    className="insight-link mt-3"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {a.link.label} <ArrowUpRight size={14} aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ))}
            </article>
          ))}
        </div>
      ) : (
        <p className="notice">
          No announcements yet. Updates appear here when organizers publish
          them.
        </p>
      )}
    </section>
  );
}
