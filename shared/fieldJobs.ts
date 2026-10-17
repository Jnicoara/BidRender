/**
 * A job as a FIELD member sees it: what it is, where, and where it stands —
 * no price, no client contact (references/field-and-coowner-plan.md § 1, F2).
 *
 * Named field by field on purpose. This feeds a screen, and a column added to
 * `bids` later must not reach a crew member's phone because something spread
 * the row (CLAUDE.md § "Where to be structural, and where to be explicit").
 */
export type FieldJob = {
  id: number;
  name: string;
  siteAddress: string | null;
  status: string;
  dueDate: string | null;
  /** When the counts stopped following the plans; the screen says so. */
  quantitiesLockedAt: Date | null;
  updatedAt: Date;
};

export function fieldJob(bid: {
  id: number;
  name: string;
  siteAddress: string | null;
  status: string;
  dueDate: string | null;
  quantitiesLockedAt: Date | null;
  updatedAt: Date;
}): FieldJob {
  return {
    id: bid.id,
    name: bid.name,
    siteAddress: bid.siteAddress,
    status: bid.status,
    dueDate: bid.dueDate,
    quantitiesLockedAt: bid.quantitiesLockedAt,
    updatedAt: bid.updatedAt,
  };
}
