import Link from "next/link";
import FinalsAccess from "@/components/FinalsAccess";
import { PageTitle } from "@/components/LeagueUI";
export default function Finals() {
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="THE FINAL EIGHT"
        title="You earned this stage."
        description="Private external eFootball room access for verified qualified players."
      />
      <Link className="button-secondary mt-7" href="/login">
        Sign in with Discord
      </Link>
      <FinalsAccess />
    </div>
  );
}
