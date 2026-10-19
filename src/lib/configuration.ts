/** Server-only readiness check; does not prove migrations or connectivity. */
export function registrationConfigured(
  env: Record<string, string | undefined> = process.env,
) {
  return (
    env.REGISTRATION_ENABLED === "true" &&
    !!env.DATABASE_URL &&
    /^[a-f0-9]{64}$/i.test(env.PRIVATE_DATA_KEY ?? "") &&
    !!env.APP_ORIGIN &&
    /^https?:\/\/[^/]+$/.test(env.APP_ORIGIN)
  );
}
