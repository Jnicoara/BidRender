/**
 * What a failed request says on screen (copy review 2026-10-14, C4).
 *
 * About 160 handlers did `toast.error(error.message)`, which shows whatever
 * the failure carried: "Failed to fetch" when a laptop in a truck loses
 * signal, a JSON dump of validation issues, or an SQL error. But most server
 * messages in this app are WRITTEN for the person ("A material named X
 * already exists. Edit that one instead.") and must keep reaching them —
 * so this does not replace messages, it replaces only the three kinds that
 * were never meant to be read:
 *
 * 1. **No answer at all** (offline, server down): there is no `data` from the
 *    server. → "Couldn't reach BidRidge — check your connection and try
 *    again."
 * 2. **A validation dump**: the message is the JSON of the input's issues
 *    (tRPC's default for a schema that refused). → "Something in that wasn't
 *    valid. Check it and try again."
 * 3. **An internal error that reads like code**: SQL, "undefined", a stack,
 *    "DB unavailable". → "That didn't save — something went wrong on our
 *    side. Try again."
 *
 * Everything else passes through as written. The raw text always goes to the
 * console, so nothing is lost for whoever is debugging.
 */

export const OFFLINE_TEXT =
  "Couldn't reach BidRidge — check your connection and try again.";
export const INVALID_TEXT =
  "Something in that wasn't valid. Check it and try again.";
export const INTERNAL_TEXT =
  "That didn't save — something went wrong on our side. Try again.";

/** Words that only ever come from code, never from a sentence we wrote. */
const TECHNICAL =
  /\b(ER_[A-Z_]+|SQL|sqlMessage|undefined|null is not|Cannot read propert|is not a function|DB unavailable|ECONN|ETIMEDOUT|Unexpected token|TypeError|ReferenceError)\b/i;

/** Field names whose words alone would read oddly. */
const FIELD_WORDS: Record<string, string> = {
  qty: "quantity",
  costPerUnit: "price",
  hourlyCost: "hourly rate",
  annualSalary: "salary",
};

function fieldWords(path: unknown): string | null {
  if (!Array.isArray(path)) return null;
  const last = [...path].reverse().find(p => typeof p === "string");
  if (typeof last !== "string" || last === "") return null;
  return (
    FIELD_WORDS[last] ??
    last.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()
  );
}

/**
 * The validation dump, said as a sentence — for the few refusals that are
 * unambiguous and common. Found 2026-10-15: a 10,000-character name drew
 * "Something in that wasn't valid", which names neither the field nor the
 * limit, so the person can only paste the same thing again. Anything this
 * does not recognise stays the general sentence.
 */
function validationSentence(message: string): string | null {
  let issues: unknown;
  try {
    issues = JSON.parse(message);
  } catch {
    return null;
  }
  const issue = (Array.isArray(issues) ? issues[0] : null) as {
    code?: unknown;
    origin?: unknown;
    maximum?: unknown;
    minimum?: unknown;
    path?: unknown;
  } | null;
  if (!issue) return null;
  const words = fieldWords(issue.path);
  const field = words ? `The ${words}` : "That";
  const num = (n: unknown) =>
    typeof n === "number" ? n.toLocaleString("en-US") : null;
  if (issue.origin === "string") {
    if (issue.code === "too_big" && num(issue.maximum))
      return `${field} is too long — ${num(issue.maximum)} characters at most.`;
    if (issue.code === "too_small" && issue.minimum === 1)
      return `${field} can't be blank.`;
    if (issue.code === "too_small" && num(issue.minimum))
      return `${field} needs at least ${num(issue.minimum)} characters.`;
  }
  if (issue.origin === "number") {
    if (issue.code === "too_big" && num(issue.maximum))
      return `${field} is too large — ${num(issue.maximum)} at most.`;
    if (issue.code === "too_small" && num(issue.minimum))
      return `${field} can't be below ${num(issue.minimum)}.`;
  }
  return null;
}

type ErrorLike = {
  message?: unknown;
  data?: { code?: unknown } | null;
};

export function errorText(error: unknown): string {
  const e = (error ?? {}) as ErrorLike;
  const message = typeof e.message === "string" ? e.message.trim() : "";
  if (typeof console !== "undefined" && message) console.warn(message);

  // No reply from the server: the request never got an answer. Only a tRPC
  // client error with no server data — or the browser's own network words —
  // means that: a plain Error a screen threw itself ("Pick a PDF file") has
  // no data either, and its message is for the person.
  const data = e.data;
  const isTrpc =
    (error as { name?: unknown } | null)?.name === "TRPCClientError";
  if (
    /failed to fetch|networkerror|load failed|network request failed/i.test(
      message
    ) ||
    (isTrpc && (data === undefined || data === null))
  )
    return OFFLINE_TEXT;
  if (data === undefined || data === null)
    return message === "" ? INTERNAL_TEXT : message;

  if (message === "") return INTERNAL_TEXT;
  if (message.startsWith("[") || message.startsWith("{"))
    return validationSentence(message) ?? INVALID_TEXT;
  if (data.code === "INTERNAL_SERVER_ERROR" && TECHNICAL.test(message))
    return INTERNAL_TEXT;
  return message;
}
