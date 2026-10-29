import postgres from "postgres";
let connection: ReturnType<typeof postgres> | undefined;
export function db() {
  if (!process.env.DATABASE_URL)
    throw new Error("Private storage is unavailable.");
  return (connection ??= postgres(process.env.DATABASE_URL, {
    max: 3,
    prepare: false,
    // Local integration tests only: DATABASE_SSL=disable. Production always requires TLS.
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
    idle_timeout: 20,
  }));
}
