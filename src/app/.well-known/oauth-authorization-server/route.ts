import {
  authorizationServerMetadata,
  CORS,
  mcpEnabled,
  notFound,
  oauthJson,
} from "@/lib/oauth";

/** RFC 8414 metadata: tells Claude where to log in and get tokens. */
export function GET() {
  return mcpEnabled() ? oauthJson(authorizationServerMetadata()) : notFound();
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
