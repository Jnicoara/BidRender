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

/**
 * What is wrong with the FILE itself, read from pdf.js's error — a problem
 * no "Try again" can fix (hard-PDF drill, 2026-10-16: a password-protected
 * set showed "PasswordException: No password given" with a Try again button
 * that could never work, and a damaged one "InvalidPDFException: Invalid PDF
 * structure.").
 */
export type PlanFileProblem = "password" | "damaged";

export function planFileProblem(message: string): PlanFileProblem | null {
  if (/password/i.test(message)) return "password";
  if (
    /invalid ?pdf|missing ?pdf|invalid pdf structure|invalid xref|bad xref|xref ?entry|unexpected end|formaterror|startxref/i.test(
      message
    )
  )
    return "damaged";
  return null;
}

/** The words for a file problem: what it is, and what to do about it. */
export function planFileProblemText(
  problem: PlanFileProblem,
  filename: string
): { title: string; detail: string } {
  return problem === "password"
    ? {
        title: `${filename} is password-protected`,
        detail:
          "BidRidge can't open a plan that needs a password. Open it in your PDF app, then save or print it to a new PDF without a password, and upload that copy.",
      }
    : {
        title: `${filename} is damaged or incomplete`,
        detail:
          "It may not have finished downloading. Open it on your computer: if it opens there, print it to a new PDF and upload that copy; if it doesn't, ask whoever sent it for the file again.",
      };
}

export function planFailureText(
  phase: PlanFailurePhase,
  filename: string,
  message: string
): { title: string; detail: string; canRetry: boolean } {
  const problem = planFileProblem(message);
  if (problem)
    return { ...planFileProblemText(problem, filename), canRetry: false };
  if (isConnectionFailure(message))
    return {
      title:
        phase === "open"
          ? `Couldn't reach ${filename}`
          : "Couldn't load this sheet",
      detail:
        "The plan storage didn't answer — usually the connection. Your takeoff is saved. Press Try again once you're back online.",
      canRetry: true,
    };
  return phase === "open"
    ? {
        title: `${filename} could not be opened`,
        detail: message.replace(/^UnknownErrorException:\s*/, ""),
        canRetry: true,
      }
    : {
        title: "This sheet could not be drawn",
        detail: `${message.replace(/^UnknownErrorException:\s*/, "")} Your takeoff is saved. Try again, or move to another sheet.`,
        canRetry: true,
      };
}
