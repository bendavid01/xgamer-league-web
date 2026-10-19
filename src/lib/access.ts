export type Operation =
  | "workspace"
  | "registrations"
  | "results"
  | "announcements"
  | "tournaments"
  | "delete"
  | "roles"
  | "audit"
  | "finals";
export type Actor = {
  id: string;
  role: "admin" | "coordinator";
  operations: string[];
  tournaments: string[];
};
export function adminIds(value = process.env.MAIN_ADMIN_DISCORD_IDS ?? "") {
  const ids = value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return ids.length === 2 &&
    new Set(ids).size === 2 &&
    ids.every((x) => /^\d{17,20}$/.test(x))
    ? ids
    : [];
}
export function allowed(
  actor: Actor,
  operation: Operation,
  tournament: string,
) {
  return (
    actor.role === "admin" ||
    (actor.tournaments.includes(tournament) &&
      (operation === "workspace"
        ? actor.operations.length > 0
        : !["delete", "roles", "audit", "finals", "tournaments"].includes(
            operation,
          ) && actor.operations.includes(operation)))
  );
}
