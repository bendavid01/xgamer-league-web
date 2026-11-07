import {
  clientIp,
  CORS,
  mcpEnabled,
  notFound,
  OAuthError,
  oauthFailure,
  oauthJson,
  registerClient,
} from "@/lib/oauth";

/** RFC 7591 Dynamic Client Registration. Only Claude and localhost redirect URIs are accepted. */
export async function POST(request: Request) {
  if (!mcpEnabled()) return notFound();
  try {
    const ip = clientIp(request);
    if (!ip)
      throw new OAuthError(
        "server_error",
        "Abuse protection is unavailable.",
        503,
      );
    const text = await request.text();
    if (text.length > 8192)
      throw new OAuthError("invalid_request", "Request too large.", 413);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new OAuthError("invalid_client_metadata", "JSON is required.");
    }
    return oauthJson(await registerClient(raw, ip), 201);
  } catch (error) {
    return oauthFailure(error);
  }
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
