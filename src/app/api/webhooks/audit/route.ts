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

type AuditEventType =
  | "SCORE_CHANGED"
  | "MATCH_COMPLETED"
  | "MATCH_PUBLISHED"
  | "MATCH_DELETED"
  | "MATCH_CREATED"
  | "TEAM_CREATED"
  | "TEAM_UPDATED"
  | "TEAM_DELETED";

type AuditEvent = {
  eventType: AuditEventType;
  title: string;
  description: string;
  matchId?: string;
  teamId?: string;
};

const cleanId = (id?: string) => (id ? id.replace(/^drafts\./, "") : undefined);

const buildRef = (id?: string) => (id ? { _type: "reference", _ref: id, _weak: true } : undefined);

function selectSingleEvent(events: AuditEvent[]): AuditEvent[] {
  // Only allow both SCORE_CHANGED and MATCH_COMPLETED together; otherwise pick highest priority
  if (
    events.length === 2 &&
    events.some((e) => e.eventType === "SCORE_CHANGED") &&
    events.some((e) => e.eventType === "MATCH_COMPLETED")
  ) {
    return events;
  }

  if (events.length <= 1) return events;

  const priority: Record<AuditEventType, number> = {
    MATCH_COMPLETED: 3,
    MATCH_PUBLISHED: 2,
    SCORE_CHANGED: 1,
    MATCH_DELETED: 4,
    MATCH_CREATED: 4,
    TEAM_CREATED: 4,
    TEAM_UPDATED: 3,
    TEAM_DELETED: 4,
  };

  const [top] = [...events].sort((a, b) => (priority[b.eventType] ?? 0) - (priority[a.eventType] ?? 0));
  return [top];
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
  const current = payload.current ?? payload.after ?? payload;
  const previous = payload.previous ?? payload.before ?? {};

  const type = current?._type ?? payload?._type ?? previous?._type;
  if (type !== "match" && type !== "team") {
    return NextResponse.json({ message: "Ignored" }, { status: 200 });
  }

  const isDelete =
    payload.transition === "delete" ||
    payload.operation === "delete" ||
    payload._deleted === true ||
    current === null ||
    current?._deleted === true;

  const isCreate =
    payload.transition === "create" ||
    payload.operation === "create" ||
    (!previous?._id && !isDelete);

  const matchId = type === "match" ? cleanId(current?._id ?? payload?._id ?? previous?._id) : undefined;
  const teamId = type === "team" ? cleanId(current?._id ?? payload?._id ?? previous?._id) : undefined;

  const events: AuditEvent[] = [];

  if (type === "match") {
    if (isDelete) {
      events.push({
        eventType: "MATCH_DELETED",
        title: "Match deleted",
        description: "Match removed",
        matchId: matchId ?? cleanId(previous?._id),
      });
    } else if (isCreate) {
      events.push({
        eventType: "MATCH_CREATED",
        title: "Match created",
        description: `Match created with status ${current?.status ?? "unknown"}`,
        matchId,
      });
    } else {
      const scoreChanged =
        previous?.homeScore !== current?.homeScore || previous?.awayScore !== current?.awayScore;
      const statusChanged = previous?.status !== current?.status;

      if (scoreChanged) {
        const prevScore = `${previous?.homeScore ?? 0}-${previous?.awayScore ?? 0}`;
        const currScore = `${current?.homeScore ?? 0}-${current?.awayScore ?? 0}`;
        events.push({
          eventType: "SCORE_CHANGED",
          title: "Score changed",
          description: `Score: ${prevScore} -> ${currScore}`,
          matchId,
        });
      }

      if (statusChanged && previous?.status !== "completed" && current?.status === "completed") {
        events.push({
          eventType: "MATCH_COMPLETED",
          title: "Match completed",
          description: `Status: ${previous?.status ?? "unknown"} -> completed`,
          matchId,
        });
      } else if (statusChanged && current?.status === "scheduled") {
        events.push({
          eventType: "MATCH_PUBLISHED",
          title: "Match published",
          description: `Status: ${previous?.status ?? "unknown"} -> scheduled`,
          matchId,
        });
      }
    }
  }

  if (type === "team") {
    if (isDelete) {
      events.push({
        eventType: "TEAM_DELETED",
        title: "Team deleted",
        description: "Team removed",
        teamId,
      });
    } else if (isCreate) {
      events.push({
        eventType: "TEAM_CREATED",
        title: "Team created",
        description: `Team created: ${current?.name ?? "unknown"}`,
        teamId,
      });
    } else {
      const changes: string[] = [];
      if (previous?.name !== current?.name) changes.push(`name: ${previous?.name ?? "n/a"} -> ${current?.name ?? "n/a"}`);
      if (previous?.group !== current?.group) changes.push(`group: ${previous?.group ?? "n/a"} -> ${current?.group ?? "n/a"}`);
      if (JSON.stringify(previous?.squad ?? []) !== JSON.stringify(current?.squad ?? [])) {
        changes.push(
          `squad updated (${(previous?.squad ?? []).length} -> ${(current?.squad ?? []).length} players)`
        );
      }

      events.push({
        eventType: "TEAM_UPDATED",
        title: "Team updated",
        description: changes.length ? changes.join(" | ") : "Team updated",
        teamId,
      });
    }
  }

  const selectedEvents = selectSingleEvent(events);

  if (selectedEvents.length === 0) {
    return NextResponse.json({ message: "Ignored" }, { status: 200 });
  }

  await Promise.all(
    selectedEvents.map((event) =>
      auditClient.create({
        _type: "auditLog",
        eventType: event.eventType,
        title: event.title,
        description: event.description,
        match: buildRef(event.matchId),
        team: buildRef(event.teamId),
        timestamp: new Date().toISOString(),
      })
    )
  );

  return NextResponse.json({ success: true, logged: selectedEvents.map((e) => e.eventType) }, { status: 200 });
}