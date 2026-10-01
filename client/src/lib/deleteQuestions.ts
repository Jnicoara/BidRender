/**
 * The confirms that NAME what a delete loses — plan § 1.1, "delete rules that
 * scale with what is lost". A whole run or a whole count is confirmed, and
 * the question says what goes, in the numbers the estimator reads elsewhere:
 * "Delete run Homerun — 84 ft, 12 ft of drops?". The action button names the
 * act ("Delete run"), never "Yes".
 *
 * Here, not in the page, so a test can read the sentence.
 */

export type DeleteQuestion = {
  title: string;
  lines: string[];
  action: string;
};

function feet(n: number): string {
  return `${Math.round(n * 100) / 100} ft`;
}

/** One row of a run's network: the root and each of its legs. */
export type RunNetworkRow = {
  name: string;
  parentRunId?: number | null;
  circuits: readonly unknown[];
  quantities: { runFeet: number; verticalFeet: number } | null;
};

/** The question before deleting a WHOLE run — every leg of its network. */
export function runDeleteQuestion(
  network: readonly RunNetworkRow[]
): DeleteQuestion {
  const root = network.find(r => r.parentRunId == null) ?? network[0];
  const name = root?.name ?? "this run";
  const measured = network.filter(r => r.quantities !== null);
  const flat = measured.reduce((s, r) => s + (r.quantities?.runFeet ?? 0), 0);
  const drops = measured.reduce(
    (s, r) => s + (r.quantities?.verticalFeet ?? 0),
    0
  );
  const circuits = network.reduce((s, r) => s + r.circuits.length, 0);

  const size =
    measured.length === 0
      ? "no length yet"
      : feet(flat) + (drops > 0 ? `, ${feet(drops)} of drops` : "");
  const lines: string[] = [];
  if (network.length > 1)
    lines.push(
      `All ${network.length} legs go with it, and the tees that join them.`
    );
  if (circuits > 0)
    lines.push(
      `${circuits} circuit${circuits === 1 ? "" : "s"} of wire in it go${circuits === 1 ? "es" : ""} too.`
    );
  lines.push(
    measured.length === 0
      ? "It has no length on the bid yet, so no total moves."
      : "Its footage leaves the bid's totals, and any bid line for its type goes down by the same amount."
  );
  lines.push("Undo puts the whole run back.");
  return {
    title: `Delete run ${name} — ${size}?`,
    lines,
    action: "Delete run",
  };
}

/** The question before deleting a WHOLE count — every mark, every sheet. */
export function countDeleteQuestion(count: {
  label: string;
  marks: number;
}): DeleteQuestion {
  const marks = `${count.marks} mark${count.marks === 1 ? "" : "s"}`;
  return {
    title: `Delete count "${count.label}" — ${marks} on every sheet?`,
    lines: [
      `This removes the count itself and all ${marks}, on this sheet and every other one.`,
      "To remove only this sheet's marks, use the trash on the card instead.",
      "Undo puts the count and every mark back.",
    ],
    action: "Delete count",
  };
}
