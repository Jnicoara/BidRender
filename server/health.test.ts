/**
 * `/api/health` answers 503 when the database fails OR hangs — and comes back
 * in its own few seconds even when every pooled connection is stuck (Q-DB1).
 */
import { describe, expect, it } from "vitest";
import { databaseHealth } from "./health";

describe("databaseHealth", () => {
  it("is 200 when the database answers", async () => {
    expect(await databaseHealth(async () => 1)).toEqual({
      status: 200,
      body: { database: "ok" },
    });
  });

  it("is 503 when the database errors, and says nothing more", async () => {
    const answer = await databaseHealth(async () => {
      throw new Error("ECONNREFUSED 10.0.0.5:25060");
    });
    expect(answer).toEqual({ status: 503, body: { database: "unreachable" } });
  });

  it("is 503 within its own limit when the database never answers", async () => {
    const started = Date.now();
    const answer = await databaseHealth(() => new Promise(() => {}), 200);
    expect(answer.status).toBe(503);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
