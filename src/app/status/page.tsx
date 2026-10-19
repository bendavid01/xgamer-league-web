import { PageTitle } from "@/components/LeagueUI";
const features = [
  [
    "Public competition, matches & standings",
    "Live",
    "Reads the existing Sanity season. No mock league data.",
  ],
  [
    "Participant records",
    "Live",
    "Public league records and match history; not verified account profiles.",
  ],
  [
    "Tournament planner",
    "Live · browser only",
    "Round robin, knockout with byes and league qualification. Nothing is saved or published.",
  ],
  [
    "Results administration",
    "Existing studio",
    "Existing Sanity permissions and workflow remain in place.",
  ],
  [
    "eFootball finals",
    "Manual workflow",
    "Play externally; organizers review evidence and publish confirmed results in the studio. No game API integration.",
  ],
  [
    "Guest registration & approval",
    "Awaiting setup",
    "Discord guest identity or private phone submission, manual verification and administrator approval.",
  ],
  [
    "Full accounts & guest upgrades",
    "Awaiting setup",
    "Identity provider, private database, ownership checks, recovery and account-required chat.",
  ],
  [
    "Two equal administrators",
    "Awaiting identities",
    "Exactly two verified identities; authorization on every private operation.",
  ],
  [
    "Discord integration",
    "Awaiting setup",
    "OAuth, approved-member roles, notification delivery, retries and webhook verification.",
  ],
  [
    "WhatsApp updates",
    "Manual · not connected",
    "Manual number verification and manual messages only. No automatic sends.",
  ],
];
export default function Status() {
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="RELEASE / 2.0 MVP"
        title="What works today."
        description="A clear view of live features, existing organizer tools and the integrations still waiting for setup."
      />
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              {["Feature", "Availability", "Details"].map((s) => (
                <th scope="col" className="p-5" key={s}>
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map(([feature, state, detail]) => (
              <tr className="border-b border-slate-800" key={feature}>
                <th scope="row" className="p-5 font-semibold">
                  {feature}
                </th>
                <td className="p-5 text-cyan-300">{state}</td>
                <td className="p-5 text-slate-400">{detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
