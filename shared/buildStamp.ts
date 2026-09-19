/**
 * What build is this, in words a person can check against a deploy.
 *
 * The formatting lives here, shared, so the sidebar and `/api/version` cannot
 * describe the same build differently — the failure this whole mechanism exists
 * to stop is a check that looks like it passed.
 *
 * Reading the values is deliberately NOT here. The client reads its stamp from
 * `import.meta.env`, which does not exist in the server bundle, and the server
 * reads a file, which does not exist in a browser. Only the shape and the words
 * are shared.
 */

export type BuildStamp = {
  /** ISO timestamp from the build machine, or null when running from source. */
  builtAt: string | null;
  /** Short commit SHA, or null where git could not answer at build time. */
  commit: string | null;
};

export const DEV_BUILD_LABEL = "dev — running from source";

/** Fixed, so the label reads the same wherever it is produced. */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * The one-line label, e.g. `4f2a91c · 18 Sep 14:22 UTC`.
 *
 * UTC, spelled out. A deploy is checked against the clock of whoever pushed,
 * and a bare time in an unnamed zone is the kind of detail that turns a check
 * into an argument. The date is included because a deploy that did not take
 * leaves YESTERDAY's build serving, and a time alone hides that completely.
 */
export function buildStampLabel(stamp: BuildStamp): string {
  if (stamp.builtAt === null) return DEV_BUILD_LABEL;

  const at = new Date(stamp.builtAt);
  if (Number.isNaN(at.getTime())) {
    // A stamp we cannot read is reported as unreadable, never silently as dev:
    // "dev" on a production sidebar would be read as "nothing deployed".
    return stamp.commit
      ? `${stamp.commit} · unreadable build time`
      : "unknown build";
  }

  /*
    Formatted by hand rather than with toLocaleDateString, and that is not
    stubbornness.

    The same label is rendered by a browser and asserted by a test running in
    Node, and their ICU data does not agree: Node renders September as "Sept"
    under en-GB where browsers render "Sep". A label that differs by where it
    was produced is the one thing this label must never be, since its entire
    job is to let two things be compared and found identical.
  */
  const pad = (n: number) => String(n).padStart(2, "0");
  const when =
    `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ` +
    `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())} UTC`;

  return stamp.commit ? `${stamp.commit} · ${when}` : when;
}

/**
 * How long ago this build was made, for the deploy check specifically.
 *
 * "4 minutes ago" answers the question being asked — *is the thing I just
 * pushed the thing that is running* — in a way an absolute timestamp makes the
 * reader work out for themselves, at the moment they are least inclined to.
 */
export function buildAgeLabel(stamp: BuildStamp, now: Date): string | null {
  if (stamp.builtAt === null) return null;
  const at = new Date(stamp.builtAt);
  if (Number.isNaN(at.getTime())) return null;

  const minutes = Math.floor((now.getTime() - at.getTime()) / 60000);
  if (minutes < 0) return "in the future — check the clocks";
  if (minutes < 1) return "less than a minute ago";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
