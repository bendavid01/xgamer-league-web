import { Radio } from "lucide-react";

export default function LiveHeader({ note }: { note?: string }) {
  return (
    <div className="live-hub-head">
      <Radio className="live-hub-icon" aria-hidden="true" />
      <div>
        <h2 className="live-hub-title">Watch XGamer Live</h2>
        <p className="live-hub-text">
          Our official channels on YouTube, Twitch and Kick.
        </p>
        {note && <p className="live-hub-note">{note}</p>}
      </div>
    </div>
  );
}
