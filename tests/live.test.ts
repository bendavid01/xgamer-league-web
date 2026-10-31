import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getLiveStatus,
  liveNow,
  parseKick,
  parseTwitch,
  safeUrl,
} from "../src/lib/live";

test("Twitch: live only when Helix reports a live stream for our channel", () => {
  assert.equal(parseTwitch({ data: [] }, "xgamerproleague").state, "offline");
  assert.equal(
    parseTwitch({ error: "x" }, "xgamerproleague").state,
    "unavailable",
  );
  const live = parseTwitch(
    {
      data: [
        {
          user_login: "xgamerproleague",
          type: "live",
          title: "  Community night  ",
          started_at: "2026-10-31T14:00:00Z",
          thumbnail_url:
            "https://static-cdn.jtvnw.net/previews-ttv/live_user_x-{width}x{height}.jpg",
        },
      ],
    },
    "xgamerproleague",
  );
  assert.equal(live.state, "live");
  assert.equal(live.title, "Community night");
  assert.equal(live.watchUrl, "https://www.twitch.tv/xgamerproleague");
  assert.match(live.thumbnail!, /640x360\.jpg$/);
  // Someone else's stream never counts.
  assert.equal(
    parseTwitch(
      { data: [{ user_login: "other", type: "live" }] },
      "xgamerproleague",
    ).state,
    "offline",
  );
});

test("Kick: is_live decides; a missing channel is unavailable, not offline", () => {
  const body = (isLive: boolean) => ({
    data: [
      {
        slug: "xgamerproleague",
        stream_title: "Knockout night",
        stream: { is_live: isLive, start_time: "2026-10-31T15:00:00Z" },
      },
    ],
  });
  assert.equal(parseKick(body(false), "xgamerproleague").state, "offline");
  const live = parseKick(body(true), "xgamerproleague");
  assert.equal(live.state, "live");
  assert.equal(live.title, "Knockout night");
  assert.equal(live.watchUrl, "https://kick.com/xgamerproleague");
  assert.equal(parseKick({ data: [] }, "xgamerproleague").state, "unavailable");
  assert.equal(parseKick({}, "xgamerproleague").state, "unavailable");
});

test("only https images from the platform's own hosts are shown", () => {
  assert.equal(safeUrl("javascript:alert(1)", /jtvnw\.net$/), null);
  assert.equal(
    safeUrl("http://static-cdn.jtvnw.net/a.jpg", /jtvnw\.net$/),
    null,
  );
  assert.equal(
    safeUrl("https://evil.example/a.jpg", /(^|\.)jtvnw\.net$/),
    null,
  );
  assert.ok(safeUrl("https://static-cdn.jtvnw.net/a.jpg", /(^|\.)jtvnw\.net$/));
});

test("shared status: no keys means unavailable everywhere, never offline or invented", async () => {
  for (const k of [
    "YOUTUBE_API_KEY",
    "TWITCH_CLIENT_ID",
    "TWITCH_CLIENT_SECRET",
    "KICK_CLIENT_ID",
    "KICK_CLIENT_SECRET",
  ])
    delete process.env[k];
  const all = await getLiveStatus();
  assert.deepEqual(
    all.map((c) => [c.platform, c.state]),
    [
      ["youtube", "unavailable"],
      ["twitch", "unavailable"],
      ["kick", "unavailable"],
    ],
  );
  assert.equal(liveNow(all).length, 0);
  assert.ok(all.every((c) => c.title === null && c.watchUrl === null));
});

test("shared status: simultaneous platforms and failures are reported independently", async () => {
  process.env.TWITCH_CLIENT_ID = "id";
  process.env.TWITCH_CLIENT_SECRET = "secret";
  process.env.KICK_CLIENT_ID = "id";
  process.env.KICK_CLIENT_SECRET = "secret";
  process.env.YOUTUBE_API_KEY = "key";
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.includes("/oauth"))
      return Response.json({ access_token: "t", expires_in: 3600 });
    if (url.includes("api.twitch.tv"))
      return Response.json({
        data: [
          {
            user_login: "xgamerproleague",
            type: "live",
            title: "Live on Twitch",
          },
        ],
      });
    if (url.includes("api.kick.com"))
      return Response.json({
        data: [
          {
            slug: "xgamerproleague",
            stream_title: "Kick too",
            stream: { is_live: true },
          },
        ],
      });
    return new Response("quota", { status: 403 }); // YouTube fails
  }) as typeof fetch;
  try {
    const all = await getLiveStatus();
    const state = Object.fromEntries(all.map((c) => [c.platform, c.state]));
    assert.deepEqual(state, {
      youtube: "unavailable",
      twitch: "live",
      kick: "live",
    });
    assert.deepEqual(
      liveNow(all).map((c) => c.name),
      ["Twitch", "Kick"],
    );
  } finally {
    globalThis.fetch = real;
  }
});
