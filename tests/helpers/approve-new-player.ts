import type { executeNewPlayerRegistration } from "../../src/lib/new-player-registration";

/** Approve a synthetic intake request using the same checks as Organizer Manager. */
export async function approveNewPlayer(
  reference: string,
  input: { tournament: string; phone: string },
  reviewer: NonNullable<Parameters<typeof executeNewPlayerRegistration>[1]>,
) {
  const { executeNewPlayerRegistration } =
    await import("../../src/lib/new-player-registration");
  const result = await executeNewPlayerRegistration(
    {
      action: "newPlayer.approve",
      tournament: input.tournament,
      reference,
      verifiedPhone: input.phone,
      identityVerified: true,
      contactVerified: true,
      reason: "Verified the synthetic applicant and their contact.",
    },
    reviewer,
  );
  if (!result.playerId)
    throw new Error("The test application was not approved.");
  return result;
}
