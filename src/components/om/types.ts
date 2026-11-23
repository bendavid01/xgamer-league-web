import type { PendingNewPlayerRegistration } from "@/lib/new-player-registration";
import type { PendingReturningRegistration } from "@/lib/returning-registration";

/* Shapes returned by GET /api/admin (unchanged; the server owns them). */

export type User = {
  role: "admin" | "coordinator";
  operations: string[];
  name: string | null;
};
export type Status =
  "draft" | "open" | "locked" | "league" | "knockout" | "completed";
export type TournamentRow = {
  id: string;
  name: string;
  competition: string | null;
  season: number | null;
  published: boolean;
  status: Status;
  format: "league" | "knockout";
  knockout: boolean;
  qualifiers: number;
  legs: number;
};
export type Home = {
  user: User;
  tournaments: TournamentRow[];
  deleted: {
    id: string;
    name: string;
    competition: string | null;
    season: number | null;
    deleted_at: string;
  }[];
  coordinators: { discord_id: string; operations: string[]; active: boolean }[];
  audit: AuditRow[];
  /** The five latest audit events (admins; empty for coordinators). */
  recentActivity?: AuditRow[];
  /** Pending registration reviews across live tournaments (main admins only). */
  playerApprovals?: {
    registered: number;
    /** Registered applicants who set a password: approval activates their login. */
    accounts: number;
    guests: number;
    returning: number;
  } | null;
};
export type AuditRow = {
  id: number;
  created_at: string;
  actor: string;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  summary: string | null;
  affected: string | null;
  tournament_name?: string | null;
  before_value: unknown;
  after_value: unknown;
};
export type TeamSource =
  | "registration"
  | "registration_record"
  | "organizer_attested"
  | "organizer_corrected";
export type Application = {
  id: string;
  player_id: string;
  code: string;
  gaming_name: string;
  team_name: string | null;
  team_name_source: TeamSource | null;
  current_team: string | null;
  status: string;
  revision: number;
  /** Masked on the server ("+91 ••••••••10"); full numbers only through disclosure. */
  contact?: string;
  efootballId?: string | null;
};
export type Match = {
  id: string;
  home: string;
  /** Null for a bye. */
  away: string | null;
  round: number;
  home_score: number | null;
  away_score: number | null;
  revision: number;
};
export type Workspace = {
  user: User;
  tournament: {
    id: string;
    name: string;
    competition: string | null;
    season: number | null;
    published: boolean;
    status: Status;
    revision: number;
    format: "league" | "knockout";
    knockout: boolean;
    qualifiers: number;
    legs: 1 | 2;
    opponents: number | null;
    starts_on: string | null;
    registration_closes: string | null;
    entry_fee: number | null;
    prize: string | null;
    description: string | null;
  };
  applications: Application[];
  newPlayerRequests?: PendingNewPlayerRegistration[];
  /** Main admins only: the XG ID the next registered approval would take (preview). */
  nextAvailableXgId?: string | null;
  returningRequests?: PendingReturningRegistration[];
  fixtures: Match[];
  standings: {
    id: string;
    name: string;
    pts: number;
    gd: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
  }[];
  qualified: string[];
  podium: (string | null)[];
  photo: number | null;
  announcements: {
    id: string;
    title: string;
    message: string;
    created_at: string;
  }[];
};
export type Act = (
  value: Record<string, unknown>,
  done?: string,
) => Promise<boolean>;

/** Competitions that run in seasons, with the season numbers already used. */
export type Competitions = Map<string, { name: string; seasons: number[] }>;

export type HealthSection = {
  title: string;
  checks: {
    title: string;
    level: "ok" | "warn" | "error" | "info";
    detail: string;
    items?: string[];
  }[];
};

export type EditResult = {
  ok: boolean;
  error?: string;
  data?: Record<string, unknown>;
};

export type ContactInfo = {
  masked: string;
  version: number;
  attestedAt: string | null;
  method: string | null;
  route1Available: boolean;
  hasEfootballId: boolean;
  editingOn: boolean;
  canEdit: boolean;
  openChange: {
    id: string;
    route: string;
    evidenceType: string | null;
    status: string;
    requestedByMe: boolean;
    requestedByName: string | null;
    codeExpiresAt: string | null;
    expiresAt: string;
    approveBy: string | null;
    attemptsLeft: number;
    resendsLeft: number;
  } | null;
};
export type PlayerDetailsData = {
  role: "admin" | "coordinator";
  contact: ContactInfo | null;
  /** Main admins only: sign-in state for issuing claim and reset codes. */
  account?: {
    type: "registered" | "guest";
    claimed: boolean;
    nickname: string | null;
    nicknameLocked: boolean;
    lastLoginAt: string | null;
  } | null;
  canEdit: {
    name: boolean;
    team: boolean;
    tournamentTeams: boolean;
    efootball: boolean;
    whatsapp: boolean;
  };
  player: {
    id: string;
    code: string;
    gaming_name: string;
    team_name: string | null;
    hasEfootballId: boolean;
    efootballId?: string | null;
    efootballVersion?: string;
    removed: boolean;
  };
  entries: {
    id: string;
    tournament: string;
    label: string;
    status: string;
    removed: boolean;
    tournamentDeleted: boolean;
    team_name: string | null;
    team_name_source: TeamSource | null;
  }[];
  history: {
    id: number;
    created_at: string;
    actor_name: string | null;
    action: string;
    summary: string | null;
  }[];
};

export type ReviewEntry = {
  applicationId: string;
  tournament: string;
  label: string;
  status: string;
  code: string;
  gaming_name: string;
  currentTeam: string | null;
  evidence: {
    entries: number;
    registration_records: number;
    registration_audit_id: number | null;
    registration_at: string | null;
    record_has_team: boolean;
    team_edits: number;
  };
  eligible: boolean;
  reasons: string[];
};

export type ContactChangeRow = {
  id: string;
  tournament: string;
  code: string;
  gaming_name: string;
  route: string;
  evidenceType: string | null;
  evidenceNote: string | null;
  evidenceObservedAt: string | null;
  challengeConfirmedAt: string | null;
  codeCheckedAt: string | null;
  status: string;
  requestedByName: string | null;
  requestedByMe: boolean;
  reason: string | null;
  approveBy: string | null;
  expiresAt: string;
  newNumber: string;
};

/** Workspace sections, in sidebar order. */
export type Section =
  "overview" | "tournaments" | "players" | "audit" | "health" | "access";

/** The four tabs of a focused tournament. */
export type TournamentTab = "entries" | "fixtures" | "standings" | "setup";
