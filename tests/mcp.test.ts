/**
 * Claude (MCP) access to OM: OAuth rules, and the read-only tools against a real PostgreSQL.
 * The database part runs only with TEST_DATABASE_URL (a LOCAL server); it uses its own
 * database (xgamer_mcp_test) so it never collides with om.integration.test.ts.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";
// Every module below reads process.env lazily (at call time), so the settings above apply.
import * as oauth from "../src/lib/oauth";
import * as om from "../src/lib/mcp/om";

const ADMIN = "759756138437804042",
  ADMIN2 = "759756138437804043",
  COORD = "111111111111111111",
  RESULTS_ONLY = "222222222222222222";
process.env.APP_ORIGIN = "https://xgamer.test";
process.env.AUTH_SECRET = "test-only-auth-secret";
process.env.MAIN_ADMIN_DISCORD_IDS = `${ADMIN},${ADMIN2}`;
process.env.PRIVATE_DATA_KEY = "ab".repeat(32);
process.env.MCP_ENABLED = "true";
process.env.REGISTRATION_ENABLED = "true";

const base = process.env.TEST_DATABASE_URL;
if (base && !/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(base))
  throw new Error(
    "TEST_DATABASE_URL must point at a local disposable database.",
  );
const skip = !base && "TEST_DATABASE_URL not set";
const testUrl = base ? base.replace(/\/[^/]*$/, "/xgamer_mcp_test") : "";
process.env.DATABASE_URL = testUrl || "postgres://unused@127.0.0.1:1/none";

/* ─────────────────────────── Pure rules ─────────────────────────── */

test("redirects: only Claude callbacks, loopback apps and explicit extras", () => {
  const ok = oauth.redirectAllowed;
  assert.ok(ok("https://claude.ai/api/mcp/auth_callback", ""));
  assert.ok(ok("https://claude.com/api/mcp/auth_callback", ""));
  assert.ok(ok("http://localhost:6274/oauth/callback", ""));
  assert.ok(ok("http://127.0.0.1:33418/callback", ""));
  assert.ok(!ok("https://evil.example/callback", ""));
  assert.ok(!ok("https://claude.ai.evil.example/api/mcp/auth_callback", ""));
  assert.ok(!ok("https://claude.ai/api/mcp/auth_callback#x", ""));
  assert.ok(!ok("http://claude.ai/api/mcp/auth_callback", ""));
  assert.ok(!ok("https://localhost/callback", ""));
  assert.ok(!ok("http://user:pw@localhost:1/cb", ""));
  assert.ok(!ok("javascript:alert(1)", ""));
  assert.ok(ok("https://cursor.example/cb", "https://cursor.example/cb"));
});

test("PKCE: S256 only, exact match, verifier format enforced", () => {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  assert.ok(oauth.pkceMatches(verifier, challenge));
  assert.ok(!oauth.pkceMatches(verifier + "x", challenge));
  assert.ok(!oauth.pkceMatches("short", challenge));
  assert.ok(!oauth.pkceMatches(verifier, verifier));
});

test("app names are plain text; scopes are limited to om.read", () => {
  assert.equal(oauth.cleanName("<b>Claude</b>‮"), "bClaudeb");
  assert.equal(oauth.cleanName(""), "Unnamed app");
  assert.deepEqual(oauth.parseScope(undefined), ["om.read"]);
  assert.throws(() => oauth.parseScope("om.read om.write"));
});

test("MCP stays off unless explicitly enabled and configured", () => {
  const env = {
    MCP_ENABLED: "true",
    DATABASE_URL: "postgres://x",
    AUTH_SECRET: "s",
    PRIVATE_DATA_KEY: "ab".repeat(32),
    APP_ORIGIN: "https://xgamerproleague.vercel.app",
  };
  assert.ok(oauth.mcpEnabled(env));
  assert.ok(!oauth.mcpEnabled({ ...env, MCP_ENABLED: "false" }));
  assert.ok(!oauth.mcpEnabled({ ...env, APP_ORIGIN: "https://x.app/path" }));
  assert.ok(!oauth.mcpEnabled({ ...env, PRIVATE_DATA_KEY: "short" }));
});

test("metadata points at the pinned origin", () => {
  const as = oauth.authorizationServerMetadata();
  assert.equal(as.issuer, "https://xgamer.test");
  assert.deepEqual(as.code_challenge_methods_supported, ["S256"]);
  assert.equal(
    oauth.protectedResourceMetadata().resource,
    "https://xgamer.test/api/mcp",
  );
});

test("reminder templates fill only known placeholders; links are wa.me", () => {
  assert.equal(
    om.fillTemplate("Hi {name} ({team}) {unknown} {constructor}", {
      name: "Ann",
      team: "FC",
    }),
    "Hi Ann (FC) {unknown} {constructor}",
  );
  assert.equal(
    om.waLink("+919800000001", "Hi & bye?"),
    "https://wa.me/919800000001?text=Hi%20%26%20bye%3F",
  );
});

/* ─────────────────────────── Against PostgreSQL ─────────────────────────── */

