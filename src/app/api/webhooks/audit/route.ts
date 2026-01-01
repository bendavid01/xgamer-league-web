import { NextRequest, NextResponse } from "next/server";
import { createClient } from "next-sanity";

// 1. CONFIGURATION (Server-Side Only)
const auditClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  token: process.env.SANITY_API_WRITE_TOKEN, // 👈 Pulled from Vercel Env
  apiVersion: "2024-01-01",
  useCdn: false, // Must be false for writing
});

const WEBHOOK_SECRET = process.env.AUDIT_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  try {
    // 2. SECURITY: SHARED SECRET CHECK
    // We expect the header 'Authorization' to contain our secret string.
    const signature = req.headers.get("authorization");
    
    if (!WEBHOOK_SECRET || signature !== WEBHOOK_SECRET) {
      console.warn("[AUDIT] Unauthorized access attempt");
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // 3. PARSE PAYLOAD
    const body = await req.json();
    const { _id, _type } = body;

    if (_type !== "match") {
      return NextResponse.json({ message: "Ignored type" }, { status: 200 });
    }

    // 4. CALCULATE DIFF (Before vs After)
    const current = body;
    const previous = body.before || {}; 

    const changes: string[] = [];

    // Status Change
    if (previous.status !== current.status) {
      changes.push(`Status: ${previous.status || "New"} ➝ ${current.status}`);
    }

    // Score Change
    const prevScore = `${previous.homeScore ?? "?"}-${previous.awayScore ?? "?"}`;
    const currScore = `${current.homeScore ?? "?"}-${current.awayScore ?? "?"}`;
    
    if (prevScore !== currScore) {
      changes.push(`Score: ${prevScore} ➝ ${currScore}`);
    }

    // Group Change
    if (previous.group !== current.group && previous.group) {
      changes.push(`Group: ${previous.group} ➝ ${current.group}`);
    }

    // 5. WRITE LOG (Only if something changed)
    if (changes.length > 0) {
      await auditClient.create({
        _type: "auditLog",
        action: "MATCH_UPDATE",
        description: changes.join(" | "),
        match: { _type: "reference", _ref: _id }, // 👈 Correct Field Name
        timestamp: new Date().toISOString(),
        actor: "sanity-studio",
      });
      console.log(`[AUDIT] Success: ${_id}`);
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    // 6. QUIET FAILURE (Don't spam retries)
    console.error("[AUDIT ERROR]", error);
    return NextResponse.json({ message: "Error logged" }, { status: 200 });
  }
}