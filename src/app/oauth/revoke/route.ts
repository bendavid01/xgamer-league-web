import {
  CORS,
  mcpEnabled,
  notFound,
  oauthFailure,
  readForm,
  revoke,
} from "@/lib/oauth";

/** RFC 7009 token revocation. Revoking any token ends that Claude connection. */
export async function POST(request: Request) {
  if (!mcpEnabled()) return notFound();
  try {
    await revoke(await readForm(request));
    return new Response(null, { status: 200, headers: CORS });
  } catch (error) {
    return oauthFailure(error);
  }
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
