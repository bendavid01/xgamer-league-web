import Link from "next/link";
import { PageTitle } from "@/components/LeagueUI";
export default function Login() {
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="ACCOUNT ACCESS"
        title="Account setup is next."
        description="Sign-in, recovery and guest upgrades are awaiting a configured identity provider and private storage."
      />
      <p className="notice max-w-2xl">
        There is no working login form in this release. You can browse the
        league without signing in. Account and admin access will be enabled
        after secure setup.
      </p>
      <Link className="button-primary mt-6" href="/competitions">
        Explore the league
      </Link>
    </div>
  );
}
