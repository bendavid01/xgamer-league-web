import { NextResponse } from "next/server";
// Deliberately fail closed. Never collect PII without private durable storage.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Registration is not accepting submissions until private storage and identity verification are configured.",
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "86400" },
    },
  );
}
