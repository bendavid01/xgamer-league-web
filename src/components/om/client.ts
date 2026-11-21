import { useRef } from "react";
import type { EditResult } from "./types";

/**
 * Sends one edit. A form keeps the same request ID until it succeeds, so a retry
 * after a dropped connection can never apply the change twice.
 */
export function useEditSender() {
  const ids = useRef<Record<string, string>>({});
  return async (
    form: string,
    value: Record<string, unknown>,
  ): Promise<EditResult> => {
    ids.current[form] ??= crypto.randomUUID();
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...value, requestId: ids.current[form] }),
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) {
        // A refused change was never recorded, so a corrected resubmit is a new request.
        if (r.status < 500) delete ids.current[form];
        return { ok: false, error: result.error ?? "Something went wrong." };
      }
      delete ids.current[form];
      return { ok: true, data: result };
    } catch {
      return {
        ok: false,
        error: "No connection. Nothing is lost; press the button again.",
      };
    }
  };
}

/** Asks the server for one number (audited, rate-limited). Nothing is kept afterwards. */
export async function disclose(
  tournament: string,
  playerId: string,
  purpose: string,
): Promise<{ phone: string; waUrl: string } | { error: string }> {
  try {
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "contact.disclose",
        tournament,
        playerId,
        purpose,
        requestId: crypto.randomUUID(),
      }),
    });
    const v = await r.json().catch(() => ({}));
    if (!r.ok) return { error: v.error ?? "Could not open the number." };
    return { phone: v.phone, waUrl: v.waUrl };
  } catch {
    return { error: "No connection." };
  }
}

/** Shrinks a photo in the browser to a JPEG under ~700 KB before upload. */
export async function compress(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  for (const [edge, quality] of [
    [1400, 0.85],
    [1200, 0.8],
    [1000, 0.75],
    [800, 0.7],
  ] as const) {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", quality),
    );
    if (blob && blob.size <= 700 * 1024) return blob;
  }
  throw new Error("This photo is too large. Try a smaller one.");
}
