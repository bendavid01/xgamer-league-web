import Link from "next/link";
import { PageTitle } from "@/components/LeagueUI";
import { signIn } from "@/auth";
export const dynamic = "force-dynamic";
export default function Login() {
  const enabled =
    !!process.env.AUTH_SECRET &&
    !!process.env.AUTH_DISCORD_ID &&
    !!process.env.AUTH_DISCORD_SECRET &&
    !!process.env.DATABASE_URL;
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="ACCOUNT ACCESS"
        title="Your place in the arena."
        description="Discord sign-in for authorized organizers and verified finalists."
      />
      <p className="notice max-w-2xl">
        {enabled
          ? "Sign in with your verified Discord account. Organizer permissions are checked on every operation."
          : "Sign-in is closed while secure access is being configured. You can browse the league without signing in."}
      </p>
      {enabled && (
        <form
          action={async () => {
            "use server";
            await signIn("discord", { redirectTo: "/admin" });
          }}
        >
          <button className="button-primary mt-6">Continue with Discord</button>
        </form>
      )}
      <Link className="button-primary mt-6" href="/competitions">
        Explore the league
      </Link>
    </div>
  );
}
