import { db } from "@/lib/db";

/** Public champion photo. Only served once the tournament is published. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-z0-9-]{3,80}$/.test(id) || !process.env.DATABASE_URL)
    return new Response(null, { status: 404 });
  try {
    const [row] = await db()<
      { content_type: string; data: Buffer }[]
    >`select p.content_type,p.data from tournament_photo p join tournament t on t.id=p.tournament_id
      where p.tournament_id=${id} and t.published and t.deleted_at is null`;
    if (!row) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(row.data), {
      headers: {
        "Content-Type": row.content_type,
        "Cache-Control": "public, max-age=300, s-maxage=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
