/**
 * COUNTING DEEP TEST, AI READING — with SAVED FAKE answers only. No real model
 * is called and no money is spent: `invokeLLM` is mocked, and every reply
 * below is a string written here.
 *
 * What it checks (owner, 2026-10-15 night):
 *   - the reply parser takes only the closed answers it asked for, and turns
 *     anything else into "no answer" rather than a guess;
 *   - `planCopilot.checkScanFinds` makes exactly ONE call per press and writes
 *     NOTHING — no mark, no line, no count moves;
 *   - with AI switched off it refuses before any call.
 * The client half — an answer never confirms a find — is
 * client/src/lib/countingScan.test.ts ("AI answers…").
 *
 * Fixture user 9913.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./llm", async () => {
  const actual = await vi.importActual<typeof import("./llm")>("./llm");
  return { ...actual, invokeLLM: vi.fn() };
});

import { eq } from "drizzle-orm";
import { invokeLLM } from "./llm";
import { parseScanFinds } from "./tieBreak";
import { getDb } from "./db";
import { bidLineItems, takeoffStamps } from "../drizzle/schema";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { as, bidWithSheet, freshUser } from "./bidBuilders.testHelper";

const USER = 9913;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

const reply = (content: string) =>
  ({ choices: [{ message: { content }, finish_reason: "stop" }] }) as never;
const crops = [1, 2, 3, 4].map(id => ({
  id,
  picture: "data:image/png;base64,AA",
}));

describe("the AI reply parser, on saved fake replies", () => {
  it("reads the four closed answers", () => {
    const m = parseScanFinds(
      reply("Picture 1: 1\nPicture 2: 2\nPicture 3: 3\nPicture 4: 0"),
      crops
    );
    expect(Object.fromEntries(m)).toEqual({
      1: "same",
      2: "otherLabel",
      3: "existing",
      4: "notThis",
    });
  });

  it("does not care about order or prose around the answers", () => {
    const m = parseScanFinds(
      reply("Sure. Picture 3 : 1. Also Picture 1:2 and picture 2: 1"),
      crops
    );
    expect(m.get(3)).toBe("same");
    expect(m.get(1)).toBe("otherLabel");
  });

  it("turns an answer it did not offer, or none, into no answer — never a guess", () => {
    const m = parseScanFinds(reply("Picture 1: 7\nPicture 2: yes"), crops);
    expect(Array.from(m.values())).toEqual([null, null, null, null]);
    expect(Array.from(parseScanFinds(reply(""), crops).values())).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});

describe.skipIf(!hasDb)("checkScanFinds through the router, AI faked", () => {
  let bidId = 0;
  let sheetId = 0;

  beforeAll(async () => {
    await freshUser(USER);
    ({ bidId, sheetId } = await bidWithSheet(
      as(USER),
      USER,
      "AI fake scan finds"
    ));
  }, 60_000);

  afterEach(() => {
    vi.mocked(invokeLLM).mockReset();
    delete process.env.DISABLE_AI_FEATURES;
  });

  const counts = async () => {
    const db = (await getDb())!;
    const stamps = await db
      .select()
      .from(takeoffStamps)
      .where(eq(takeoffStamps.bidId, bidId));
    const lines = await db
      .select()
      .from(bidLineItems)
      .where(eq(bidLineItems.bidId, bidId));
    return { stamps: stamps.length, lines: lines.length };
  };

  it("one press = one call; answers come back; nothing on the bid moves", async () => {
    vi.mocked(invokeLLM).mockResolvedValueOnce(
      reply("Picture 1: 1\nPicture 2: 2\nPicture 3: 0\nPicture 4: 3")
    );
    const before = await counts();
    const out = await as(USER).planCopilot.checkScanFinds({
      sheetId,
      picked: "data:image/png;base64,AA",
      crops,
    });
    expect(vi.mocked(invokeLLM)).toHaveBeenCalledTimes(1);
    expect(out.answers).toEqual([
      { cropId: 1, answer: "same" },
      { cropId: 2, answer: "otherLabel" },
      { cropId: 3, answer: "notThis" },
      { cropId: 4, answer: "existing" },
    ]);
    expect(await counts()).toEqual(before);
  });

  it("an AI that cannot be reached changes nothing and says so", async () => {
    vi.mocked(invokeLLM).mockRejectedValueOnce(new Error("socket hang up"));
    const before = await counts();
    const out = await as(USER).planCopilot.checkScanFinds({
      sheetId,
      picked: "data:image/png;base64,AA",
      crops,
    });
    expect(out.answers.every(a => a.answer === null)).toBe(true);
    expect(out.message).toMatch(/Nothing was changed/);
    expect(await counts()).toEqual(before);
  });

  it("with AI switched off it refuses before spending anything", async () => {
    process.env.DISABLE_AI_FEATURES = "true";
    await expect(
      as(USER).planCopilot.checkScanFinds({
        sheetId,
        picked: "data:image/png;base64,AA",
        crops,
      })
    ).rejects.toThrow();
    expect(vi.mocked(invokeLLM)).not.toHaveBeenCalled();
  });
});
