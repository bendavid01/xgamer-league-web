import postgres from "postgres";
let connection: ReturnType<typeof postgres> | undefined;
export function db() {
  if (!process.env.DATABASE_URL)
    throw new Error("Private storage is unavailable.");
  return (connection ??= postgres(connectionUrl(process.env.DATABASE_URL), {
    max: 3,
    prepare: false,
    // Local integration tests only: DATABASE_SSL=disable. Production always requires TLS.
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
    idle_timeout: 20,
    onnotice: () => {},
  }));
}

/** Neon adds `channel_binding`, which the postgres driver would forward to the server as an unknown setting. */
export function connectionUrl(raw: string) {
  try {
    const url = new URL(raw);
    url.searchParams.delete("channel_binding");
    return url.toString();
  } catch {
    return raw;
  }
}
