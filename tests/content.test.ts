import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeFormat,
  formatDate,
  formatRupees,
  normalizeTournament,
  primaryAction,
  safeHref,
} from "../src/lib/content";

const base = {
  title: "XGamer November Cup",
  slug: "november-cup",
  status: "registration_open",
  format: "league_knockout",
  playersNeeded: 64,
  leagueOpponents: 4,
  qualifiers: 8,
  matchRules: [
    { title: "Match settings", items: ["Match time: 10 minutes", "  "] },
    { title: "Empty card", items: [] },
  ],
};

test("incomplete or malformed tournaments are dropped, never guessed", () => {
  assert.equal(normalizeTournament(null), null);
  for (const broken of [
    { title: "" },
    { playersNeeded: undefined },
    { playersNeeded: 2.5 },
    { status: "live-now" },
    { format: "swiss" },
  ])
    assert.equal(normalizeTournament({ ...base, ...broken }), null);
});

test("optional values stay empty and empty rule cards are removed", () => {
  const t = normalizeTournament(base)!;
  assert.equal(t.entryFee, null);
  assert.equal(t.prize, null);
  assert.equal(t.startDate, null);
  assert.deepEqual(t.matchRules, [
    { title: "Match settings", items: ["Match time: 10 minutes"] },
  ]);
  assert.equal(formatRupees(t.entryFee), null);
  assert.equal(formatRupees(0), "Free");
  assert.equal(formatRupees(1500), "₹1,500");
});

test("league settings are ignored for a pure knockout", () => {
  const t = normalizeTournament({
    ...base,
    format: "knockout",
    playersNeeded: 16,
  })!;
  assert.equal(t.leagueOpponents, null);
  assert.equal(t.qualifiers, null);
  assert.deepEqual(describeFormat(t), {
    label: "Knockout",
    facts: [
      "Single elimination — lose once and you're out",
      "4 rounds to win the cup",
    ],
  });
});

test("format descriptions use only published values", () => {
  const lk = normalizeTournament(base)!;
  assert.deepEqual(describeFormat(lk).facts, [
    "League phase: 4 matches per player",
    "Top 8 qualify for the knockout",
  ]);
  const league = normalizeTournament({
    ...base,
    format: "league",
    playersNeeded: 8,
  })!;
  assert.deepEqual(describeFormat(league), {
    label: "League",
    facts: [
      "Round robin: everyone plays everyone once",
      "7 matches per player",
    ],
  });
});

test("one primary action per status", () => {
  const discord = "https://discord.gg/hYUaqdjaSc";
  const t = normalizeTournament(base)!;
  assert.equal(primaryAction(t, discord).href, "/register");
  assert.equal(
    primaryAction({ ...t, status: "announced" }, discord).href,
    discord,
  );
  assert.equal(
    primaryAction({ ...t, status: "registration_closed" }, discord).href,
    "/tournament",
  );
  assert.equal(
    primaryAction({ ...t, status: "in_progress" }, discord).href,
    "/matches",
  );
  assert.equal(
    primaryAction({ ...t, status: "completed" }, discord).href,
    "/table",
  );
  assert.equal(primaryAction(null, discord).note, null);
});

test("dates render in IST and CMS links must be https or same-site", () => {
  assert.equal(formatDate("2026-11-15"), "15 Nov 2026");
  assert.equal(formatDate(null), null);
  assert.equal(formatDate("not a date"), null);
  assert.equal(safeHref("/rules"), "/rules");
  assert.equal(safeHref("https://discord.gg/x"), "https://discord.gg/x");
  for (const bad of [
    "javascript:alert(1)",
    "http://x.com",
    "//evil.com",
    "data:text/html,x",
  ])
    assert.equal(safeHref(bad), null);
});
