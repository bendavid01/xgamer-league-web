// No file-system code here: Data health (server pages) imports this too.
/**
 * Migrations applied to production outside this code version that we know about.
 * 006 was written by the feature/mcp-server preview build on 7 Nov 2026. Its file
 * lives on that branch and must stay byte-identical; it is never re-run or edited.
 */
export const RECOGNIZED_OUTSIDE: Record<string, string> = {
  "006_mcp_oauth":
    "MCP branch (feature/mcp-server), applied by its preview build on 7 Nov 2026",
};
