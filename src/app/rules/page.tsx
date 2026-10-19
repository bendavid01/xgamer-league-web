import { PageTitle } from "@/components/LeagueUI";
export default function Rules() {
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="COMPETITION GUIDE"
        title="Play fair. Finish strong."
        description="The current repository has no published official rulebook. Confirm competition-specific rules with the organizers before playing."
      />
      <div className="grid md:grid-cols-2 gap-5">
        <section className="notice">
          <h2 className="font-bold text-white mb-3">Standings calculation</h2>
          <p>
            The public group table awards 3 points for a win, 1 for a draw and 0
            for a loss. It sorts by points, goal difference and goals scored.
            Equal records require an organizer qualification decision.
          </p>
        </section>
        <section className="notice">
          <h2 className="font-bold text-white mb-3">
            External eFootball finals workflow
          </h2>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              Organizers confirm the bracket and agree a kickoff time with both
              participants.
            </li>
            <li>
              Participants create or join the agreed room inside eFootball. Room
              credentials stay in private organizer messages.
            </li>
            <li>
              Play the match using the organizer-confirmed settings. Resolve
              drawn knockout games using the agreed penalty rules.
            </li>
            <li>
              Send score evidence privately to the organizers. Disputes remain
              pending review.
            </li>
            <li>
              An authorized organizer publishes the confirmed result in the
              existing studio.
            </li>
          </ol>
        </section>
      </div>
      <p className="text-sm text-slate-500 mt-7">
        No automatic eFootball result import, evidence upload or dispute
        management is implemented in this release.
      </p>
    </div>
  );
}
