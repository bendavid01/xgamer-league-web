import { NextRequest, NextResponse } from "next/server";
import { createClient } from "next-sanity";
import { isValidSignature, SIGNATURE_HEADER_NAME } from "@sanity/webhook";

const auditClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  token: process.env.SANITY_API_WRITE_TOKEN,
  apiVersion: "2024-01-01",
  useCdn: false,
});

const SECRET = process.env.AUDIT_WEBHOOK_SECRET;

type MatchAuditEventType =
  | "MATCH_DELETED"
  | "MATCH_CREATED"
  | "MATCH_COMPLETED"
  | "SCORE_CHANGED"
  | "MATCH_PUBLISHED"
  | "MATCH_UPDATED";

type TeamAuditEventType = "TEAM_DELETED" | "TEAM_CREATED" | "TEAM_UPDATED";

type AuditEvent = {
  eventType: MatchAuditEventType | TeamAuditEventType;
  title: string;
  description: string;
  matchId?: string;
  teamId?: string;
};

const cleanId = (id?: string) => (id ? id.replace(/^drafts\./, "") : undefined);

const buildRef = (id?: string) => (id ? { _type: "reference", _ref: id, _weak: true } : undefined);

/**
 * Deterministic single event resolver for MATCH documents.
 * Rules evaluated in order; first match wins. ONE event per webhook.
 * WHY: Previous multi-event + priority approach caused duplicates and wrong logs.
 */
function resolveMatchAuditEvent(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
  operation: string
): AuditEvent | null {
  const prev = previous as {
    status?: string;
    deleted?: boolean;
    homeScore?: number;
    awayScore?: number;
    group?: string;
    stage?: string;
    homeTeam?: unknown;
    awayTeam?: unknown;
  };
  const curr = current as {
    status?: string;
    deleted?: boolean;
    homeScore?: number;
    awayScore?: number;
    group?: string;
    stage?: string;
    homeTeam?: unknown;
    awayTeam?: unknown;
  };

  const matchId = cleanId((current?._id ?? previous?._id) as string);

  // 1) Hard delete operation (should not happen with soft delete, but handle for safety)
  if (operation === "delete") {
    return { eventType: "MATCH_DELETED", title: "Match deleted", description: "Match removed", matchId };
  }

  // 2) Create operation
  if (operation === "create") {
    return {
      eventType: "MATCH_CREATED",
      title: "Match created",
      description: `Match created with status ${curr?.status ?? "unknown"}`,
      matchId,
    };
  }

  // 3) Soft delete: deleted flipped from false/undefined to true
  if (curr?.deleted === true && prev?.deleted !== true) {
    return { eventType: "MATCH_DELETED", title: "Match deleted", description: "Match soft-deleted", matchId };
  }

  // 4) MATCH_COMPLETED absorbs score changes (checked before score change)
  if (prev?.status !== "completed" && curr?.status === "completed") {
    return {
      eventType: "MATCH_COMPLETED",
      title: "Match completed",
      description: `Status: ${prev?.status ?? "unknown"} -> completed`,
      matchId,
    };
  }

  // 5) Score changed
  const scoreChanged =
    prev?.homeScore !== curr?.homeScore || prev?.awayScore !== curr?.awayScore;
  if (scoreChanged) {
    const prevScore = `${prev?.homeScore ?? 0}-${prev?.awayScore ?? 0}`;
    const currScore = `${curr?.homeScore ?? 0}-${curr?.awayScore ?? 0}`;
    return {
      eventType: "SCORE_CHANGED",
      title: "Score changed",
      description: `Score: ${prevScore} -> ${currScore}`,
      matchId,
    };
  }

  // 6) First publish: previous had no status, now scheduled
  if (prev?.status == null && curr?.status === "scheduled") {
    return {
      eventType: "MATCH_PUBLISHED",
      title: "Match published",
      description: "Status -> scheduled",
      matchId,
    };
  }

  // 7) Meaningful fields changed (status, group, stage, teams)
  const meaningfulFieldsChanged =
    prev?.status !== curr?.status ||
    prev?.group !== curr?.group ||
    prev?.stage !== curr?.stage ||
    prev?.homeTeam !== curr?.homeTeam ||
    prev?.awayTeam !== curr?.awayTeam;

  if (meaningfulFieldsChanged) {
    const changes: string[] = [];
    if (prev?.status !== curr?.status) changes.push(`status: ${prev?.status ?? "n/a"} -> ${curr?.status ?? "n/a"}`);
    if (prev?.group !== curr?.group) changes.push(`group: ${prev?.group ?? "n/a"} -> ${curr?.group ?? "n/a"}`);
    if (prev?.stage !== curr?.stage) changes.push(`stage: ${prev?.stage ?? "n/a"} -> ${curr?.stage ?? "n/a"}`);
    return {
      eventType: "MATCH_UPDATED",
      title: "Match updated",
      description: changes.length ? changes.join(" | ") : "Match updated",
      matchId,
    };
  }

  // 8) No meaningful change — ignore
  return null;
}

