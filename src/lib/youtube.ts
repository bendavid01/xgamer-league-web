import { CHANNELS, OFFLINE, UNAVAILABLE, type Check } from "./live";

/**
 * "Live now" detection for the official YouTube channel.
 * WHY: search.list costs 100 quota units per call; reading the channel's uploads playlist (1 unit)
 * and the latest videos' live state (1 unit) lets the site check every minute within the free quota.
 * Requires YOUTUBE_API_KEY. YOUTUBE_CHANNEL_ID (UC…) is optional; without it the
 * channel is looked up from its @handle. Without a key the status is "unavailable".
 */
export type LiveStream = {
  videoId: string;
  title: string;
  url: string;
  thumbnail: string;
};

type VideoItem = {
  id?: unknown;
  snippet?: {
    title?: unknown;
    liveBroadcastContent?: unknown;
    thumbnails?: Record<string, { url?: unknown }>;
  };
  liveStreamingDetails?: { actualStartTime?: unknown; actualEndTime?: unknown };
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Picks the stream that is live right now from a videos.list response. */
export function pickLive(items: VideoItem[]): LiveStream | null {
  for (const v of items) {
    const id = typeof v.id === "string" ? v.id : "";
    const live =
      v.snippet?.liveBroadcastContent === "live" &&
      !!v.liveStreamingDetails?.actualStartTime &&
      !v.liveStreamingDetails?.actualEndTime;
    if (!live || !VIDEO_ID.test(id)) continue;
    const title =
      typeof v.snippet?.title === "string" && v.snippet.title.trim()
        ? v.snippet.title.trim().slice(0, 140)
        : "XGamer is live";
    return {
      videoId: id,
      title,
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault_live.jpg`,
    };
  }
  return null;
}

export function uploadsPlaylist(channelId: string) {
  return /^UC[A-Za-z0-9_-]{22}$/.test(channelId)
    ? `UU${channelId.slice(2)}`
    : null;
}

/** Channel ID from YOUTUBE_CHANNEL_ID, or looked up once a day from the @handle. */
async function channelId(key: string): Promise<string | null> {
  const fixed = process.env.YOUTUBE_CHANNEL_ID ?? "";
  if (uploadsPlaylist(fixed)) return fixed;
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(CHANNELS.youtube.handle)}&key=${encodeURIComponent(key)}`,
    { next: { revalidate: 86400 }, signal: AbortSignal.timeout(5000) },
  );
  if (!res.ok) return null;
  const id = (await res.json()).items?.[0]?.id;
  return typeof id === "string" && uploadsPlaylist(id) ? id : null;
}

/**
 * YouTube status for the shared live service. Offline only when YouTube
 * answered and nothing is live; anything else is unavailable.
 */
export async function youtubeStatus(): Promise<Check> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return UNAVAILABLE;
  const options = {
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(5000),
  };
  try {
    const playlist = uploadsPlaylist((await channelId(key)) ?? "");
    if (!playlist) return UNAVAILABLE;
    const list = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=5&playlistId=${playlist}&key=${encodeURIComponent(key)}`,
      options,
    );
    // A brand-new channel with no uploads has no playlist yet: nothing is live.
    if (list.status === 404) return OFFLINE;
    if (!list.ok) return UNAVAILABLE;
    const ids = ((await list.json()).items ?? [])
      .map(
        (i: { contentDetails?: { videoId?: unknown } }) =>
          i.contentDetails?.videoId,
      )
      .filter(
        (id: unknown): id is string =>
          typeof id === "string" && VIDEO_ID.test(id),
      );
    if (!ids.length) return OFFLINE;
    const videos = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${ids.join(",")}&key=${encodeURIComponent(key)}`,
      options,
    );
    if (!videos.ok) return UNAVAILABLE;
    const live = pickLive((await videos.json()).items ?? []);
    return live
      ? {
          state: "live",
          title: live.title,
          thumbnail: live.thumbnail,
          watchUrl: live.url,
          startedAt: null,
        }
      : OFFLINE;
  } catch {
    return UNAVAILABLE;
  }
}
