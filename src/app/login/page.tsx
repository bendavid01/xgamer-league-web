import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import LoginPortal, { MemberPreview } from "@/components/player/LoginPortal";
import s from "@/components/player/player.module.css";
import { playerAuthConfigured, playerFromCookie } from "@/lib/player-account";
import { SESSION_COOKIE } from "@/lib/player-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your XGamer player hub with your XG ID.",
};

export default async function Login() {
  // Already signed in as a player: straight to the hub.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token && (await playerFromCookie(token).catch(() => null)))
    redirect("/dashboard");

  const discord =
    !!process.env.AUTH_SECRET &&
    !!process.env.AUTH_DISCORD_ID &&
    !!process.env.AUTH_DISCORD_SECRET &&
    !!process.env.DATABASE_URL;

  return (
    <div className={`${s.pw} ${s.login}`}>
      <div className={s.loginInner}>
        <header className={s.loginHead}>
          <p className={s.eyebrow}>Account access</p>
          <h1 className={s.loginTitle}>Your place in the arena.</h1>
          <p className={s.loginSub}>
            Players sign in with the XG ID they earned. Your fixtures, results
            and tournament entries live in your hub.
          </p>
        </header>
        <div className={s.cards}>
          <LoginPortal available={playerAuthConfigured()} />
          <MemberPreview />
        </div>
        {/* Organizers use Discord, through the existing Auth.js flow. */}
        <footer className={s.organizer}>
          {discord ? (
            <form
              action={async () => {
                "use server";
                await signIn("discord", { redirectTo: "/admin" });
              }}
            >
              <button className={s.organizerLink}>Organizer access</button>
            </form>
          ) : (
            <Link href="/admin" className={s.organizerLink}>
              Organizer access
            </Link>
          )}
        </footer>
      </div>
    </div>
  );
}
