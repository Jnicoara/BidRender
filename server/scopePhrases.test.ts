/**
 * THE NOTE FINDER (scope-tags-plan.md step 7) — the phrases, the sentence
 * around one, the lines it suggests, and `bidPdfs.scopePhrases` against a
 * real database.
 *
 *   • NIC is a whole word: MECHANICAL and CLINIC hold no note;
 *   • "FURNISHED BY OWNER" is one note, not that and "BY OWNER" again;
 *   • a sentence the drawing printed over two text pieces is found whole,
 *     and the dots of G.C. / N.I.C. do not end it;
 *   • EXISTING TO REMAIN is not a who-does-it note (plan § 0, Q9);
 *   • every example passes one of the LIKE patterns MySQL narrows with, so
 *     the narrowing cannot lose a note the exact test would find;
 *   • the procedure lists a note printed on two sheets once, says how many
 *     sheets it could not read, and refuses another company's bid.
 *
 * Fixture ids 9947 / 9948 are this file's alone.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  SCOPE_PHRASES,
  SCOPE_PHRASE_LIKES,
  collapseSpaces,
  findScopePhrases,
  linesSharingAWord,
  sentenceAround,
} from "../shared/scopePhrases";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const found = (text: string) =>
  findScopePhrases(collapseSpaces(text)).map(h => [
    h.phrase.label,
    h.phrase.suggests,
  ]);

/** One example per phrase, written the way drawings print them. */
const EXAMPLES: [string, string][] = [
  ["DATA CABLING FURNISHED BY OTHERS.", "Furnished by others"],
  ["LIGHT FIXTURES FURNISHED BY THE OWNER.", "Furnished by owner"],
  ["OWNER-FURNISHED APPLIANCES.", "Owner furnished"],
  ["SIGNAGE NOT IN CONTRACT.", "Not in contract"],
  ["CONTROL WIRING BY DIV. 23.", "By Division 23 / 27 / 28"],
  ["PATCHING BY G.C.", "By G.C."],
  ["FIRE ALARM BY OTHERS.", "By others"],
  ["FURNITURE BY OWNER.", "By owner"],
  ["EV CHARGERS OFCI.", "OFCI"],
  ["KIOSKS O.F.O.I.", "OFOI"],
  ["PANELS CFCI.", "CFCI"],
  ["SITE LIGHTING N.I.C.", "N.I.C."],
  ["SITE LIGHTING NIC", "N.I.C."],
];

describe("the phrases", () => {
  it("finds each one, as written on a drawing", () => {
    for (const [text, label] of EXAMPLES)
      expect(
        found(text).map(f => f[0]),
        text
      ).toEqual([label]);
    // Every phrase has an example here.
    expect(new Set(EXAMPLES.map(e => e[1]))).toEqual(
      new Set(SCOPE_PHRASES.map(p => p.label))
    );
  });

  it("NIC only as a whole word: not inside MECHANICAL, CLINIC or TECHNICAL", () => {
    expect(found("SEE MECHANICAL PLANS. CLINIC WING. TECHNICAL DATA.")).toEqual(
      []
    );
  });

  it("the longer phrase wins: FURNISHED BY OWNER is one note, suggesting owner furnishes", () => {
    expect(found("FIXTURES FURNISHED BY OWNER, INSTALLED BY EC.")).toEqual([
      ["Furnished by owner", "ofci"],
    ]);
  });

  it("does not read EXISTING TO REMAIN, or Division 26, as who does the work", () => {
    expect(found("EXISTING TO REMAIN. E.T.R. BY DIVISION 26.")).toEqual([]);
  });

  it("every example passes one of the LIKE patterns MySQL narrows with", () => {
    // The column's collation ignores case; LIKE's % is any run, _ one char.
    const asRegex = (like: string) =>
      new RegExp(
        "^" +
          like
            .split("")
            .map(c =>
              c === "%" ? "[\\s\\S]*" : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            )
            .join("") +
          "$",
        "i"
      );
    for (const [text] of EXAMPLES)
      expect(
        SCOPE_PHRASE_LIKES.some(like => asRegex(like).test(text)),
        text
      ).toBe(true);
  });
});

