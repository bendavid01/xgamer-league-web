import Link from "next/link";
import { ArrowUpRight, CalendarDays, Trophy, Users } from "lucide-react";
import {
  describeFormat,
  formatDate,
  formatRupees,
  primaryAction,
  type Tournament,
} from "@/lib/content";
import { communityLinks } from "@/lib/community";
import FormatFunnel from "@/components/FormatFunnel";
import Countdown from "@/components/Countdown";

const STATUS_LABEL: Record<Tournament["status"], string> = {
  announced: "Coming soon",
  registration_open: "Registration open",
  registration_closed: "Registration closed",
  in_progress: "In progress",
  completed: "Completed",
};

/** Mobile-first hero: every published fact above the fold, one primary action. */
export default function TournamentHero({
  tournament,
  detailsLink = true,
}: {
  tournament: Tournament | null;
  detailsLink?: boolean;
}) {
  const action = primaryAction(tournament, communityLinks[0].href);
  const format = tournament ? describeFormat(tournament) : null;
  const tiles = tournament
    ? [
        { icon: Trophy, label: "Format", value: format!.label },
        {
          icon: Users,
          label: "Players",
          value: `${tournament.playersNeeded} slots`,
        },
        {
          icon: CalendarDays,
          label: "Starts",
          value: formatDate(tournament.startDate),
        },
        { label: "Entry", value: formatRupees(tournament.entryFee) },
        { label: "Prize", value: tournament.prize },
      ].filter(
        (t): t is { icon?: typeof Trophy; label: string; value: string } =>
          !!t.value,
      )
    : [];
  const countdown =
    tournament?.status === "registration_open" &&
    tournament.registrationDeadline
      ? {
          target: tournament.registrationDeadline,
          label: "Registration closes in",
        }
      : tournament &&
          ["announced", "registration_open", "registration_closed"].includes(
            tournament.status,
          ) &&
          tournament.startDate
        ? {
            target: `${tournament.startDate}T00:00:00+05:30`,
            label: "Kick-off in",
          }
        : null;
  return (
    <section className="hero-grid" aria-labelledby="hero-title">
      <div className="hero-sweep" aria-hidden="true" />
      <div className="page-shell relative py-6 sm:py-14 hero-layout">
        <div className="hero-copy-col">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="hero-badge">
              XGAMER PRO LEAGUE 2.0 <span aria-hidden="true">{"//"}</span>{" "}
              {tournament?.game ?? "eFootball Mobile"}
            </p>
            {tournament && (
              <p className={`status-chip status-${tournament.status}`}>
                <span aria-hidden="true" className="status-dot" />
                {STATUS_LABEL[tournament.status]}
              </p>
            )}
          </div>
          <h1 id="hero-title" className="hero-headline">
            {tournament ? tournament.title : "X-Gamer Pro League"}
          </h1>
          {(tournament?.summary || !tournament) && (
            <p className="mt-3 max-w-xl text-slate-300 leading-relaxed">
              {tournament?.summary ??
                "Competitive eFootball Mobile tournaments, fixtures and standings."}
            </p>
          )}

          {tiles.length > 0 && (
            <dl className="meta-grid" aria-label="Tournament details">
              {tiles.map(({ icon: Icon, label, value }) => (
                <div key={label} className="meta-tile">
                  <dt>
                    {Icon && <Icon size={14} aria-hidden="true" />}
                    {label}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            {action.external ? (
              <a
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
                className="button-primary hero-cta"
              >
                {action.label} <ArrowUpRight size={18} aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              <Link href={action.href} className="button-primary hero-cta">
                {action.label} <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            )}
            {action.note && (
              <p className="text-sm text-slate-400">{action.note}</p>
            )}
          </div>
          {tournament && detailsLink && (
            <Link href="/tournament" className="insight-link mt-5">
              Full format & rules
            </Link>
          )}
        </div>
        {tournament && (
          <div className="hero-visual-col">
            {countdown && (
              <Countdown target={countdown.target} label={countdown.label} />
            )}
            <FormatFunnel tournament={tournament} />
          </div>
        )}
      </div>
    </section>
  );
}
