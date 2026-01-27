import { NextRequest, NextResponse } from "next/server";
import { createClient } from "next-sanity";
import { isValidSignature, SIGNATURE_HEADER_NAME } from "@sanity/webhook";

// 1. SETUP CLIENT
const auditClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  token: process.env.SANITY_API_WRITE_TOKEN,
  apiVersion: "2024-01-01",
  useCdn: false,
});

const SECRET = process.env.AUDIT_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  // 2. READ SIGNATURE & BODY
  const signature = req.headers.get(SIGNATURE_HEADER_NAME) || "";
  const bodyText = await req.text();

  // 3. SECURITY CHECK — shared secret via Authorization header
  const auth = req.headers.get("authorization");

  if (!SECRET || auth !== `Bearer ${SECRET}`) {
    console.error("❌ Unauthorized webhook request");
    console.error(`Received Auth: ${auth ? "Present" : "Missing"}`);
    console.error(`Expected Secret Length: ${SECRET ? SECRET.length : "Missing"}`);
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // 4. PROCESS DATA
  const body = JSON.parse(bodyText);
  const { _id, _type, ...current } = body;
  const previous = body.before || {};

  if (_type !== "match") return NextResponse.json({ message: "Ignored" }, { status: 200 });

  // 5. FIND CHANGES
  const changes: string[] = [];

  if (previous.status !== current.status) {
    changes.push(`Status: ${previous.status || "New"} -> ${current.status}`);
  }

  const prevScore = `${previous.homeScore ?? 0}-${previous.awayScore ?? 0}`;
  const currScore = `${current.homeScore ?? 0}-${current.awayScore ?? 0}`;
  if (prevScore !== currScore) {
    changes.push(`Score: ${prevScore} -> ${currScore}`);
  }

  // 6. WRITE LOG
  if (changes.length > 0) {
    await auditClient.create({
      _type: "auditLog",
      action: "MATCH_UPDATE",
      description: changes.join(" | "),
      match: { _type: "reference", _ref: _id.replace(/^drafts\./, "") }, // 👈 FORCE STABLE ID
      timestamp: new Date().toISOString(),
    });
    console.log(`✅ Logged audit entry for match: ${_id.replace(/^drafts\./, "")}`);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}