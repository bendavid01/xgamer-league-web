import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { INSTRUCTIONS, registerTools } from "@/lib/mcp/server";
import {
  issuer,
  mcpEnabled,
  notFound,
  resourceUrl,
  SCOPES,
  verifyAccessToken,
} from "@/lib/oauth";

/**
 * XGamer OM for Claude (MCP, Streamable HTTP). Requires an OAuth access token from /oauth/token.
 * Switched off (404) unless MCP_ENABLED=true.
 */
const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "xgamer-om", version: "1.0.0" },
  instructions: INSTRUCTIONS,
});

let authed: ((req: Request) => Promise<Response>) | undefined;
function protectedHandler() {
  return (authed ??= withMcpAuth(
    handler,
    async (_req, bearer) => {
      const info = await verifyAccessToken(bearer);
      if (!info) return undefined;
      return {
        token: bearer as string,
        clientId: info.clientId,
        scopes: info.scopes,
        expiresAt: info.expiresAt,
        resource: new URL(resourceUrl()),
        extra: { discordId: info.discordId, name: info.name },
      };
    },
    {
      required: true,
      requiredScopes: [...SCOPES],
      resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
      resourceUrl: issuer(),
    },
  ));
}

async function serve(request: Request) {
  if (!mcpEnabled()) return notFound();
  return protectedHandler()(request);
}
export { serve as GET, serve as POST, serve as DELETE };
