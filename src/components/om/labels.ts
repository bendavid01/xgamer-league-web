import { FORMAT_LABEL } from "@/lib/labels";
import type {
  Competitions,
  Section,
  Status,
  TeamSource,
  TournamentRow,
} from "./types";

export const PHASE: Record<Status, string> = {
  draft: "Setting up",
  open: "Registration open",
  locked: "Registration closed",
  league: "League in progress",
  knockout: "Knockout in eFootball app",
  completed: "Completed",
};
export const FILTERS = [
  ["pending", "Pending"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["all", "All"],
] as const;
export const ACTION_LABEL: Record<string, string> = {
  "application.create": "Registered",
  "application.restore": "Restored removed entry",
  review: "Reviewed players",
  delete: "Removed player",
  configure: "Updated settings",
  generate: "Generated fixtures",
  score: "Entered score",
  announce: "Published announcement",
  coordinator: "Coordinator access",
  "player.edit_name": "Changed gaming name",
  "player.edit_team": "Changed current team",
  "player.edit_efootball": "Changed eFootball ID",
  "application.team_attest": "Attested tournament team",
  "application.team_correct": "Corrected tournament team",
  "contact.disclose": "Viewed WhatsApp number",
  "contact.change_start": "Started WhatsApp number change",
  "contact.change_code": "Checked WhatsApp code",
  "contact.change_code_rejected": "Rejected WhatsApp code attempt",
  "contact.change_approve": "Approved WhatsApp number change",
  "contact.change_reject": "Rejected WhatsApp number change",
  "contact.change_cancel": "Cancelled WhatsApp number change",
};
/** OM only. The public site never shows where a team name came from. */
export const SOURCE_TAG: Record<TeamSource, string> = {
  registration: "Registration",
  registration_record: "Registration record",
  organizer_attested: "Attested",
  organizer_corrected: "Corrected",
};
export const METHOD_LABEL: Record<string, string> = {
  organizer_attested_established_channel:
    "organizer-attested through the established channel",
  organizer_attested_independent_evidence:
    "organizer-attested with independent evidence and a second admin",
};
export const EVIDENCE_LABEL: Record<string, string> = {
  efootball_possession: "eFootball account possession (server challenge)",
  known_person_live_video: "Live video with an admin who knows the player",
  known_person_in_person: "In person with an admin who knows the player",
};
export const ATTEST_REASON =
  "Historical entry before 007; Owner attestation 13 Nov 2026";
export const HEALTH_LABEL = {
  ok: "OK",
  warn: "Review",
  error: "Problem",
  info: "Info",
} as const;

export const SECTION_LABEL: Record<Section, string> = {
  overview: "Overview",
  tournaments: "Tournaments",
  players: "Players",
  audit: "Audit Log",
  health: "System Health",
  access: "Coordinator access",
};

export const formatLabel = (t: {
  format: string;
  knockout: boolean;
  legs?: number;
  qualifiers?: number;
}) =>
  t.format === "knockout"
    ? FORMAT_LABEL.knockout
    : `${t.knockout ? `League (Top ${t.qualifiers ?? ""}) + Knockout (eFootball app)` : "League"}${t.legs === 2 ? " · home & away" : ""}`;

export const competitionsOf = (rows: TournamentRow[]): Competitions => {
  const out: Competitions = new Map();
  for (const t of rows)
    if (t.competition && t.season) {
      const key = t.competition.toLowerCase();
      const c = out.get(key) ?? { name: t.competition, seasons: [] };
      c.seasons.push(t.season);
      out.set(key, c);
    }
  return out;
};
export const nextSeason = (c?: { seasons: number[] }) =>
  c?.seasons.length ? Math.max(...c.seasons) + 1 : 1;

/** Same rule as the original OM: entries can change until fixtures exist. */
export const fieldOpenFor = (status: Status) =>
  ["draft", "open", "locked"].includes(status);

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
