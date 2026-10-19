import Link from "next/link";
import type { Metadata } from "next";
import { PageTitle } from "@/components/LeagueUI";
export const metadata: Metadata = {
  title: "Rules & fair play",
  description: "XGamer standings guide and draft rules pending admin approval.",
};
const proposals = [
  [
    "Respect the player",
    "Keep competition welcoming. No harassment, hate speech, threats or sharing another player's private information. Report concerns privately to an organizer.",
  ],
  [
    "Compete with integrity",
    "Play your own matches. No cheating, impersonation, deliberate exploitation or manipulation of scores. Organizers must review reports before deciding an outcome.",
  ],
  [
    "Agree before kickoff",
    "Confirm the fixture, kickoff time, room host and match settings with your opponent and organizer. Match duration, squad restrictions and knockout tiebreakers require competition-specific approval.",
  ],
  [
    "Connection lost? Keep the evidence",
    "Save the score, match time and any relevant screenshots. Contact an organizer before replaying. No automatic win, replay or penalty is established by this draft.",
  ],
  [
    "Report results clearly",
    "Both players should retain score evidence and share it privately with an organizer. Only an authorized organizer publishes confirmed results in the existing studio.",
  ],
  [
    "Resolve disputes fairly",
    "Send the fixture details and evidence privately to the organizers. Disputed results remain pending review. Reporting deadlines, appeals and sanctions require admin approval.",
  ],
];
export default function Rules() {
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="THE COMPETITION GUIDE"
        title="PLAY FAIR. LEAVE A LEGACY."
        description="Understand the table, prepare for kickoff and help shape a better arena."
      />
      <div className="draft-banner mb-8">
        <span className="draft-tag">DRAFT / PENDING ADMIN APPROVAL</span>
        <p className="mt-3 leading-relaxed">
          The proposed rules below are not an official published rulebook.
          Organizers must approve match settings, deadlines, sanctions and
          appeals before they apply. Confirm the rules for your competition
          before playing.
        </p>
      </div>
      <div className="grid lg:grid-cols-[.7fr_1.3fr] gap-8 items-start">
        <aside className="panel p-6 lg:sticky lg:top-28">
          <p className="eyebrow">HOW THE SITE WORKS TODAY</p>
          <h2 className="text-2xl font-bold mb-5">Every point counts.</h2>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              ["3", "WIN"],
              ["1", "DRAW"],
              ["0", "LOSS"],
            ].map(([points, label]) => (
              <div key={label} className="score-tile">
                <strong>{points}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="text-slate-400 leading-relaxed">
            The public group table sorts by points, goal difference, then goals
            scored. Equal records require an organizer qualification decision.
            This describes the existing calculation; it does not approve the
            draft rules.
          </p>
          <Link className="insight-link mt-5" href="/table">
            View the standings →
          </Link>
          <hr className="border-slate-800 my-6" />
          <p className="text-sm text-slate-400 leading-relaxed">
            Matches take place inside eFootball. Room credentials and score
            evidence stay in private organizer messages. Result import, evidence
            upload and dispute management are not automated.
          </p>
        </aside>
        <section aria-label="Proposed rules">
          <p className="eyebrow">PROPOSED RULES / EXPAND TO READ</p>
          <div className="space-y-3">
            {proposals.map(([title, description], index) => (
              <details
                key={title}
                className="rule-detail panel"
                open={index === 0}
              >
                <summary>
                  <span className="rule-number">0{index + 1}</span>
                  <span>{title}</span>
                  <span className="rule-plus" aria-hidden="true">
                    +
                  </span>
                </summary>
                <div className="rule-body">
                  <span className="text-xs text-amber-200 uppercase tracking-widest">
                    Draft · pending admin approval
                  </span>
                  <p className="mt-3 text-slate-300 leading-relaxed">
                    {description}
                  </p>
                </div>
              </details>
            ))}
          </div>
          <div className="notice mt-6">
            <h2 className="text-white font-bold mb-2">
              Need a ruling before you play?
            </h2>
            <p>
              Contact an organizer through the official community channels. Do
              not post private room credentials or personal information
              publicly.
            </p>
            <Link href="/community" className="insight-link mt-2">
              Find the community →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
