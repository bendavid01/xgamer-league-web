import ControlCenter from "@/components/ControlCenter";
import OrganizerGate from "@/components/om/OrganizerGate";
import { signIn, signOut } from "@/auth";
import { organizerGate, startOrganizerSignIn } from "@/lib/organizer-access";
export const dynamic = "force-dynamic";

/** Discord sign-in for organizers; Auth.js brings them back to /admin. */
async function signInAction() {
  "use server";
  await startOrganizerSignIn(signIn);
}
async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Same access rule as /api/admin. Signed out, not authorized and not set up
  // each get their own screen here instead of a link to the player /login.
  const gate = await organizerGate();
  if (gate.state === "open")
    return (
      <ControlCenter
        signInAction={signInAction}
        signOutAction={signOutAction}
      />
    );
  const { error } = await searchParams;
  return (
    <OrganizerGate
      gate={gate}
      signInFailed={gate.state === "signed-out" && !!error}
      signInAction={signInAction}
      signOutAction={signOutAction}
    />
  );
}