let sql: ReturnType<typeof import("../src/lib/db").db>;
let T = "";
before(async () => {
  if (!base) return;
  const admin = postgres(base, { ssl: false, onnotice: () => {} });
  const [exists] =
    await admin`select 1 from pg_database where datname='xgamer_mcp_test'`;
  if (!exists) await admin.unsafe("create database xgamer_mcp_test");
  await admin.end();
  sql = (await import("../src/lib/db")).db();
  await sql.unsafe("drop schema public cascade; create schema public;");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort())
    await sql.unsafe(await readFile(new URL(f, dir), "utf8"));
  await sql`insert into coordinator(discord_id,operations,tournaments) values(${COORD},${["registrations"]},${["*"]}),(${RESULTS_ONLY},${["results"]},${["*"]})`;
  const { run } = await import("../src/lib/control");
  const { register } = await import("../src/lib/registration");
  const boss = { id: ADMIN, role: "admin" as const, name: "David" };
  const created = (await run(boss, {
    action: "create",
    name: "Test Cup",
    format: "league",
    season: null,
    published: true,
  })) as { id: string };
  T = created.id;
  await run(boss, { action: "registration", tournament: T, open: true });
  for (let i = 1; i <= 4; i++)
    await register(
      {
        playerName: i === 4 ? "Player 1" : `Player ${i}`,
        teamName: `Team ${i}`,
        phone: `+9198000000${String(i).padStart(2, "0")}`, // already normalized, as the API does
        consent: true,
        website: "",
        tournament: T,
      },
      `10.9.${i}.1`,
    );
  const apps =
    await sql`select id,revision from application where tournament_id=${T} order by created_at limit 3`;
  await run(boss, {
    action: "review",
    tournament: T,
    items: apps.map((a) => ({ id: a.id, revision: a.revision })),
    status: "approved",
    verified: true,
  });
  await run(boss, { action: "registration", tournament: T, open: false });
  await run(boss, { action: "generate", tournament: T, shuffle: false });
});
after(async () => {
  if (base) await sql.end();
});

const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const CB = "https://claude.ai/api/mcp/auth_callback";

async function connect(discordId: string, name = "Tester") {
  const client = await oauth.registerClient(
    {
      client_name: "Claude",
      redirect_uris: [CB],
      token_endpoint_auth_method: "none",
    },
    "local-" + discordId,
  );
  const checked = await oauth.checkAuthorize({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: CB,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "st8",
    resource: "https://xgamer.test/api/mcp",
  });
  assert.ok(checked.ok);
  const back = new URL(
    await oauth.approve(checked.request, { id: discordId, name }),
  );
  assert.equal(back.origin + back.pathname, CB);
  assert.equal(back.searchParams.get("state"), "st8");
  assert.equal(back.searchParams.get("iss"), "https://xgamer.test");
  const code = back.searchParams.get("code") as string;
  const form = (p: Record<string, string>) => new URLSearchParams(p);
  const tokens = await oauth.exchange(
    form({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: client.client_id,
      redirect_uri: CB,
    }),
  );
  return { client, code, tokens, form };
}

test(
  "OAuth: registration rejects foreign redirect URIs and confidential clients",
  { skip },
  async () => {
    await assert.rejects(
      oauth.registerClient(
        { redirect_uris: ["https://evil.example/cb"] },
        "local",
      ),
      /Redirect URI not allowed/,
    );
    await assert.rejects(
      oauth.registerClient(
        {
          redirect_uris: [CB],
          token_endpoint_auth_method: "client_secret_basic",
        },
        "local",
      ),
      /public clients/,
    );
  },
);

test("OAuth: authorize request validation", { skip }, async () => {
  const client = await oauth.registerClient({ redirect_uris: [CB] }, "local-v");
  const good = {
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: CB,
    code_challenge: challenge,
    code_challenge_method: "S256",
  };
  assert.ok((await oauth.checkAuthorize(good)).ok);
  const unknown = await oauth.checkAuthorize({ ...good, client_id: "nope" });
  assert.ok(!unknown.ok && unknown.fatal);
  const badRedirect = await oauth.checkAuthorize({
    ...good,
    redirect_uri: "http://localhost:9/other",
  });
  assert.ok(
    !badRedirect.ok && badRedirect.fatal,
    "unregistered redirect is never followed",
  );
  const plain = await oauth.checkAuthorize({
    ...good,
    code_challenge_method: "plain",
  });
  assert.ok(
    !plain.ok &&
      !plain.fatal &&
      plain.redirect.includes("error=invalid_request"),
  );
  const otherResource = await oauth.checkAuthorize({
    ...good,
    resource: "https://evil.example/mcp",
  });
  assert.ok(
    !otherResource.ok &&
      !otherResource.fatal &&
      otherResource.redirect.includes("invalid_target"),
  );
});

