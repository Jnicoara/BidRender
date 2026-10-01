/**
 * The undo packet: what a delete hands the screen so it can be put back.
 *
 * ── Why the rows travel to the browser at all ────────────────────────────────
 * Undo restores with the SAME ids (Track B plan, Part 3): a mark's id is
 * pointed at by run ends, tees and AI findings, and a restored mark under a
 * new id would leave those pointing at nothing — a changed vertical count, said
 * nowhere. Keeping deleted rows on the server instead needs a table (a
 * migration) or a `deletedAt` on every read, and one missed filter there counts
 * a deleted mark. So the rows go to the page, which holds the undo stack.
 *
 * ── Why it is SIGNED ─────────────────────────────────────────────────────────
 * A restore INSERTS rows, with ids and owners, from what the client sends. Left
 * unsigned, that is a way to write any row into any company's bid. The server
 * signs exactly what it snapshotted, bound to the company it read it for and
 * the kind of restore it is for, and `openPacket` refuses anything else. There
 * is nothing in a packet a client may edit, so there is nothing to validate
 * field by field.
 *
 * superjson rather than JSON so Dates and nulls come back exactly as they went.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import superjson from "superjson";
import { z } from "zod";

/** Marks: server/takeoffRestore.ts `StampSnapshot`. */
export const STAMPS_PACKET = "stamps";
/** One run's network: `NetworkSnapshot`. */
export const RUN_PACKET = "runNetwork";
/** Everything on one sheet: `SheetSnapshot`. */
export const SHEET_PACKET = "sheet";
/** A whole count and its marks on every sheet: `GroupSnapshot`. */
export const GROUP_PACKET = "group";

/** A packet as a procedure accepts it. Capped: a sheet clear is the biggest. */
export const packetSchema = z.object({
  kind: z.string().max(40),
  data: z.string().max(20_000_000),
  sig: z.string().max(200),
});

export type RestorePacket = {
  /** What this packet restores; checked against the procedure it is sent to. */
  kind: string;
  /** superjson of the snapshot. Opaque to the client. */
  data: string;
  sig: string;
};

function secret(): string {
  return process.env.JWT_SECRET ?? "";
}

function sign(kind: string, ownerUserId: number, data: string): string {
  return createHmac("sha256", secret())
    .update(`restore\n${kind}\n${ownerUserId}\n${data}`)
    .digest("base64url");
}

/**
 * Seal a snapshot for the company `ownerUserId`. Null when the server has no
 * secret to sign with: undo is then unavailable rather than forgeable.
 */
export function sealPacket<T>(
  kind: string,
  ownerUserId: number,
  snapshot: T
): RestorePacket | null {
  if (!secret()) return null;
  const data = superjson.stringify(snapshot);
  return { kind, data, sig: sign(kind, ownerUserId, data) };
}

/** The snapshot, or null when the packet was not sealed here for this. */
export function openPacket<T>(
  kind: string,
  ownerUserId: number,
  packet: RestorePacket
): T | null {
  if (!secret() || packet.kind !== kind) return null;
  const a = Buffer.from(packet.sig, "base64url");
  const b = Buffer.from(sign(kind, ownerUserId, packet.data), "base64url");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return superjson.parse<T>(packet.data);
}
