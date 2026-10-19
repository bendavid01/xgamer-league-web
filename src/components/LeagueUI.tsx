import MatchInsight from "./MatchInsight";
import Link from "next/link";
import { ArrowUpRight, Swords } from "lucide-react";
import type { LeagueMatch } from "@/lib/league";
export function PageTitle({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <header className="mb-10">
      <p className="eyebrow">{label}</p>
      <h1 className="page-title">{title}</h1>
      <p className="max-w-2xl text-slate-400 mt-4 leading-relaxed">
        {description}
      </p>
    </header>
  );
}
export function Unavailable() {
  return (
    <p role="status" className="notice">
      League data is temporarily unavailable. Please try again shortly.
    </p>
  );
}
export function MatchCard({ match }: { match: LeagueMatch }) {
  const scored = ["completed", "live"].includes(match.status);
  return (
    <article className="panel match-card p-5">
      <div className="flex justify-between gap-3 text-xs mb-5">
        <span className="text-slate-400">
          {match.stage || "League fixture"}
        </span>
        <span
          className={
            match.status === "live" ? "text-cyan-300" : "text-slate-400"
          }
        >
          {match.status === "live"
            ? "● LIVE"
            : match.status === "completed"
              ? "FINAL"
              : "SCHEDULED"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex-1 font-semibold break-words">
          {match.home?.name || "Participant TBC"}
        </span>
        <strong className="font-mono text-xl text-cyan-300 whitespace-nowrap">
          {scored ? (
            `${match.homeScore ?? "–"} : ${match.awayScore ?? "–"}`
          ) : (
            <Swords size={20} />
          )}
        </strong>
        <span className="flex-1 text-right font-semibold break-words">
          {match.away?.name || "Participant TBC"}
        </span>
      </div>
      <MatchInsight match={match} />
    </article>
  );
}
export function RouteCard({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="panel route-card p-6">
      <div className="flex justify-between gap-3">
        <h2 className="font-bold text-xl">{title}</h2>
        <ArrowUpRight className="text-cyan-300 shrink-0" size={20} />
      </div>
      <p className="mt-3 text-slate-400 text-sm leading-relaxed">{children}</p>
    </Link>
  );
}
