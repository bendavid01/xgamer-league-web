import {
  CORS,
  exchange,
  mcpEnabled,
  notFound,
  oauthFailure,
  oauthJson,
  readForm,
} from "@/lib/oauth";

/** Exchanges an authorization code (with PKCE) or a refresh token for new tokens. */
export async function POST(request: Request) {
  if (!mcpEnabled()) return notFound();
  try {
    return oauthJson(await exchange(await readForm(request)));
  } catch (error) {
    return oauthFailure(error);
  }
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
