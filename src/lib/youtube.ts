import { cache } from "react";

/**
 * "Live now" detection for the official YouTube channel.
 * WHY: search.list costs 100 quota units per call; reading the channel's uploads playlist (1 unit)
 * and the latest videos' live state (1 unit) lets the site check every minute within the free quota.
 * Requires YOUTUBE_API_KEY and YOUTUBE_CHANNEL_ID (UC…). Without them the banner simply never shows.
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

export const getLiveStream = cache(async (): Promise<LiveStream | null> => {
  const key = process.env.YOUTUBE_API_KEY;
  const playlist = uploadsPlaylist(process.env.YOUTUBE_CHANNEL_ID ?? "");
  if (!key || !playlist) return null;
  const options = {
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(5000),
  };
  try {
    const list = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=5&playlistId=${playlist}&key=${encodeURIComponent(key)}`,
      options,
    );
    if (!list.ok) return null;
    const ids = ((await list.json()).items ?? [])
      .map(
        (i: { contentDetails?: { videoId?: unknown } }) =>
          i.contentDetails?.videoId,
      )
      .filter(
        (id: unknown): id is string =>
          typeof id === "string" && VIDEO_ID.test(id),
      );
    if (!ids.length) return null;
    const videos = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${ids.join(",")}&key=${encodeURIComponent(key)}`,
      options,
    );
    if (!videos.ok) return null;
    return pickLive((await videos.json()).items ?? []);
  } catch {
    return null;
  }
});
