/**
 * Seats: how many people a company may have, and the words for "no room".
 *
 * ── What a seat is ───────────────────────────────────────────────────────────
 * One ACTIVE member, or one PENDING invitation — not accepted, not revoked,
 * not expired. Every role counts, the owner and viewers included.
 *
 * A pending invite holds a seat because it is a promise of one: without that,
 * a company with one seat left could send ten codes and have ten people turn
 * up. An expired or revoked code can never be redeemed, so it holds nothing.
 *
 * A SUSPENDED member holds no seat. Suspending is how this app removes someone
 * (a membership row is never deleted — schema.ts, `company_members.status`), so
 * if suspension kept the seat, removing a person could never free one. The
 * corollary is that RESTORING someone takes a seat, and is checked like an
 * invite.
 *
 * ── Why the limit is a plain number on the company ──────────────────────────
 * There is no billing yet. An admin sets it by hand (Admin → Seats), and the
 * plan a company pays for will set the same column later. So the rule that
 * refuses lowering a limit below what is in use is written once, here, and a
 * plan downgrade will hit exactly the same refusal.
 *
 * Enforcement is on the SERVER, inside a transaction holding the company row
 * (`db.withSeatLock`). These functions only decide; they never count.
 */

/**
 * What a new company gets. Just the owner.
 *
 * Decided 2026-09-26: until billing exists, adding a seat is an admin doing it
 * by hand, so a fresh company starts with none spare. `drizzle/0080` writes the
 * same number as the column's DEFAULT, and `server/seats.test.ts` fails if the
 * two ever disagree.
 */
export const DEFAULT_SEAT_LIMIT = 1;

/** A sanity ceiling on what an admin can type, not a product decision. */
export const MAX_SEAT_LIMIT = 10_000;

export type SeatUsage = {
  seatLimit: number;
  activeMembers: number;
  pendingInvites: number;
};

export function seatsInUse(usage: SeatUsage): number {
  return usage.activeMembers + usage.pendingInvites;
}

function seatWord(n: number): string {
  return n === 1 ? "seat" : "seats";
}

/** "X of Y seats used", the Team page's line. */
export function seatSummary(usage: SeatUsage): string {
  return `${seatsInUse(usage)} of ${usage.seatLimit} ${seatWord(usage.seatLimit)} used`;
}

/**
 * The refusal when every seat is taken. Also shown on the Team page before
 * anyone clicks, so the button and the server say the same thing.
 */
export function seatsFullMessage(seatLimit: number): string {
  const lead =
    seatLimit === 1
      ? "Your 1 seat is in use."
      : `All ${seatLimit} seats are in use.`;
  return `${lead} Remove someone or add a seat.`;
}

/**
 * Can `adding` more seats be taken? Null for yes, the message for no.
 *
 * `adding` is 1 for a new invitation or a restored member, and 0 for
 * accepting an invitation — that one already holds its seat as a pending
 * invite and only changes from pending to member. Passing 0 is still a real
 * check: it refuses when the company is ALREADY over, which is how accepting
 * catches a limit that dropped after the code went out.
 */
export function seatRefusal(usage: SeatUsage, adding: 0 | 1): string | null {
  return seatsInUse(usage) + adding > usage.seatLimit
    ? seatsFullMessage(usage.seatLimit)
    : null;
}

/**
 * Can the limit move to `nextLimit`? Null for yes, the message for no.
 *
 * Refused below what is in use, naming how many to remove — the same rule a
 * plan downgrade will apply once billing exists.
 */
export function lowerLimitRefusal(
  usage: SeatUsage,
  nextLimit: number
): string | null {
  const inUse = seatsInUse(usage);
  if (nextLimit >= inUse) return null;
  const over = inUse - nextLimit;
  const parts = [
    `${usage.activeMembers} ${usage.activeMembers === 1 ? "member" : "members"}`,
  ];
  if (usage.pendingInvites > 0) {
    parts.push(
      `${usage.pendingInvites} pending ${usage.pendingInvites === 1 ? "invite" : "invites"}`
    );
  }
  return (
    `This company is using ${inUse} ${seatWord(inUse)} (${parts.join(", ")}). ` +
    `Remove ${over} first — suspend a member or revoke an invite — ` +
    `before lowering the limit to ${nextLimit}.`
  );
}
