import { cache } from "react";
import { youtubeStatus } from "./youtube";

/**
 * One central check of XGamer's official channels on YouTube, Twitch and Kick.
 * The navbar badge, the homepage banner, /live and every tournament Live tab
 * read this same data.
 *
 * States are strict:
 * - "live": the platform itself confirmed a broadcast right now
 * - "offline": the platform confirmed there is no broadcast
 * - "unavailable": we could not check (no keys yet, timeout, API error)
 * A failed check is never reported as offline.
 *
 * Streams are global XGamer broadcasts. They are never linked to a tournament.
 * API keys stay on the server; responses are cached for about a minute.
 */
export type Platform = "youtube" | "twitch" | "kick";
export type StreamState = "live" | "offline" | "unavailable";
export type ChannelStatus = {
  platform: Platform;
  name: string;
  handle: string;
  channelUrl: string;
  state: StreamState;
  title: string | null;
  thumbnail: string | null;
  watchUrl: string | null;
  startedAt: string | null;
};
export type Check = Pick<
  ChannelStatus,
  "state" | "title" | "thumbnail" | "watchUrl" | "startedAt"
>;

export const CHANNELS: Record<
  Platform,
  { name: string; handle: string; login: string; channelUrl: string }
> = {
  youtube: {
    name: "YouTube",
    handle: "@XGamerProLeague",
    login: "XGamerProLeague",
    channelUrl: "https://www.youtube.com/@XGamerProLeague",
  },
  twitch: {
    name: "Twitch",
    handle: "xgamerproleague",
    login: "xgamerproleague",
    channelUrl: "https://www.twitch.tv/xgamerproleague",
  },
  kick: {
    name: "Kick",
    handle: "xgamerproleague",
    login: "xgamerproleague",
    channelUrl: "https://kick.com/xgamerproleague",
  },
};

export const REFRESH_SECONDS = 60;
export const UNAVAILABLE: Check = {
  state: "unavailable",
  title: null,
  thumbnail: null,
  watchUrl: null,
  startedAt: null,
};
export const OFFLINE: Check = { ...UNAVAILABLE, state: "offline" };

const TIMEOUT = 5000;
const cached = { next: { revalidate: REFRESH_SECONDS } };

/** Only https URLs on the expected hosts are passed to the page. */
export function safeUrl(value: unknown, hosts: RegExp) {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && hosts.test(u.hostname)
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}
const clean = (value: unknown) =>
  typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/g, " ").slice(0, 140)
    : null;

/* ─────────────── App access tokens (client credentials) ─────────────── */

type Token = { value: string; expires: number };
const tokens = new Map<string, Token>();

async function appToken(
  key: string,
  url: string,
  clientId: string,
  secret: string,
) {
  const held = tokens.get(key);
  if (held && held.expires > Date.now() + 60_000) return held.value;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const body = (await res.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  if (typeof body.access_token !== "string") throw new Error("token");
  const seconds = typeof body.expires_in === "number" ? body.expires_in : 3600;
  tokens.set(key, {
    value: body.access_token,
    expires: Date.now() + seconds * 1000,
  });
  return body.access_token;
}

/* ─────────────── Twitch (Helix) ─────────────── */

/** Reads GET /helix/streams. An empty list means offline. */
export function parseTwitch(body: unknown, login: string): Check {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) return UNAVAILABLE;
  const s = data.find(
    (d) =>
      d &&
      typeof d === "object" &&
      String((d as { user_login?: unknown }).user_login).toLowerCase() ===
        login.toLowerCase(),
  ) as Record<string, unknown> | undefined;
  if (!s || s.type !== "live") return OFFLINE;
  const thumb =
    typeof s.thumbnail_url === "string"
      ? s.thumbnail_url.replace("{width}", "640").replace("{height}", "360")
      : null;
  return {
    state: "live",
    title: clean(s.title) ?? "XGamer is live",
    thumbnail: safeUrl(thumb, /(^|\.)jtvnw\.net$/),
    watchUrl: `https://www.twitch.tv/${login}`,
    startedAt: typeof s.started_at === "string" ? s.started_at : null,
  };
}

async function twitchStatus(): Promise<Check> {
  const id = process.env.TWITCH_CLIENT_ID,
    secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return UNAVAILABLE;
  try {
    const token = await appToken(
      "twitch",
      "https://id.twitch.tv/oauth2/token",
      id,
      secret,
    );
    const { login } = CHANNELS.twitch;
    const res = await fetch(
      `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`,
      {
        headers: { "Client-Id": id, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT),
        ...cached,
      },
    );
    if (res.status === 401) tokens.delete("twitch");
    if (!res.ok) return UNAVAILABLE;
    return parseTwitch(await res.json(), login);
  } catch {
    return UNAVAILABLE;
  }
}

/* ─────────────── Kick (public API v1) ─────────────── */

/** Reads GET /public/v1/channels?slug=… (stream.is_live, stream_title). */
export function parseKick(body: unknown, slug: string): Check {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) return UNAVAILABLE;
  const c = data.find(
    (d) =>
      d &&
      typeof d === "object" &&
      String((d as { slug?: unknown }).slug).toLowerCase() ===
        slug.toLowerCase(),
  ) as
    | {
        stream_title?: unknown;
        stream?: {
          is_live?: unknown;
          start_time?: unknown;
          thumbnail?: unknown;
        } | null;
      }
    | undefined;
  if (!c) return UNAVAILABLE; // the channel itself was not returned: unknown, not offline
  if (c.stream?.is_live !== true) return OFFLINE;
  return {
    state: "live",
    title: clean(c.stream_title) ?? "XGamer is live",
    thumbnail: safeUrl(c.stream.thumbnail, /(^|\.)kick\.com$/),
    watchUrl: `https://kick.com/${slug}`,
    startedAt:
      typeof c.stream.start_time === "string" ? c.stream.start_time : null,
  };
}

async function kickStatus(): Promise<Check> {
  const id = process.env.KICK_CLIENT_ID,
    secret = process.env.KICK_CLIENT_SECRET;
  if (!id || !secret) return UNAVAILABLE;
  try {
    const token = await appToken(
      "kick",
      "https://id.kick.com/oauth/token",
      id,
      secret,
    );
    const { login } = CHANNELS.kick;
    const res = await fetch(
      `https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(login)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(TIMEOUT),
        ...cached,
      },
    );
    if (res.status === 401) tokens.delete("kick");
    if (!res.ok) return UNAVAILABLE;
    return parseKick(await res.json(), login);
  } catch {
    return UNAVAILABLE;
  }
}

/* ─────────────── The one shared status ─────────────── */

export const getLiveStatus = cache(async (): Promise<ChannelStatus[]> => {
  const [youtube, twitch, kick] = await Promise.all([
    youtubeStatus().catch(() => UNAVAILABLE),
    twitchStatus(),
    kickStatus(),
  ]);
  const checks: Record<Platform, Check> = { youtube, twitch, kick };
  return (Object.keys(CHANNELS) as Platform[]).map((p) => ({
    platform: p,
    name: CHANNELS[p].name,
    handle: CHANNELS[p].handle,
    channelUrl: CHANNELS[p].channelUrl,
    ...checks[p],
  }));
});

export const liveNow = (all: ChannelStatus[]) =>
  all.filter((c) => c.state === "live");
