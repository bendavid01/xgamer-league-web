"use client";
import Link from "next/link";
import { useState } from "react";

export type HubPlayer = { name: string; code: string };
export type HubMatch = {
  id: string;
  home: HubPlayer;
  away: HubPlayer;
  homeScore: number | null;
  awayScore: number | null;
};
export type HubRound = { round: number; matches: HubMatch[] };

/** Matches grouped as "Round N" with one compact line each, like the Organizer Manager. */
export default function RoundList({
  rounds,
  empty,
  search = true,
}: {
  rounds: HubRound[];
  empty: string;
  search?: boolean;
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = rounds
    .map((r) => ({
      ...r,
      matches: r.matches.filter(
        (m) =>
          !term || `${m.home.name} ${m.away.name}`.toLowerCase().includes(term),
      ),
    }))
    .filter((r) => r.matches.length);
  return (
    <div>
      {search && rounds.length > 0 && (
        <label className="hub-search">
          <span className="sr-only">Find a player</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a player…"
          />
        </label>
      )}
      {shown.length ? (
        <div className="space-y-4">
          {shown.map((r) => (
            <section key={r.round} className="hub-round">
              <h3>Round {r.round}</h3>
              <ul>
                {r.matches.map((m) => (
                  <MatchRow key={m.id} m={m} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="notice">{term ? "No matches for that player." : empty}</p>
      )}
    </div>
  );
}

export function MatchRow({ m }: { m: HubMatch }) {
  const played = m.homeScore !== null && m.awayScore !== null;
  const win = played
    ? m.homeScore! > m.awayScore!
      ? "home"
      : m.homeScore! < m.awayScore!
        ? "away"
        : null
    : null;
  return (
    <li className="hub-row">
      <Link
        href={`/players/${m.home.code}`}
        className={`hub-name ${win === "home" ? "hub-win" : ""}`}
      >
        {m.home.name}
      </Link>
      <span className={played ? "hub-score" : "hub-vs"}>
        {played ? `${m.homeScore} – ${m.awayScore}` : "vs"}
      </span>
      <Link
        href={`/players/${m.away.code}`}
        className={`hub-name hub-away ${win === "away" ? "hub-win" : ""}`}
      >
        {m.away.name}
      </Link>
    </li>
  );
}
