import Link from "next/link";
import { PageTitle } from "@/components/LeagueUI";
import { Hash, Phone, ShieldCheck } from "lucide-react";
export default function Register() {
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="JOIN THE ARENA"
        title="Choose how you play."
        description="Browsing competitions, results and standings is open to everyone. Online registration is not accepting submissions yet."
      />
      <p className="notice mb-7">
        Registration is awaiting secure account setup and the two administrator
        identities. No phone numbers or personal information are collected on
        this page.
      </p>
      <div className="grid md:grid-cols-3 gap-5">
        {[
          [
            Hash,
            "Discord guest",
            "Planned: enter with Discord identity and receive Discord updates. An administrator must approve your entry.",
          ],
          [
            Phone,
            "Phone / WhatsApp guest",
            "Planned: submit your phone privately, then wait for manual administrator verification. WhatsApp updates are sent manually; no automatic SMS or WhatsApp verification.",
          ],
          [
            ShieldCheck,
            "Full account",
            "Planned: manage your profile and entries. Guest upgrades will require proof of ownership and preserve the same participant record. Chat requires an account.",
          ],
        ].map(([Icon, title, description]) => {
          const I = Icon as typeof Hash;
          return (
            <article className="panel p-6" key={String(title)}>
              <I className="text-cyan-300 mb-5" />
              <h2 className="font-bold text-xl">{String(title)}</h2>
              <p className="text-slate-400 text-sm leading-relaxed mt-4">
                {String(description)}
              </p>
              <span className="inline-block mt-6 text-xs text-amber-300">
                AWAITING SETUP
              </span>
            </article>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 mt-8">
        <Link href="/competitions" className="button-primary">
          Browse competitions
        </Link>
        <Link href="/status" className="button-secondary">
          See feature status
        </Link>
      </div>
    </div>
  );
}
