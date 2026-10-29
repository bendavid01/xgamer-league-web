import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageTitle } from "@/components/LeagueUI";
import { listTournaments, type PublicTournament } from "@/lib/tournaments";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tournaments",
  description: "Live and past XGamer eFootball tournaments.",
};

const STATUS: Record<PublicTournament["status"], string> = {
  open: "Registration open",
  locked: "Registration closed",
  league: "League in progress",
  knockout: "Knockout in eFootball app",
  completed: "Completed",
};
const formatOf = (t: PublicTournament) =>
  t.format === "knockout"
    ? "Knockout"
    : `League${t.legs === 2 ? " · home & away" : ""}${t.knockout ? ` + Top ${t.qualifiers} knockout` : ""}`;

function Card({ t }: { t: PublicTournament }) {
  return (
    <article className="panel tournament-card">
      <span className={`status-pill status-${t.status}`}>
        {STATUS[t.status]}
      </span>
      <h3>{t.name}</h3>
      <p>{formatOf(t)}</p>
      <div className="flex flex-wrap gap-2">
        {t.status === "open" && (
          <Link href={`/register?t=${t.id}`} className="button-primary">
            Register <ArrowUpRight size={16} />
          </Link>
        )}
        <Link href={`/table?t=${t.id}`} className="button-secondary">
          Standings
        </Link>
        <Link href={`/matches?t=${t.id}`} className="button-secondary">
          Fixtures
        </Link>
      </div>
    </article>
  );
}

export default async function Competitions() {
  const list = await listTournaments();
  return (
    <div className="page-shell py-12 space-y-12">
      <PageTitle
        label="COMPETE / EFOOTBALL"
        title="Tournaments."
        description="Live competitions first. Finished ones stay here as history."
      />
      <section aria-labelledby="live-title">
        <h2 id="live-title" className="text-2xl font-bold mb-4">
          Live
        </h2>
        {list?.active.length ? (
          <div className="tournament-cards">
            {list.active.map((t) => (
              <Card key={t.id} t={t} />
            ))}
          </div>
        ) : (
          <p className="notice">
            No tournament is running right now. Join our Discord to hear about
            the next one.
          </p>
        )}
      </section>
      <section aria-labelledby="past-title">
        <h2 id="past-title" className="text-2xl font-bold mb-4">
          Past tournaments
        </h2>
        <div className="tournament-cards">
          {list?.past.map((t) => (
            <Card key={t.id} t={t} />
          ))}
          <article className="panel tournament-card">
            <span className="status-pill status-completed">
              Previous season
            </span>
            <h3>X-Gamer Pro League</h3>
            <p>
              Group stage & finals — the season before the Organizer Manager.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
