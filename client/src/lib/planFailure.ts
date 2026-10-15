/**
 * What the Plans screen says when a plan cannot be opened or a sheet cannot
 * be drawn (Track B failure drill, 2026-10-15).
 *
 * The drill cut the plan storage while a 500-sheet set was open. The screen
 * said "Large set 500 sheets.pdf could not be opened — UnknownErrorException:
 * Failed to fetch": a lost connection worded as a broken FILE, with the
 * engine's exception name in it — and no way back. A person reads that as
 * "my plan is damaged". Here a dropped connection says it is the connection,
 * that nothing is lost, and what to press.
 */
export type PlanFailurePhase = "open" | "sheet";

/** The connection, not the file: worth trying again. */
export function isConnectionFailure(message: string): boolean {
  return /failed to fetch|networkerror|network request failed|load failed|err_internet|disconnected|unexpected server response \((0|5\d\d)\)|timed? ?out/i.test(
    message
  );
}

export function planFailureText(
  phase: PlanFailurePhase,
  filename: string,
  message: string
): { title: string; detail: string } {
  if (isConnectionFailure(message))
    return {
      title:
        phase === "open"
          ? `Couldn't reach ${filename}`
          : "Couldn't load this sheet",
      detail:
        "The plan storage didn't answer — usually the connection. Your takeoff is saved. Press Try again once you're back online.",
    };
  return phase === "open"
    ? {
        title: `${filename} could not be opened`,
        detail: message.replace(/^UnknownErrorException:\s*/, ""),
      }
    : {
        title: "This sheet could not be drawn",
        detail: `${message.replace(/^UnknownErrorException:\s*/, "")} Your takeoff is saved. Try again, or move to another sheet.`,
      };
}
