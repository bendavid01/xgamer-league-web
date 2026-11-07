/**
 * OAuth 2.1 authorization server for Claude (MCP) connections to OM.
 *
 * Organizers still sign in with Discord (Auth.js). After they approve on /oauth/authorize,
 * OM issues its own short-lived tokens that only work on /api/mcp.
 *
 * Security choices:
 * - Public clients only, with mandatory PKCE (S256). No client secrets to leak.
 * - Redirect URIs are allowlisted: Claude's callback and loopback (localhost) apps only,
 *   so a code can never be sent to someone else's website.
 * - Only SHA-256 hashes of codes and tokens are stored.
 * - Codes are single-use (deleted atomically). Refresh tokens rotate; reusing an old one
 *   revokes the whole connection.
 * - Every MCP request re-checks the organizer's current OM role (see actorFor).
 */
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { db } from "./db";
import { actorFor } from "./api";
import { allowed } from "./access";

export const SCOPES = ["om.read"] as const;
export const CODE_TTL = 10 * 60;
export const ACCESS_TTL = 60 * 60;
export const REFRESH_TTL = 30 * 24 * 60 * 60;

/** Claude's hosted OAuth callbacks (claude.ai web, desktop and mobile apps). */
export const CLAUDE_REDIRECTS = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
];

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/* ─────────────────────────── Configuration ─────────────────────────── */

/** MCP stays switched off until MCP_ENABLED=true and the usual OM secrets exist. */
export function mcpEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return (
    env.MCP_ENABLED === "true" &&
    !!env.DATABASE_URL &&
    !!env.AUTH_SECRET &&
    /^[a-f0-9]{64}$/i.test(env.PRIVATE_DATA_KEY ?? "") &&
    /^https?:\/\/[^/]+$/.test(env.APP_ORIGIN ?? "")
  );
}

/** The issuer is pinned to APP_ORIGIN, never taken from request headers. */
export const issuer = () => process.env.APP_ORIGIN as string;
export const resourceUrl = () => `${issuer()}/api/mcp`;

