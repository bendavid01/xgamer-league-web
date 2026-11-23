import s from "./om.module.css";

/**
 * Discord sign-in for organizers. `action` is the /admin server action that
 * starts Auth.js's Discord flow with /admin as the destination. It's a form
 * post rather than a link because Auth.js starts sign-in only on a POST, and it
 * never routes through /login (the player sign-in).
 */
export default function OrganizerSignInButton({
  action,
}: {
  action: () => Promise<void>;
}) {
  return (
    <form action={action}>
      <button type="submit" className={s.discordBtn}>
        Sign in with Discord
      </button>
    </form>
  );
}
