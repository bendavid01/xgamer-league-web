/**
 * Which team name the public site shows (approved rollout switch, TEAM_DISPLAY).
 *
 * - "current" (default, and for any other value): every page shows the player's
 *   current team, exactly as before migration 007. Per-tournament team lines
 *   added by 007 stay hidden.
 * - "entry": each tournament shows the team stored for that entry. An entry
 *   without one shows "Not recorded". It never falls back to the current team.
 *
 * Switch to "entry" only after Data health shows no unrecorded entries.
 */
export type TeamDisplay = "current" | "entry";

export const NOT_RECORDED = "Not recorded";

export function teamDisplay(
  env: Record<string, string | undefined> = process.env,
): TeamDisplay {
  return env.TEAM_DISPLAY?.trim() === "entry" ? "entry" : "current";
}

/** The team shown for a player in a tournament (lists, podiums, champions). */
export function tournamentTeam(
  current: string | null,
  entry: string | null,
  mode: TeamDisplay = teamDisplay(),
): string | null {
  return mode === "entry" ? (entry ?? NOT_RECORDED) : current;
}

/**
 * The per-tournament team line on a career card. Hidden in "current" mode,
 * where the profile header already shows the current team.
 */
export function careerTeam(
  entry: string | null,
  mode: TeamDisplay = teamDisplay(),
): string | null {
  return mode === "entry" ? (entry ?? NOT_RECORDED) : null;
}
