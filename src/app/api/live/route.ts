import { getLiveStatus } from "@/lib/live";

export const dynamic = "force-dynamic";

/** Shared live status for the page refresh. Public data only; keys stay on the server. */
export async function GET() {
  const channels = await getLiveStatus();
  return Response.json(
    { channels },
    {
      headers: {
        "Cache-Control":
          "public, max-age=30, s-maxage=60, stale-while-revalidate=30",
      },
    },
  );
}
