import { NextRequest, NextResponse } from "next/server";
import { createClient } from "next-sanity";
import { isValidSignature, SIGNATURE_HEADER_NAME } from "@sanity/webhook"; // 👈 MUST HAVE THIS

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
    const signature = req.headers.get(SIGNATURE_HEADER_NAME) || "";
    const bodyText = await req.text();

    // 1. VERIFY SIGNATURE (The Math Check)
    if (!SECRET || !isValidSignature(bodyText, signature, SECRET)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = JSON.parse(bodyText);
    const { _id, _type, ...current } = body;
    const previous = body.before || {};

    if (_type !== "match") return NextResponse.json({ message: "Ignored" }, { status: 200 });

    // 2. CALCULATE CHANGES
    const changes: string[] = [];

    if (previous.status !== current.status) {
      changes.push(`Status: ${previous.status} -> ${current.status}`);
    }

    const prevScore = `${previous.homeScore ?? 0}-${previous.awayScore ?? 0}`;
    const currScore = `${current.homeScore ?? 0}-${current.awayScore ?? 0}`;
    if (prevScore !== currScore) {
      changes.push(`Score: ${prevScore} -> ${currScore}`);
    }

    // 3. WRITE LOG
    if (changes.length > 0) {
      await auditClient.create({
        _type: "auditLog",
        action: "MATCH_UPDATE",
        description: changes.join(" | "),
        match: { _type: "reference", _ref: _id },
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Audit Error:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}