import { endpoint, response } from "@/lib/api";
import { readPhoto, savePhoto } from "@/lib/control";

/** POST /api/admin/photo?t=<id>&consent=yes with the image bytes as the body. */
export async function POST(request: Request) {
  return endpoint(async () => response(await savePhoto(request)));
}

/** GET /api/admin/photo?t=<id> — organizer preview (works before publishing). */
export async function GET(request: Request) {
  return endpoint(async () => {
    const t = new URL(request.url).searchParams.get("t") ?? "";
    const photo = await readPhoto(t);
    if (!photo) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(photo.data), {
      headers: {
        "Content-Type": photo.content_type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
