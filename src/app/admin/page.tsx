import Link from "next/link";
import { PageTitle } from "@/components/LeagueUI";
export default function Admin() {
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="ORGANIZER ACCESS"
        title="Built for two equal admins."
        description="The new administration area is locked pending identity and private storage setup. This page exposes no private data or controls."
      />
      <div className="grid md:grid-cols-2 gap-5">
        <article className="notice">
          <h2 className="text-white font-bold mb-3">Existing season</h2>
          <p>
            Continue using the existing Sanity studio and its current
            permissions to publish results. Existing data and administrator
            access have been preserved.
          </p>
        </article>
        <article className="notice">
          <h2 className="text-white font-bold mb-3">Next setup step</h2>
          <p>
            Assign exactly two verified administrator identities with equal
            permissions. Entry approval, phone verification, result evidence
            review and guest upgrades need server-side authorization and audit
            records before they can open.
          </p>
        </article>
      </div>
      <Link href="/planner" className="button-primary mt-7">
        Try the tournament planner
      </Link>
      <p className="text-sm text-slate-500 mt-3">
        Planner only. Nothing is published to the live league.
      </p>
    </div>
  );
}
