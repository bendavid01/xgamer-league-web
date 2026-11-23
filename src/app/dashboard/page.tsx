import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import PlayerHub, {
  type HubView,
  type OpenToJoin,
} from "@/components/player/PlayerHub";
import { tournamentLabel } from "@/lib/labels";
import { hubData, playerFromCookie } from "@/lib/player-account";
import { SESSION_COOKIE } from "@/lib/player-auth";
import { openTournaments } from "@/lib/registration";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Player hub",
  robots: { index: false, follow: false },
};

const VIEWS: HubView[] = [
  "overview",
  "profile",
  "tournaments",
  "history",
  "announcements",
];

/** The signed-in player's hub. Everything is read for the session's own player. */
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const player = token ? await playerFromCookie(token).catch(() => null) : null;
  if (!player) redirect("/login");

  const [data, open] = await Promise.all([hubData(player), openTournaments()]);
  const entered = new Set(data.entries.map((e) => e.tournamentId));
  const joinable: OpenToJoin[] = open
    .filter((t) => !entered.has(t.id))
    .map((t) => ({
      id: t.id,
      label: tournamentLabel(t),
      detail:
        t.format === "knockout"
          ? "Knockout · played in the eFootball app"
          : `League${t.knockout ? ` · Top ${t.qualifiers} to the knockout` : ""}`,
    }));
  const requested = (await searchParams).view as HubView | undefined;
  return (
    <PlayerHub
      data={data}
      open={joinable}
      initialView={
        requested && VIEWS.includes(requested) ? requested : "overview"
      }
    />
  );
}
