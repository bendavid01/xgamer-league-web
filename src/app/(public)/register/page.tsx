import type { Metadata } from "next";
import Link from "next/link";
import RegistrationForm from "@/components/RegistrationForm";
import { registrationConfigured } from "@/lib/configuration";
import {
  describeFormat,
  formatDate,
  getFeaturedTournament,
} from "@/lib/content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Register",
  description: "Register for the next X-Gamer eFootball Mobile tournament.",
};

export default async function Register() {
  const { tournament } = await getFeaturedTournament();
  // WHY: the form only accepts entries when OM is configured AND organizers have opened registration.
  const open =
    registrationConfigured() && tournament?.status === "registration_open";
  return (
    <div className="page-shell py-8 sm:py-12 max-w-2xl">
      <p className="eyebrow !mb-3">REGISTER</p>
      <h1 className="text-3xl sm:text-4xl font-bold">
        {tournament ? tournament.title : "Register to play"}
      </h1>
      {tournament && (
        <p className="mt-3 text-slate-300">
          {[
            describeFormat(tournament).label,
            `${tournament.playersNeeded} players`,
            formatDate(tournament.startDate)
              ? `starts ${formatDate(tournament.startDate)}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          {" · "}
          <Link
            href="/tournament"
            className="text-cyan-300 underline-offset-4 hover:underline"
          >
            details
          </Link>
        </p>
      )}
      <p className="text-slate-400 my-5 text-sm">
        Takes about a minute. An organizer verifies every entry before approval.
      </p>
      <RegistrationForm enabled={open} />
    </div>
  );
}
