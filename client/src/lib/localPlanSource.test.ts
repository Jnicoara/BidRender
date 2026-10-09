/**
 * Gap 6.1: a plan uploading from this machine is shown from its file, and
 * keeps the same source key when it attaches — a changed key reloads the
 * document and blanks the sheet somebody is already looking at.
 */
import { describe, expect, it } from "vitest";
import {
  PREVIEW_DOC_ID,
  localPlanKey,
  paneSource,
  previewsUpload,
  readFileRange,
  type LocalPlan,
} from "./localPlanSource";

const file = new Blob([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55])]);
const stored = (
  id: number,
  url = `https://bucket.example/${id}.pdf?sig=a`
) => ({
  id,
  filename: "E-set.pdf",
  byteSize: file.size,
  pageCount: 15,
  url,
});

describe("which source the viewer opens", () => {
  it("reads a stored set from its link, keyed by its id, when this visit has no file", () => {
    const s = paneSource(stored(7), new Map(), null)!;
    expect(s.localFile).toBeNull();
    expect(s.sourceKey).toBe("7");
    expect(s.preview).toBe(false);
  });

  it("shows an uploading first set from the file, as a preview nothing can be marked on", () => {
    const key = localPlanKey("job-1");
    const s = paneSource(null, new Map(), {
      file,
      key,
      filename: "E-set.pdf",
    })!;
    expect(s.localFile).toBe(file);
    expect(s.sourceKey).toBe(key);
    expect(s.preview).toBe(true);
    expect(s.doc.id).toBe(PREVIEW_DOC_ID);
    expect(s.doc.byteSize).toBe(file.size);
  });

  it("keeps the SAME key and the file when the set attaches, so nothing reloads", () => {
    const key = localPlanKey("job-1");
    const before = paneSource(null, new Map(), {
      file,
      key,
      filename: "E-set.pdf",
    })!;
    const locals = new Map<number, LocalPlan>([[42, { file, key }]]);
    // The row has arrived; the preview may still be set for a render.
    const after = paneSource(stored(42), locals, {
      file,
      key,
      filename: "E-set.pdf",
    })!;
    expect(after.sourceKey).toBe(before.sourceKey);
    expect(after.localFile).toBe(file);
    expect(after.preview).toBe(false);
    expect(after.doc.id).toBe(42);
  });

  it("does not let a refetched stored link replace the file", () => {
    const locals = new Map<number, LocalPlan>([
      [42, { file, key: localPlanKey("job-1") }],
    ]);
    const a = paneSource(stored(42, "https://b/42.pdf?sig=a"), locals, null)!;
    const b = paneSource(stored(42, "https://b/42.pdf?sig=b"), locals, null)!;
    expect(b.sourceKey).toBe(a.sourceKey);
    expect(b.localFile).toBe(file);
  });

  it("mints a different key for every upload", () => {
    expect(localPlanKey("a")).not.toBe(localPlanKey("b"));
    // And never one a stored set's id key could equal.
    expect(localPlanKey(7)).not.toBe("7");
  });

  it("previews only when no plan set is open, so a working view is not pulled away", () => {
    expect(previewsUpload(null)).toBe(true);
    expect(previewsUpload(42)).toBe(false);
  });
});

describe("reading the file a range at a time", () => {
  it("returns exactly [begin, end)", async () => {
    expect(Array.from(await readFileRange(file, 0, 5))).toEqual([
      37, 80, 68, 70, 45,
    ]);
    expect(Array.from(await readFileRange(file, 5, 8))).toEqual([49, 46, 55]);
  });
});
