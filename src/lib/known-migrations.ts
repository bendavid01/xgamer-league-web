// No file-system code here: Data health (server pages) imports this too.
/**
 * Migrations applied to production outside this code version that we know about.
 * 006 was written by the feature/mcp-server preview build on 7 Nov 2026. Its file
 * lives on that branch and must stay byte-identical; it is never re-run or edited.
 */
export const OUTSIDE_MIGRATIONS: ReadonlyMap<
  string,
  { hash: string; description: string }
> = new Map([
  [
    "006_mcp_oauth",
    {
      // Pinned against the ledger and MCP branch commit 49de1cf during M1.
      hash: "ae5529b1a747ca3ba6fe30da75ed1d3b368bbb57462a9917c3162468cddde2d1",
      description: "MCP branch (feature/mcp-server), applied on 7 Nov 2026",
    },
  ],
]);

export function outsideMigrationStatus(name: string, hash: string) {
  const expected = OUTSIDE_MIGRATIONS.get(name);
  if (!expected) return "unknown";
  return hash === expected.hash ? "recognized" : "changed";
}
