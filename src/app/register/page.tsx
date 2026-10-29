import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/LeagueUI";
import RegistrationForm from "@/components/RegistrationForm";
import { openTournaments, type OpenTournament } from "@/lib/registration";
import { communityLinks } from "@/lib/community";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Join the arena",
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
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="JOIN THE ARENA"
        title={chosen ? chosen.name : "Earn your place."}
        description={
          chosen?.description ??
          "Tell us who you are. An organizer contacts you on WhatsApp to confirm your entry."
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
                <h3 className="text-xl font-bold mt-3">{t.name}</h3>
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
        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-10 mt-10 items-start">
          <aside className="space-y-5">
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
                <span>Player name, team name and your WhatsApp number.</span>
              </li>
              <li>
                <strong>Get confirmed</strong>
                <span>
                  An organizer messages you on WhatsApp and approves your entry.
                </span>
              </li>
              <li>
                <strong>Play</strong>
                <span>
                  Share your eFootball ID with the organizer, then check your
                  fixtures here.
                </span>
              </li>
            </ol>
            {open.length > 1 && (
              <Link href="/register" className="insight-link">
                ← Other open tournaments
              </Link>
            )}
            <a
              href={communityLinks[0].href}
              target="_blank"
              rel="noopener noreferrer"
              className="insight-link block"
            >
              Questions? Ask on Discord ↗
            </a>
          </aside>
          <RegistrationForm tournament={chosen?.id ?? null} />
        </div>
      )}
    </div>
  );
}