describe("the sentence around a note", () => {
  it("is found whole when the drawing printed it over two text pieces", () => {
    // pdf.js items joined by spaces — and a line break inside the note.
    const text = collapseSpaces(
      "2. ALL CONDUIT EMT. 3. LIGHT FIXTURES FURNISHED\n  BY OWNER, INSTALLED BY EC. 4. GROUND ALL BOXES."
    );
    const [hit] = findScopePhrases(text);
    expect(sentenceAround(text, hit)).toBe(
      "LIGHT FIXTURES FURNISHED BY OWNER, INSTALLED BY EC."
    );
  });

  it("the dots in G.C. and N.I.C. do not end it", () => {
    const text = "1. PATCHING BY G.C. AFTER ROUGH-IN INSPECTION. 2. NEXT.";
    const [hit] = findScopePhrases(text);
    expect(sentenceAround(text, hit)).toBe(
      "PATCHING BY G.C. AFTER ROUGH-IN INSPECTION."
    );
  });

  it("an abbreviation's last dot IS the full stop before the next note number, or at the end", () => {
    // Seen on screen 2026-10-12: "SITE LIGHTING N.I.C. 5." took note 5's number.
    const text = "4. SITE LIGHTING N.I.C. 5. PATCHING BY G.C. 6. SEE M.";
    const [nic, gc] = findScopePhrases(text);
    expect(sentenceAround(text, nic)).toBe("SITE LIGHTING N.I.C.");
    expect(sentenceAround(text, gc)).toBe("PATCHING BY G.C.");
    const last = "1. ALL EMT. 2. SITE LIGHTING N.I.C.";
    expect(sentenceAround(last, findScopePhrases(last)[0])).toBe(
      "SITE LIGHTING N.I.C."
    );
  });

  it("a runaway note is cut, and says so", () => {
    const text = "A ".repeat(200) + "BY OTHERS " + "B ".repeat(200);
    const [hit] = findScopePhrases(text);
    const sentence = sentenceAround(text, hit);
    expect(sentence.startsWith("…")).toBe(true);
    expect(sentence.endsWith("…")).toBe(true);
    expect(sentence.length).toBeLessThan(340);
  });
});

describe("the lines a note suggests", () => {
  it("shares a subject word, plurals folded; the phrase's own words never match", () => {
    const lines = [
      { id: 1, name: "Light fixture, 2x4 LED" },
      { id: 2, name: "Duplex receptacle" },
      { id: 3, name: "Owner panel feed" },
    ];
    expect(
      linesSharingAWord(
        "LIGHT FIXTURES FURNISHED BY OWNER, INSTALLED BY EC.",
        lines
      ).map(l => l.id)
    ).toEqual([1]);
  });
});

const USER = 9947;
const OTHER = 9948;
const hasDb = Boolean(process.env.DATABASE_URL);
dropFixtureUsersAfterAll([USER, OTHER]);

const caller = (id = USER) =>
  appRouter.createCaller({
    user: {
      id,
      openId: `test-scope-phrases-${id}`,
      role: "user",
      accessTier: "internal",
    },
  } as unknown as TrpcContext);

beforeAll(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  for (const id of [USER, OTHER]) {
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing)
      await database.insert(users).values({
        id,
        openId: `test-scope-phrases-${id}`,
        name: `Scope phrases fixture ${id}`,
        accessTier: "internal",
      });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER, OTHER]));
});

describe.skipIf(!hasDb)("bidPdfs.scopePhrases", () => {
  it("lists each note once with every sheet it is on, and what it could not read", async () => {
    const bidId = (await caller().bids.create({
      name: `Scope phrases ${Date.now()}`,
    }))!.id;
    const database = (await getDb())!;
    const [pdf] = await database.insert(bidPdfs).values({
      bidId,
      userId: USER,
      filename: "E-Series.pdf",
      storageKey: `test/${bidId}/scope-${Math.random()}.pdf`,
      byteSize: 1024,
      pageCount: 4,
      sortOrder: 0,
    });
    const note = "GENERAL NOTES: 1. FIRE ALARM DEVICES BY OTHERS. 2. ALL EMT.";
    await caller().bidPdfs.recordSheetReads({
      bidPdfId: pdf.insertId,
      pages: [
        { pageNumber: 1, text: { text: note, hasTextLayer: true } },
        { pageNumber: 2, text: { text: note, hasTextLayer: true } },
        {
          pageNumber: 3,
          text: { text: "SEE MECHANICAL PLANS.", hasTextLayer: true },
        },
        // page 4 never read; and nothing on a scan
      ],
    });

    const result = await caller().bidPdfs.scopePhrases({ bidId });
    expect(
      result.notes.map(n => [
        n.phrase,
        n.suggests,
        n.sentence,
        n.sheets.map(s => s.pageNumber),
      ])
    ).toEqual([
      ["By others", "by_others", "FIRE ALARM DEVICES BY OTHERS.", [1, 2]],
    ]);
    expect(result.notSearched).toBe(1);
    expect(result.truncated).toBe(false);

    await expect(
      caller(OTHER).bidPdfs.scopePhrases({ bidId })
    ).rejects.toThrow();
  });
});
