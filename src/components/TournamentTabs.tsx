import Link from "next/link";

/** One tab per live tournament; hidden when there is only one (or none). */
export default function TournamentTabs({
  tabs,
  current,
  path,
}: {
  tabs: { id: string; name: string }[];
  current: string | null | undefined;
  path: string;
}) {
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Tournaments" className="tournament-tabs">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={`${path}?t=${encodeURIComponent(t.id)}`}
          aria-current={t.id === current ? "page" : undefined}
          className={
            t.id === current
              ? "tournament-tab tournament-tab-on"
              : "tournament-tab"
          }
        >
          {t.name}
        </Link>
      ))}
    </nav>
  );
}