export function authorizationServerMetadata() {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...SCOPES],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${base}/rules`,
  };
}

export function protectedResourceMetadata() {
  return {
    resource: resourceUrl(),
    authorization_servers: [issuer()],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "XGamer OM",
  };
}

/* ─────────────────────────── Helpers ─────────────────────────── */

const b64url = (b: Buffer) => b.toString("base64url");
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const token = (prefix: string) => `${prefix}_${b64url(randomBytes(32))}`;

/**
 * Allowed redirect URIs: Claude's hosted callbacks, any loopback address (RFC 8252, used by
 * Claude Code, Claude Desktop and MCP Inspector), plus exact extras from MCP_EXTRA_REDIRECT_URIS.
 */
export function redirectAllowed(
  uri: string,
  extra = process.env.MCP_EXTRA_REDIRECT_URIS ?? "",
) {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    return true;
  const list = [
    ...CLAUDE_REDIRECTS,
    ...extra
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  ];
  return list.includes(uri);
}

/** Plain-text app name: letters, numbers and simple punctuation only, so it can't impersonate UI. */
export function cleanName(value: unknown) {
  const text =
    typeof value === "string"
      ? value
          .replace(/[^\p{L}\p{N} ._()&+-]/gu, "")
          .trim()
          .slice(0, 60)
      : "";
  return text || "Unnamed app";
}

export function pkceMatches(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const expected = Buffer.from(
    b64url(createHash("sha256").update(verifier).digest()),
  );
  const given = Buffer.from(challenge);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function parseScope(value: string | null | undefined) {
  const scopes = (value ?? "").split(" ").filter(Boolean);
  if (!scopes.length) return [...SCOPES];
  if (scopes.some((s) => !(SCOPES as readonly string[]).includes(s)))
    throw new OAuthError("invalid_scope", "Unknown scope requested.");
  return [...new Set(scopes)];
}

/** RFC 8707: tokens are only for this MCP server. */
function checkResource(resource: string | null | undefined) {
  if (!resource) return;
  const normalized = resource.replace(/\/$/, "");
  if (normalized !== resourceUrl())
    throw new OAuthError(
      "invalid_target",
      "Tokens are only issued for XGamer OM.",
    );
}

/* ─────────────────────────── Clients ─────────────────────────── */

export type Client = { id: string; name: string; redirectUris: string[] };

const registration = z.object({
  redirect_uris: z.array(z.string().max(500)).min(1).max(5),
  client_name: z.string().max(200).optional(),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
});

/** RFC 7591 Dynamic Client Registration (public clients only). */
export async function registerClient(raw: unknown, ip: string) {
  const parsed = registration.safeParse(raw);
  if (!parsed.success)
    throw new OAuthError("invalid_client_metadata", "Invalid registration.");
  const c = parsed.data;
  if (c.token_endpoint_auth_method && c.token_endpoint_auth_method !== "none")
    throw new OAuthError(
      "invalid_client_metadata",
      "Only public clients (token_endpoint_auth_method=none) are supported.",
    );
  if (
    c.grant_types?.some(
      (g) => !["authorization_code", "refresh_token"].includes(g),
    ) ||
    c.response_types?.some((r) => r !== "code")
  )
    throw new OAuthError("invalid_client_metadata", "Unsupported grant type.");
  if (!c.redirect_uris.every((u) => redirectAllowed(u)))
    throw new OAuthError(
      "invalid_redirect_uri",
      "Redirect URI not allowed. Only Claude and localhost apps can connect.",
    );
  const sql = db();
  const [rate] =
    await sql`insert into rate_limit(key,hits,expires_at) values(${hash("dcr:" + ip)},1,now()+interval '1 hour')
    on conflict(key) do update set hits=case when rate_limit.expires_at<now() then 1 else rate_limit.hits+1 end,
    expires_at=case when rate_limit.expires_at<now() then now()+interval '1 hour' else rate_limit.expires_at end returning hits`;
  if (rate.hits > 20)
    throw new OAuthError(
      "slow_down",
      "Too many registrations. Try later.",
      429,
    );
  const client: Client = {
    id: token("xgc"),
    name: cleanName(c.client_name),
    redirectUris: [...new Set(c.redirect_uris)],
  };
  await sql`insert into oauth_client(id,name,redirect_uris) values(${client.id},${client.name},${client.redirectUris})`;
  return {
    client_id: client.id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: client.name,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

/** Client ID Metadata Document: the client_id is an HTTPS URL describing the app. */
async function metadataClient(clientId: string): Promise<Client | null> {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return null;
  }
  // Public HTTPS hosts only (no IP addresses or localhost), to avoid server-side request forgery.
  if (
    url.protocol !== "https:" ||
    url.pathname === "/" ||
    url.hash ||
    url.username ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    !url.hostname.includes(".")
  )
    return null;
  try {
    const res = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = await res.text();
    if (body.length > 65536) return null;
    const doc = z
      .object({
        client_id: z.literal(clientId),
        client_name: z.string().optional(),
        redirect_uris: z.array(z.string()).min(1).max(10),
      })
      .safeParse(JSON.parse(body));
    if (!doc.success) return null;
    return {
      id: clientId,
      name: cleanName(doc.data.client_name),
      redirectUris: doc.data.redirect_uris.filter((u) => redirectAllowed(u)),
    };
  } catch {
    return null;
  }
}

export async function findClient(clientId: string): Promise<Client | null> {
  if (!clientId || clientId.length > 500) return null;
  if (clientId.startsWith("https://")) return metadataClient(clientId);
  const [row] =
    await db()`select id,name,redirect_uris from oauth_client where id=${clientId}`;
  return row
    ? { id: row.id, name: row.name, redirectUris: row.redirect_uris }
    : null;
}

/* ─────────────────────────── Authorization ─────────────────────────── */

export type AuthorizeRequest = {
  client: Client;
  redirectUri: string;
  state: string | null;
  challenge: string;
  scope: string[];
};

/**
 * Validates /oauth/authorize parameters.
 * `fatal` errors are shown on the page (the redirect target itself is not trusted yet);
 * other errors are sent back to the app's redirect URI.
 */
export async function checkAuthorize(
  params: Record<string, string | undefined>,
): Promise<
  | { ok: true; request: AuthorizeRequest }
  | { ok: false; fatal: true; message: string }
  | { ok: false; fatal: false; redirect: string }
> {
  const client = await findClient(params.client_id ?? "");
  if (!client)
    return { ok: false, fatal: true, message: "Unknown app (client_id)." };
  const redirectUri =
    params.redirect_uri ??
    (client.redirectUris.length === 1 ? client.redirectUris[0] : "");
  if (
    !client.redirectUris.includes(redirectUri) ||
    !redirectAllowed(redirectUri)
  )
    return {
      ok: false,
      fatal: true,
      message: "This app's return address is not allowed.",
    };
  const state = params.state ?? null;
  const fail = (error: string, description: string) => ({
    ok: false as const,
    fatal: false as const,
    redirect: withParams(redirectUri, {
      error,
      error_description: description,
      state,
      iss: issuer(),
    }),
  });
  if (params.response_type !== "code")
    return fail(
      "unsupported_response_type",
      "Only response_type=code is supported.",
    );
  if (
    params.code_challenge_method !== "S256" ||
    !/^[A-Za-z0-9\-_]{43}$/.test(params.code_challenge ?? "")
  )
    return fail("invalid_request", "PKCE with S256 is required.");
  let scope: string[];
  try {
    scope = parseScope(params.scope);
    checkResource(params.resource);
  } catch (error) {
    const e = error as OAuthError;
    return fail(e.code, e.message);
  }
  return {
    ok: true,
    request: {
      client,
      redirectUri,
      state,
      challenge: params.code_challenge as string,
      scope,
    },
  };
}

export function withParams(
  base: string,
  params: Record<string, string | null>,
) {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params))
    if (v !== null) url.searchParams.set(k, v);
  return url.toString();
}

/** Called after the organizer presses Allow. Returns the URL to send the browser to. */
export async function approve(
  request: AuthorizeRequest,
  user: { id: string; name?: string },
) {
  // Same rule as opening OM itself: admins, or coordinators with at least one operation.
  const actor = await actorFor(user.id, user.name);
  if (!allowed(actor, "workspace", "*"))
    throw new OAuthError("access_denied", "You don't have OM access.", 403);
  const code = token("xgm_code");
  await db()`insert into oauth_code(hash,client_id,client_name,discord_id,actor_name,redirect_uri,challenge,scope,expires_at)
    values(${hash(code)},${request.client.id},${request.client.name},${user.id},${user.name ?? null},${request.redirectUri},
    ${request.challenge},${request.scope.join(" ")},now()+make_interval(secs=>${CODE_TTL}))`;
  return withParams(request.redirectUri, {
    code,
    state: request.state,
    iss: issuer(),
  });
}

export function deny(request: AuthorizeRequest) {
  return withParams(request.redirectUri, {
    error: "access_denied",
    error_description: "The organizer declined.",
    state: request.state,
    iss: issuer(),
  });
}

/* ─────────────────────────── Tokens ─────────────────────────── */

type Grant = {
  family: string;
  client_id: string;
  client_name: string;
  discord_id: string;
  actor_name: string | null;
  scope: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function issue(tx: any, g: Grant) {
  const access = token("xgm_at"),
    refresh = token("xgm_rt");
  for (const [kind, value, ttl] of [
    ["access", access, ACCESS_TTL],
    ["refresh", refresh, REFRESH_TTL],
  ] as const)
    await tx`insert into oauth_token(hash,kind,family,client_id,client_name,discord_id,actor_name,scope,expires_at)
      values(${hash(value)},${kind},${g.family},${g.client_id},${g.client_name},${g.discord_id},${g.actor_name},${g.scope},
      now()+make_interval(secs=>${ttl}))`;
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL,
    refresh_token: refresh,
    scope: g.scope,
  };
}

const grantOf = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: Record<string, any>,
  family: string,
  scope: string,
): Grant => ({
  family,
  client_id: row.client_id,
  client_name: row.client_name,
  discord_id: row.discord_id,
  actor_name: row.actor_name ?? null,
  scope,
});

const field = (form: URLSearchParams, name: string) => {
  const value = form.get(name);
  return value && value.length <= 2000 ? value : null;
};

/** POST /oauth/token */
export async function exchange(form: URLSearchParams) {
  const grant = form.get("grant_type");
  if (grant === "authorization_code") return redeemCode(form);
  if (grant === "refresh_token") return refreshTokens(form);
  throw new OAuthError("unsupported_grant_type", "Unsupported grant_type.");
}

async function redeemCode(form: URLSearchParams) {
  const code = field(form, "code"),
    verifier = field(form, "code_verifier"),
    clientId = field(form, "client_id"),
    redirectUri = field(form, "redirect_uri");
  if (!code || !verifier || !clientId)
    throw new OAuthError(
      "invalid_request",
      "code, code_verifier and client_id are required.",
    );
  checkResource(form.get("resource"));
  return db().begin(async (tx) => {
    // Deleting first makes the code single-use even under concurrent requests.
    const [row] =
      await tx`delete from oauth_code where hash=${hash(code)} returning *, expires_at < now() as expired`;
    if (
      !row ||
      row.expired ||
      row.client_id !== clientId ||
      (redirectUri !== null && row.redirect_uri !== redirectUri) ||
      !pkceMatches(verifier, row.challenge)
    )
      throw new OAuthError("invalid_grant", "Invalid or expired code.");
    const actor = await actorFor(row.discord_id, row.actor_name ?? undefined);
    const g = grantOf(row, randomUUID(), row.scope);
    const result = await issue(tx, g);
    await tx`insert into audit_event(actor,actor_name,actor_role,action,entity,summary,affected,after_value)
      values(${row.discord_id},${row.actor_name},${actor.role},'mcp.connect',${g.family},
      'Connected Claude (MCP) to OM',${row.client_name},${tx.json({ client: row.client_name, scope: row.scope })})`;
    return result;
  });
}

async function refreshTokens(form: URLSearchParams) {
  const refresh = field(form, "refresh_token"),
    clientId = field(form, "client_id");
  if (!refresh || !clientId)
    throw new OAuthError(
      "invalid_request",
      "refresh_token and client_id are required.",
    );
  checkResource(form.get("resource"));
  return db()
    .begin(async (tx) => {
      const [row] =
        await tx`select *, expires_at < now() as expired from oauth_token where hash=${hash(refresh)} and kind='refresh' for update`;
      if (!row || row.client_id !== clientId)
        throw new OAuthError("invalid_grant", "Invalid refresh token.");
      if (row.revoked_at) {
        // An old refresh token came back: treat the connection as stolen and end it.
        await tx`update oauth_token set revoked_at=now() where family=${row.family} and revoked_at is null`;
        return { reused: true } as const;
      }
      if (row.expired)
        throw new OAuthError("invalid_grant", "Refresh token expired.");
      const scope = form.get("scope") ? parseScope(form.get("scope")) : null;
      if (scope && scope.some((s) => !row.scope.split(" ").includes(s)))
        throw new OAuthError("invalid_scope", "Scope can't grow on refresh.");
      await actorFor(row.discord_id, row.actor_name ?? undefined);
      await tx`update oauth_token set revoked_at=now() where hash=${row.hash}`;
      return issue(tx, grantOf(row, row.family, scope?.join(" ") ?? row.scope));
    })
    .then((r) => {
      if ("reused" in r)
        throw new OAuthError(
          "invalid_grant",
          "Refresh token was already used. Connect again.",
        );
      return r;
    });
}

/** RFC 7009: revoking either token ends the whole connection. Always succeeds. */
export async function revoke(form: URLSearchParams) {
  const value = field(form, "token");
  if (!value) return;
  await db()`update oauth_token set revoked_at=now()
    where family in (select family from oauth_token where hash=${hash(value)}) and revoked_at is null`;
}

export type TokenInfo = {
  discordId: string;
  name?: string;
  clientId: string;
  clientName: string;
  scopes: string[];
  expiresAt: number;
};

/** Validates a bearer token for /api/mcp. */
export async function verifyAccessToken(value: string | undefined) {
  if (!value || !value.startsWith("xgm_at_") || value.length > 200) return null;
  const [row] =
    await db()`select discord_id,actor_name,client_id,client_name,scope,extract(epoch from expires_at)::bigint as exp
      from oauth_token where hash=${hash(value)} and kind='access' and revoked_at is null and expires_at > now()`;
  if (!row) return null;
  return {
    discordId: row.discord_id,
    name: row.actor_name ?? undefined,
    clientId: row.client_id,
    clientName: row.client_name,
    scopes: row.scope.split(" "),
    expiresAt: Number(row.exp),
  } satisfies TokenInfo;
}

/* ─────────────────────────── HTTP helpers ─────────────────────────── */

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, MCP-Protocol-Version",
};

export function oauthJson(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { ...CORS, "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}

export function oauthFailure(error: unknown) {
  if (error instanceof OAuthError)
    return oauthJson(
      { error: error.code, error_description: error.message },
      error.status,
    );
  if (error instanceof Error && "status" in error && error.status === 403)
    return oauthJson(
      { error: "invalid_grant", error_description: "OM access was removed." },
      400,
    );
  return oauthJson(
    { error: "server_error", error_description: "Try again later." },
    503,
  );
}

export const notFound = () => new Response("Not found", { status: 404 });

/** Reads application/x-www-form-urlencoded (standard) or JSON bodies, max 8 KB. */
export async function readForm(request: Request) {
  const text = await request.text();
  if (text.length > 8192)
    throw new OAuthError("invalid_request", "Request too large.", 413);
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      return new URLSearchParams(
        Object.entries(json)
          .filter(([, v]) => typeof v === "string")
          .map(([k, v]) => [k, v as string]),
      );
    } catch {
      throw new OAuthError("invalid_request", "Invalid JSON.");
    }
  }
  return new URLSearchParams(text);
}

/** Same source of truth as registration: Vercel's own forwarded-for header. */
export function clientIp(request: Request) {
  return process.env.VERCEL
    ? (request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
        null)
    : "local";
}
