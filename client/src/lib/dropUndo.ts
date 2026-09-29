/**
 * "UNDO DROPS" on a counted item — put its drop back exactly as it was before
 * the last change.
 *
 * ── What a drop is, so what undoing one means ────────────────────────────────
 * A drop is not a row per mark. It is three fields on the counted GROUP (what
 * each mark drops to, the height, what the drop is made of), and every mark in
 * the group carries one drop from them (shared/groupDrops.ts). So the drops a
 * click added are exactly the difference between the group's three fields
 * before and after it, and undoing that click means writing the three fields
 * back. Nothing else moves: no mark, no other group, no run.
 *
 * ── The trap this module exists for ──────────────────────────────────────────
 * `takeoffGroups.setDrop` reads an OMITTED field as "leave it" and `null` as
 * "clear it". A restore built with `{ dropKind: before.dropKind || undefined }`,
 * or by spreading only the fields that were set, would leave the new run type
 * in place when the old one was null — so the drops would stay counted after
 * "Undo drops" said they were gone. `restoreDropPatch` names all three, every
 * time, and `dropUndo.test.ts` holds it.
 *
 * ── Not remembered past the page ─────────────────────────────────────────────
 * The "before" lives in the screen, so it is lost on a reload. Keeping it would
 * need somewhere to store it, and a remembered undo would one day reverse a
 * change made on another device. The setting itself is always editable.
 */

export type DropFields = {
  dropKind: string | null;
  dropHeightInches: number | null;
  dropRunTypeId: number | null;
};

/** The three fields that make a group's drop, read off what the row shows. */
export function dropFieldsOf(info: DropFields): DropFields {
  return {
    dropKind: info.dropKind,
    dropHeightInches: info.dropHeightInches,
    dropRunTypeId: info.dropRunTypeId,
  };
}

/**
 * The patch that writes `before` back. All three keys, always — a null must
 * be SENT as null, never left out, or setDrop keeps the newer value.
 */
export function restoreDropPatch(before: DropFields): DropFields {
  return {
    dropKind: before.dropKind,
    dropHeightInches: before.dropHeightInches,
    dropRunTypeId: before.dropRunTypeId,
  };
}

/** Whether a change actually changes anything, so a no-op offers no undo. */
export function dropFieldsDiffer(a: DropFields, b: DropFields): boolean {
  return (
    a.dropKind !== b.dropKind ||
    a.dropHeightInches !== b.dropHeightInches ||
    a.dropRunTypeId !== b.dropRunTypeId
  );
}

/** `before` with a patch applied — what the group holds after the change. */
export function applyDropPatch(
  before: DropFields,
  patch: Partial<DropFields>
): DropFields {
  return {
    dropKind: patch.dropKind !== undefined ? patch.dropKind : before.dropKind,
    dropHeightInches:
      patch.dropHeightInches !== undefined
        ? patch.dropHeightInches
        : before.dropHeightInches,
    dropRunTypeId:
      patch.dropRunTypeId !== undefined
        ? patch.dropRunTypeId
        : before.dropRunTypeId,
  };
}
