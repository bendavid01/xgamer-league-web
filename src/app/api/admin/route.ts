import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json(
    { error: "Administrator access is not configured." },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
export const POST = GET;
