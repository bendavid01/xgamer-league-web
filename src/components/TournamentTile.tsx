import Link from "next/link";
import { ArrowRight, CalendarDays, ListOrdered, Megaphone } from "lucide-react";
import { STATUS_LABEL, type PublicTournament } from "@/lib/tournaments";
import { FORMAT_SHORT, formatChoice } from "@/lib/labels";

/**
 * One compact tournament tile, shared by the homepage (with Fixtures/Standings
 * buttons) and the Tournaments page (the whole tile is the link).
 * Identity only: status, name, season, format. Never scores or stats.
 */
export default function TournamentTile({
  t,
  href,
  withActions = false,
}: {
  t: PublicTournament;
  href: string;
  withActions?: boolean;
}) {
  const format = formatChoice(t);
  const go = (tab: string) =>
    `/tournaments?t=${encodeURIComponent(t.id)}&tab=${tab}`;
  // Knockout-only is played in the eFootball app, so it has updates instead of fixtures.
  const actions =
    format === "knockout"
      ? [
          { label: "Updates", href: go("updates"), Icon: Megaphone },
          { label: "Standings", href: go("standings"), Icon: ListOrdered },
        ]
      : [
          { label: "Fixtures", href: go("fixtures"), Icon: CalendarDays },
          { label: "Standings", href: go("standings"), Icon: ListOrdered },
        ];
  const name = t.competition ?? t.name;
  return (
    <article className="xg-tile">
      <Link href={href} className="xg-tile-main">
        <span className="xg-tile-crest" aria-hidden="true" />
        <span className={`status-pill status-${t.status}`}>
          {STATUS_LABEL[t.status]}
        </span>
        <span className="xg-tile-name">{name}</span>
        {t.season && <span className="xg-tile-season">Season {t.season}</span>}
        <span className="xg-tile-format">{FORMAT_SHORT[format]}</span>
        <span className="xg-tile-explore" aria-hidden="true">
          Explore <ArrowRight size={16} />
        </span>
      </Link>
      {withActions && (
        <div className="xg-tile-actions">
          {actions.map(({ label, href: to, Icon }) => (
            <Link key={label} href={to} aria-label={`${label}: ${t.label}`}>
              <Icon size={17} aria-hidden="true" /> {label}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
