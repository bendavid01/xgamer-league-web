import { NextRequest, NextResponse } from "next/server";
import { createClient } from "next-sanity";
import { isValidSignature, SIGNATURE_HEADER_NAME } from "@sanity/webhook"; // 👈 New Import

// 1. CONFIGURATION
const auditClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  token: process.env.SANITY_API_WRITE_TOKEN,
  apiVersion: "2024-01-01",
  useCdn: false,
});

const SECRET = process.env.AUDIT_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  try {
    // 2. SECURITY: CRYPTOGRAPHIC VERIFICATION
    // Sanity sends the signature in a special header.
    const signature = req.headers.get(SIGNATURE_HEADER_NAME) || "";
    
    // We need the raw text to verify the signature
    const bodyText = await req.text();

    if (!SECRET) {
      console.error("❌ Missing AUDIT_WEBHOOK_SECRET");
      return NextResponse.json({ message: "Server Config Error" }, { status: 500 });
    }

    // This checks if the Hash matches the Body + Secret
    if (!isValidSignature(bodyText, signature, SECRET)) {
      console.warn("⚠️ Invalid Signature");
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // 3. PARSE PAYLOAD
    const body = JSON.parse(bodyText);
    const { _id, _type, ...current } = body;
    const previous = body.before || {};

    if (_type !== "match") {
      return NextResponse.json({ message: "Ignored type" }, { status: 200 });
    }

    // 4. DIFF CALCULATION
    const changes: string[] = [];

    // Status
    if (previous.status !== current.status) {
      changes.push(`Status: ${previous.status || "New"} -> ${current.status}`);
    }

    // Score
    const prevScore = `${previous.homeScore ?? 0}-${previous.awayScore ?? 0}`;
    const currScore = `${current.homeScore ?? 0}-${current.awayScore ?? 0}`;
    if (prevScore !== currScore) {
      changes.push(`Score: ${prevScore} -> ${currScore}`);
    }

    // Group
    if (previous.group !== current.group && previous.group) {
      changes.push(`Group: ${previous.group} -> ${current.group}`);
    }

    // 5. WRITE LOG
    if (changes.length > 0) {
      await auditClient.create({
        _type: "auditLog",
        action: "MATCH_UPDATE",
        description: changes.join(" | "),
        match: { _type: "reference", _ref: _id },
        timestamp: new Date().toISOString(),
      });
      console.log(`✅ [AUDIT] Logged: ${_id}`);
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error("🔥 [AUDIT ERROR]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}