import postgres from "postgres";
let connection: ReturnType<typeof postgres> | undefined;
export function db() {
  if (!process.env.DATABASE_URL)
    throw new Error("Private storage is unavailable.");
  return (connection ??= postgres(process.env.DATABASE_URL, {
    max: 3,
    prepare: false,
    ssl: "require",
    idle_timeout: 20,
  }));
}
