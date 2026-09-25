/**
 * What the sheet reader sends to the server, built from what its worker found.
 *
 * Pure, so the decisions can be tested: which source supplies each page's
 * number and title, and what a batch says about a page it found nothing on.
 * The order is shared/sheetIdentity.ts's: page label, then bookmark, then the
 * title block — per field.
 *
 * ── Two kinds of batch ───────────────────────────────────────────────────────
 * PAGE batches carry text, the number, and a title from a label or bookmark,
 * as pages are read. A TITLE batch comes last, because a title-block title can
 * only be chosen once every page has been seen (the project name repeats on
 * every sheet; a title does not). It carries ONLY the title field, for pages
 * whose label and bookmark gave none, so it cannot disturb anything else.
 *
 * A page batch always sends every field, found or not. That is how a re-read
 * clears an earlier reading that is no longer supported. A number a PERSON set
 * is untouched by it anyway — the server's write refuses to overwrite those.
 */
import {
  parseSheetName,
  resolveSheetIdentity,
  type ParsedSheetName,
} from "@shared/sheetIdentity";

export type PageSources = {
  label: ParsedSheetName | null;
  bookmark: ParsedSheetName | null;
};

/**
 * Each page's label and bookmark, parsed.
 *
 * When several bookmarks point at one page — an outline often nests a group
 * heading and the sheet itself — the first one that carries a sheet number is
 * used. A heading like `GENERAL` gives nothing (parseSheetName), so it cannot
 * become a page's "title".
 */
export function sourcesByPage(
  labels: readonly string[] | null,
  bookmarks: readonly { pageNumber: number; title: string }[]
): Map<number, PageSources> {
  const out = new Map<number, PageSources>();
  const at = (page: number) => {
    let entry = out.get(page);
    if (!entry) {
      entry = { label: null, bookmark: null };
      out.set(page, entry);
    }
    return entry;
  };
  labels?.forEach((raw, index) => {
    const parsed = raw ? parseSheetName(raw, { titleOnly: true }) : null;
    if (parsed) at(index + 1).label = parsed;
  });
  for (const { pageNumber, title } of bookmarks) {
    const entry = at(pageNumber);
    if (entry.bookmark) continue;
    const parsed = parseSheetName(title, { titleOnly: false });
    if (parsed) entry.bookmark = parsed;
  }
  return out;
}

type Source = "label" | "bookmark" | "titleblock";
export type PageBatchEntry = {
  pageNumber: number;
  text: { text: string; hasTextLayer: boolean };
  number: { value: string | null; source: Source | null };
  title: { value: string | null; source: Source | null };
};

export function pageBatch(
  pages: readonly {
    pageNumber: number;
    text: string;
    hasTextLayer: boolean;
    titleBlockNumber: string | null;
  }[],
  sources: Map<number, PageSources>
): PageBatchEntry[] {
  return pages.map(page => {
    const found = sources.get(page.pageNumber);
    const resolved = resolveSheetIdentity({
      label: found?.label ?? null,
      bookmark: found?.bookmark ?? null,
      titleBlock: page.titleBlockNumber
        ? { number: page.titleBlockNumber, title: null }
        : null,
    });
    return {
      pageNumber: page.pageNumber,
      text: { text: page.text, hasTextLayer: page.hasTextLayer },
      number: resolved.number,
      title: resolved.title,
    };
  });
}

/** Title-block titles, only where a label or bookmark gave no title. */
export function titleBatch(
  titles: readonly (string | null)[],
  sources: Map<number, PageSources>
): { pageNumber: number; title: { value: string; source: "titleblock" } }[] {
  const out: {
    pageNumber: number;
    title: { value: string; source: "titleblock" };
  }[] = [];
  titles.forEach((title, index) => {
    if (!title) return;
    const pageNumber = index + 1;
    const found = sources.get(pageNumber);
    if (found?.label?.title || found?.bookmark?.title) return;
    out.push({ pageNumber, title: { value: title, source: "titleblock" } });
  });
  return out;
}
