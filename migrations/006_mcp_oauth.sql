-- Claude / MCP connections to OM (OAuth 2.1). Organizers sign in with Discord as usual;
-- these tables hold only hashes of the codes and tokens handed to Claude, never the tokens.

-- Apps registered through Dynamic Client Registration (e.g. Claude, Claude Code, MCP Inspector).
create table if not exists oauth_client (
  id text primary key,
  name text not null,
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 5),
  created_at timestamptz not null default now()
);

-- One-time authorization codes (10 minutes, deleted when used).
create table if not exists oauth_code (
  hash text primary key,
  client_id text not null,
  client_name text not null,
  discord_id text not null check (discord_id ~ '^[0-9]{17,20}$'),
  actor_name text,
  redirect_uri text not null,
  challenge text not null,
  scope text not null,
  expires_at timestamptz not null
);

-- Access tokens (1 hour) and rotating refresh tokens (30 days). A "family" is one connection:
-- revoking it, or reusing an old refresh token, cuts the whole connection off.
create table if not exists oauth_token (
  hash text primary key,
  kind text not null check (kind in ('access', 'refresh')),
  family uuid not null,
  client_id text not null,
  client_name text not null,
  discord_id text not null check (discord_id ~ '^[0-9]{17,20}$'),
  actor_name text,
  scope text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists oauth_token_family on oauth_token(family);
create index if not exists oauth_token_discord on oauth_token(discord_id) where revoked_at is null;

-- Same rule as the rest of the private schema: server-only.
revoke all on oauth_client, oauth_code, oauth_token from public;
