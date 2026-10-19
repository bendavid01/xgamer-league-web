import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Discord({
      authorization: { params: { scope: "identify" } },
      checks: ["pkce", "state"],
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 4 },
  callbacks: {
    jwt({ token, account }) {
      if (account?.provider === "discord")
        token.discordId = account.providerAccountId;
      return token;
    },
    session({ session, token }) {
      session.user.id = String(token.discordId ?? "");
      return session;
    },
  },
});
