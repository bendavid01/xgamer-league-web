/** Shared, client-safe names for tournament formats and seasons. */

export type FormatChoice = "league" | "knockout" | "league_knockout";

export const FORMAT_LABEL: Record<FormatChoice, string> = {
  league: "League",
  knockout: "Knockout (eFootball app)",
  league_knockout: "League + Knockout (eFootball app)",
};

/** Short form for compact cards. */
export const FORMAT_SHORT: Record<FormatChoice, string> = {
  league: "League",
  knockout: "Knockout",
  league_knockout: "League + Knockout",
};

export const FORMAT_CHOICES = Object.keys(FORMAT_LABEL) as FormatChoice[];

export const formatChoice = (t: {
  format: string;
  knockout?: boolean | null;
}): FormatChoice =>
  t.format === "knockout"
    ? "knockout"
    : t.knockout
      ? "league_knockout"
      : "league";

export const storedFormat = (f: FormatChoice) => ({
  format: f === "knockout" ? ("knockout" as const) : ("league" as const),
  knockout: f === "league_knockout",
});

type Named = {
  name: string;
  competition?: string | null;
  season?: number | null;
};

/** "XGamer Pro League · Season 2", or just the name for a one-off cup. */
export const tournamentLabel = (t: Named) =>
  t.season ? `${t.competition ?? t.name} · Season ${t.season}` : t.name;

/** "Season 1 Champion", or "Champion" for a one-off cup. */
export const championTitle = (t: Named) =>
  t.season ? `Season ${t.season} Champion` : "Champion";

export const PLACE_LABEL = ["", "Champion", "Runner-up", "Third place"];
export const ordinal = (n: number) =>
  `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
