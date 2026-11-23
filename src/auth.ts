import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

/**
 * Organizer Manager. Organizers sign in with Discord here and nowhere else:
 * /login is the player sign-in (XG ID and password, its own cookie).
 */
export const ORGANIZER_HOME = "/admin";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Auth.js's own sign-in and error redirects (a cancelled or failed Discord
  // sign-in) also return to Organizer Manager, never to the player /login.
  pages: { signIn: ORGANIZER_HOME, error: ORGANIZER_HOME },
  providers: [
    Discord({
      // WHY: Discord now returns an RFC 9207 `iss` parameter on the OAuth callback.
      // Auth.js rejects it unless the provider declares Discord's issuer.
      issuer: "https://discord.com",
      authorization: { params: { scope: "identify" } },
      checks: ["pkce", "state"],
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 4 },
  callbacks: {
    jwt({ token, account, profile }) {
      if (account?.provider === "discord") {
        token.discordId = account.providerAccountId;
        // Display name for the activity log (Discord global name, else username).
        const p = profile as
          { global_name?: string; username?: string } | undefined;
        token.name = p?.global_name || p?.username || token.name;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = String(token.discordId ?? "");
      session.user.name = typeof token.name === "string" ? token.name : null;
      return session;
    },
  },
});
