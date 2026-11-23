import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { OrganizerGate as Gate } from "@/lib/organizer-access";
import OrganizerSignInButton from "./OrganizerSignInButton";
import s from "./om.module.css";

/**
 * /admin before the workspace opens: Discord sign-in, an explicit "not
 * authorized" message, or "not set up". It links nowhere near the player
 * sign-in at /login.
 */
export default function OrganizerGate({
  gate,
  signInFailed,
  signInAction,
  signOutAction,
}: {
  gate: Exclude<Gate, { state: "open" }>;
  /** Auth.js sent a cancelled or failed Discord sign-in back with ?error=. */
  signInFailed: boolean;
  signInAction: () => Promise<void>;
  signOutAction: () => Promise<void>;
}) {
  return (
    <div className={`om ${s.ws} ${s.gate}`}>
      <section className={s.gateCard} aria-labelledby="om-gate-title">
        <div className={s.brand}>
          <span className={s.brandMark} aria-hidden="true">
            XG
          </span>
          <span>
            <strong>Organizer Manager</strong>
            <span className={s.brandSub}>XGamer Pro League</span>
          </span>
        </div>

        {gate.state === "signed-out" && (
          <>
            <h1 id="om-gate-title" className={s.gateTitle}>
              Organizer sign-in
            </h1>
            <p className={s.gateText}>
              Organizers sign in with Discord. You&apos;ll come straight back
              here to Organizer Manager.
            </p>
            {signInFailed && (
              <p role="alert" className={s.gateAlert}>
                Discord sign-in didn&apos;t finish. Please try again.
              </p>
            )}
            <div className={s.gateActions}>
              <OrganizerSignInButton action={signInAction} />
            </div>
          </>
        )}

        {gate.state === "not-authorized" && (
          <>
            <h1 id="om-gate-title" className={s.gateTitle}>
              Not authorized for Organizer Manager
            </h1>
            <p className={s.gateText}>
              You&apos;re signed in with Discord as{" "}
              <strong>{gate.name ?? "this account"}</strong>, but this account
              isn&apos;t a main admin or an active coordinator, so it can&apos;t
              open Organizer Manager.
            </p>
            <p className={s.gateText}>
              Ask a main admin to give access to Discord ID{" "}
              <code>{gate.discordId}</code>, or sign out and sign in with your
              organizer Discord account.
            </p>
            <div className={s.gateActions}>
              <form action={signOutAction}>
                <button type="submit" className={s.gateSecondary}>
                  Sign out
                </button>
              </form>
            </div>
          </>
        )}

        {gate.state === "unconfigured" && (
          <>
            <h1 id="om-gate-title" className={s.gateTitle}>
              Organizer sign-in isn&apos;t available
            </h1>
            <p className={s.gateText}>
              Organizer access is awaiting configuration.
            </p>
          </>
        )}

        <Link href="/" className={s.gateLink}>
          <span>Public site</span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
