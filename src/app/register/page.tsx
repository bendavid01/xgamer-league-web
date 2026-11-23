import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/LeagueUI";
import RegistrationForm from "@/components/RegistrationForm";
import { tournamentLabel } from "@/lib/labels";
import { openTournaments, type OpenTournament } from "@/lib/registration";
import { communityLinks } from "@/lib/community";
import { ArrowUpRight, CalendarClock, LogIn, Trophy } from "lucide-react";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Register",
  description: "Register for an XGamer eFootball tournament.",
};

const IST = { timeZone: "Asia/Kolkata" } as const;
function details(t: OpenTournament) {
  const rows: [string, string][] = [
    [
      "Format",
      t.format === "knockout"
        ? "Knockout (played in the eFootball app)"
        : `League${t.legs === 2 ? " · home & away" : ""}${t.knockout ? ` · Top ${t.qualifiers} go to the knockout` : ""}`,
    ],
  ];
  if (t.starts_on)
    rows.push([
      "Starts",
      new Date(`${t.starts_on}T12:00:00+05:30`).toLocaleDateString("en-IN", {
        ...IST,
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    ]);
  if (t.registration_closes)
    rows.push([
      "Registration closes",
      new Date(t.registration_closes).toLocaleString("en-IN", {
        ...IST,
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }),
    ]);
  if (t.entry_fee !== null)
    rows.push([
      "Entry",
      t.entry_fee === 0 ? "Free" : `₹${t.entry_fee.toLocaleString("en-IN")}`,
    ]);
  if (t.prize) rows.push(["Prize", t.prize]);
  return rows;
}

export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const open = await openTournaments();
  const requested = (await searchParams).t;
  const chosen =
    open.length === 1 ? open[0] : open.find((t) => t.id === requested);
  const choose = open.length > 1 && !chosen;
  const closed = open.length === 0;
  const discord =
    communityLinks.find((c) => c.name === "Discord") ?? communityLinks[0];
  return (
    <div className="page-shell register-page">
      <PageTitle
        label="JOIN THE ARENA"
        title={chosen ? tournamentLabel(chosen) : "Earn your place."}
        description={
          chosen?.description ??
          "An organizer verifies your registration before you join the tournament."
        }
      />
      {choose ? (
        <section aria-labelledby="pick-title">
          <h2 id="pick-title" className="text-2xl font-bold mb-4">
            Choose a tournament
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {open.map((t) => (
              <Link
                key={t.id}
                href={`/register?t=${encodeURIComponent(t.id)}`}
                className="panel route-card p-6"
              >
                <span className="status-pill status-open">
                  Registration open
                </span>
                <h3 className="text-xl font-bold mt-3">{tournamentLabel(t)}</h3>
                <dl className="register-facts mt-3">
                  {details(t).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <div className="register-layout">
          <aside className="register-aside space-y-5">
            {chosen && (
              <dl className="register-facts panel p-5">
                {details(chosen).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            <ol className="register-steps">
              <li>
                <strong>Register</strong>
                <span>
                  New players choose Registered XG Player (recommended) or a
                  one-tournament Guest entry. Returning players enter their XG
                  ID. Both add a team and WhatsApp number.
                </span>
              </li>
              <li>
                <strong>Get approved</strong>
                <span>
                  Share your application reference privately with an organizer
                  on Discord. Approved Registered players automatically unlock
                  their permanent XG ID and Player Hub login.
                </span>
              </li>
              <li>
                <strong>Play</strong>
                <span>
                  Sign in to the Player Hub for fixtures, results and 1-click
                  entry to future tournaments. Share your eFootball ID with the
                  organizer when asked.
                </span>
              </li>
            </ol>
            {open.length > 1 && (
              <Link href="/register" className="insight-link">
                ← Other open tournaments
              </Link>
            )}
            <a
              href={discord.href}
              target="_blank"
              rel="noopener noreferrer"
              className="insight-link block"
            >
              Questions? Ask on Discord ↗
            </a>
          </aside>
          {closed ? (
            <section
              className="panel reg-card reg-closed"
              aria-labelledby="closed-title"
            >
              <span className="reg-closed-badge">
                <CalendarClock size={15} aria-hidden="true" /> Registration
                Closed
              </span>
              <h2 id="closed-title" className="reg-closed-title">
                No tournament is open for entries right now.
              </h2>
              <p className="text-slate-400 leading-relaxed">
                The next season is announced on Discord and in the WhatsApp
                group first. Already have an XG ID? Your Player Hub keeps your
                fixtures, results and history, and opens 1-click entry the
                moment registration reopens.
              </p>
              <div className="reg-closed-actions">
                <Link href="/login" className="button-primary">
                  <LogIn size={16} aria-hidden="true" /> Sign in to Player Hub
                </Link>
                <Link href="/tournaments" className="button-secondary">
                  <Trophy size={16} aria-hidden="true" /> View Tournaments
                </Link>
                <a
                  href={discord.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button-secondary"
                >
                  Join Discord <ArrowUpRight size={16} aria-hidden="true" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
            </section>
          ) : (
            <RegistrationForm tournament={chosen?.id ?? null} />
          )}
        </div>
      )}
    </div>
  );
}