test(
  "OAuth: code → tokens, single use, PKCE, rotation, reuse detection, revoke",
  { skip },
  async () => {
    const { client, code, tokens, form } = await connect(ADMIN, "David");
    assert.match(tokens.access_token, /^xgm_at_/);
    const info = await oauth.verifyAccessToken(tokens.access_token);
    assert.equal(info?.discordId, ADMIN);
    // Stored as hashes only.
    const [raw] =
      await sql`select count(*)::int as n from oauth_token where hash=${tokens.access_token}`;
    assert.equal(raw.n, 0);
    // The same code can't be redeemed twice.
    await assert.rejects(
      oauth.exchange(
        form({
          grant_type: "authorization_code",
          code,
          code_verifier: verifier,
          client_id: client.client_id,
        }),
      ),
      /Invalid or expired code/,
    );
    // Refresh rotates; the old access token stays valid until expiry, the old refresh token doesn't.
    const next = await oauth.exchange(
      form({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: client.client_id,
      }),
    );
    assert.notEqual(next.refresh_token, tokens.refresh_token);
    // Replaying the old refresh token ends the whole connection.
    await assert.rejects(
      oauth.exchange(
        form({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id: client.client_id,
        }),
      ),
      /already used/,
    );
    assert.equal(await oauth.verifyAccessToken(next.access_token), null);
    // Revoking is per connection.
    const fresh = await connect(ADMIN, "David");
    await oauth.revoke(form({ token: fresh.tokens.refresh_token }));
    assert.equal(
      await oauth.verifyAccessToken(fresh.tokens.access_token),
      null,
    );
    const [audit] =
      await sql`select count(*)::int as n from audit_event where action='mcp.connect'`;
    assert.ok(audit.n >= 2, "connections appear in OM's activity log");
  },
);

test(
  "OAuth: wrong verifier or client fails; people without OM access can't connect",
  { skip },
  async () => {
    const client = await oauth.registerClient(
      { redirect_uris: [CB] },
      "local-w",
    );
    const checked = await oauth.checkAuthorize({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: CB,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    assert.ok(checked.ok);
    const code = new URL(
      await oauth.approve(checked.request, { id: ADMIN }),
    ).searchParams.get("code") as string;
    await assert.rejects(
      oauth.exchange(
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: randomBytes(32).toString("base64url"),
          client_id: client.client_id,
        }),
      ),
      /Invalid or expired code/,
    );
    await assert.rejects(
      oauth.approve(checked.request, { id: "333333333333333333" }),
      /Access denied/,
    );
  },
);

test(
  "Tools: same visibility rules as OM, contact access logged",
  { skip },
  async () => {
    const { actorFor } = await import("../src/lib/api");
    const boss = await actorFor(ADMIN, "David");
    const coord = await actorFor(COORD, "Coord");
    const results = await actorFor(RESULTS_ONLY, "Ref");

    const list = await om.listTournaments(boss);
    assert.match(
      String(list.find((t) => t.id === "xgamer-2026-10")?.starts_on),
      /^2026-10-24$/,
    );
    assert.equal(list.find((t) => t.id === T)?.approved, 3);

    const players = await om.listPlayers(results, T, {});
    assert.equal(players.count, 4);
    assert.ok(
      !("whatsapp" in players.players[0]),
      "no contact details by default",
    );
    await assert.rejects(
      om.listPlayers(results, T, { includeContact: true }),
      /registrations/,
    );
    await assert.rejects(
      om.draftReminders(results, T, { audience: "approved" }),
      /registrations/,
    );

    const before = (
      await sql`select count(*)::int as n from audit_event where action='mcp.contacts'`
    )[0].n;
    const withContact = await om.listPlayers(coord, T, {
      includeContact: true,
      status: "approved",
    });
    assert.equal(withContact.count, 3);
    assert.match(String(withContact.players[0].whatsapp), /^\+9198000000\d\d$/);
    const after = (
      await sql`select count(*)::int as n from audit_event where action='mcp.contacts'`
    )[0].n;
    assert.equal(after, before + 1);

    const issues = await om.findIssues(boss, T);
    assert.equal(
      issues.same_player_name.length,
      1,
      "two people called Player 1",
    );
    assert.equal(issues.approved_without_efootball_id.length, 3);
    assert.equal(issues.pending_review, 1);

    const fixtures = await om.listFixtures(boss, T, { unplayedOnly: true });
    assert.equal(fixtures.count, 3);
    const table = await om.leagueTable(boss, T);
    assert.equal(table.table.length, 3);

    const round = await om.draftReminders(coord, T, {
      audience: "round",
      round: 1,
    });
    assert.ok(round.count >= 1);
    assert.match(
      round.reminders[0].link,
      /^https:\/\/wa\.me\/919800000\d{3}\?text=/,
    );
    assert.match(
      round.reminders[0].message,
      /Round 1 match is against|bye in Round 1/,
    );
    const custom = await om.draftReminders(coord, T, {
      audience: "pending",
      message: "Hi {name}, we are reviewing {code}.",
    });
    assert.equal(custom.count, 1);
    assert.match(
      custom.reminders[0].message,
      /^Hi Player 1, we are reviewing XG-\d{4}\.$/,
    );

    await assert.rejects(
      om.tournamentOverview(boss, "missing-tournament"),
      /not found/,
    );
    const overview = await om.tournamentOverview(boss, T);
    assert.equal(overview.players.approved, 3);
  },
);