/**
 * Deterministic single event resolver for TEAM documents.
 */
function resolveTeamAuditEvent(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
  operation: string
): AuditEvent | null {
  const prev = previous as { name?: string; group?: string; squad?: unknown[] };
  const curr = current as { name?: string; group?: string; squad?: unknown[] };

  const teamId = cleanId((current?._id ?? previous?._id) as string);

  if (operation === "delete") {
    return { eventType: "TEAM_DELETED", title: "Team deleted", description: "Team removed", teamId };
  }

  if (operation === "create") {
    return {
      eventType: "TEAM_CREATED",
      title: "Team created",
      description: `Team created: ${curr?.name ?? "unknown"}`,
      teamId,
    };
  }

  const changes: string[] = [];
  if (prev?.name !== curr?.name) changes.push(`name: ${prev?.name ?? "n/a"} -> ${curr?.name ?? "n/a"}`);
  if (prev?.group !== curr?.group) changes.push(`group: ${prev?.group ?? "n/a"} -> ${curr?.group ?? "n/a"}`);
  if (JSON.stringify(prev?.squad ?? []) !== JSON.stringify(curr?.squad ?? [])) {
    changes.push(
      `squad updated (${(prev?.squad ?? []).length} -> ${(curr?.squad ?? []).length} players)`
    );
  }

  if (changes.length === 0) return null;

  return {
    eventType: "TEAM_UPDATED",
    title: "Team updated",
    description: changes.join(" | "),
    teamId,
  };
}

/**
 * Idempotent audit log ID at MEANING level (not revision).
 * Same eventType + entityId = same doc = createOrReplace overwrites duplicates.
 * Multiple webhook deliveries per edit all resolve to one audit doc.
 */
function buildAuditId(eventType: string, entityId: string): string {
  return `audit.${eventType}.${entityId}`;
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get(SIGNATURE_HEADER_NAME) || "";
  const bodyText = await req.text();
  const auth = req.headers.get("authorization");

  if (!SECRET || auth !== `Bearer ${SECRET}`) {
    console.error("❌ Unauthorized webhook request (missing/invalid auth header)");
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isSignatureValid = await isValidSignature(bodyText, signature, SECRET);
  if (!isSignatureValid) {
    console.error("❌ Invalid webhook signature");
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = JSON.parse(bodyText);
  const current = (payload.current ?? payload.after ?? payload) as Record<string, unknown>;
  const previous = (payload.previous ?? payload.before ?? {}) as Record<string, unknown>;

  // Ignore draft documents / draft transitions — only process published docs
  const docId = (current?._id ?? previous?._id ?? payload?._id ?? payload?.projectDocumentId) as
    | string
    | undefined;
  if (typeof docId === "string" && docId.startsWith("drafts.")) {
    return NextResponse.json({ message: "Ignored (draft)" }, { status: 200 });
  }

  const type = (current?._type ?? payload?._type ?? previous?._type) as string;
  if (type !== "match" && type !== "team") {
    return NextResponse.json({ message: "Ignored" }, { status: 200 });
  }

  const operation =
    payload.transition ?? payload.operation ?? (previous?._id && !current?._id ? "delete" : "update");

  const isDelete =
    operation === "delete" ||
    payload._deleted === true ||
    (current === null || (current as { _deleted?: boolean })?._deleted === true);

  let event: AuditEvent | null = null;

  if (type === "match") {
    event = resolveMatchAuditEvent(
      isDelete ? (previous ?? {}) : previous,
      isDelete ? {} : current,
      isDelete ? "delete" : operation
    );
  } else if (type === "team") {
    event = resolveTeamAuditEvent(
      isDelete ? (previous ?? {}) : previous,
      isDelete ? {} : current,
      isDelete ? "delete" : operation
    );
  }

  if (!event) {
    return NextResponse.json({ message: "Ignored" }, { status: 200 });
  }

  const entityId = event.matchId ?? event.teamId ?? "unknown";
  const auditId = buildAuditId(event.eventType, entityId);

  // WHY: createOrReplace + deterministic ID = idempotent; retries don't create duplicates
  await auditClient.createOrReplace({
    _id: auditId,
    _type: "auditLog",
    eventType: event.eventType,
    title: event.title,
    description: event.description,
    match: buildRef(event.matchId),
    team: buildRef(event.teamId),
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ success: true, logged: event.eventType }, { status: 200 });
}
