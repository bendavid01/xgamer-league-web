import { actor, HttpError } from "@/lib/api";
import Link from "next/link";
export default async function OrganizerGate({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await actor("workspace", "xgamer-2026-10");
  } catch (error) {
    return (
      <section className="page-shell py-12">
        <h1 className="text-3xl">Organizer access</h1>
        <p className="my-5">
          {error instanceof HttpError && error.status === 401
            ? "Sign in to continue."
            : "Access is unavailable or this account is not authorized."}
        </p>
        <Link className="button-primary" href="/login">
          Sign in with Discord
        </Link>
      </section>
    );
  }
  return <>{children}</>;
}
