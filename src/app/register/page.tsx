import type { Metadata } from "next";
import { PageTitle } from "@/components/LeagueUI";
import RegistrationForm from "@/components/RegistrationForm";
import { registrationOpen } from "@/lib/registration";
import { communityLinks } from "@/lib/community";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Join the arena",
  description: "Register for the next XGamer eFootball tournament.",
};
export default async function Register() {
  const open = await registrationOpen();
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="JOIN THE ARENA"
        title="Earn your place."
        description="Tell us who you are. An organizer contacts you on WhatsApp to confirm your entry."
      />
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-10 mt-10 items-start">
        <aside className="space-y-5">
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
          <a
            href={communityLinks[0].href}
            target="_blank"
            rel="noopener noreferrer"
            className="insight-link"
          >
            Questions? Ask on Discord ↗
          </a>
        </aside>
        <RegistrationForm enabled={open} />
      </div>
    </div>
  );
}
