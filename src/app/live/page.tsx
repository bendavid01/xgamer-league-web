import type { Metadata } from "next";
import { PageTitle } from "@/components/LeagueUI";
import LiveChannels from "@/components/live/LiveChannels";
import { getLiveStatus, REFRESH_SECONDS } from "@/lib/live";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Watch Live",
  description:
    "XGamer's official YouTube, Twitch and Kick channels — see who is live now.",
};

export default async function Live() {
  const channels = await getLiveStatus();
  return (
    <div className="page-shell py-12">
      <PageTitle
        compact
        label="XGAMER LIVE"
        title="Watch XGamer Live."
        description="Tournament coverage, gaming and community events on our official channels."
      />
      <LiveChannels initial={channels} refreshSeconds={REFRESH_SECONDS} />
    </div>
  );
}
