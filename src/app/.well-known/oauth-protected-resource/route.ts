import {
  CORS,
  mcpEnabled,
  notFound,
  oauthJson,
  protectedResourceMetadata,
} from "@/lib/oauth";

/** RFC 9728 metadata for /api/mcp: which authorization server protects it. */
export function GET() {
  return mcpEnabled() ? oauthJson(protectedResourceMetadata()) : notFound();
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
