/**
 * A write that lands while a query's FIRST read is in flight must still be
 * read back (smoke test 2, 2026-10-09). Against a real QueryClient, because
 * the hole is in React Query's own dedupe, not in our code.
 */
import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { refetchPastInFlight } from "./refetchPastInFlight";

/** A table the "server" reads slowly, and a write that lands mid-read. */
function setup() {
  let rows: string[] = [];
  let reads = 0;
  const client = new QueryClient();
  const queryKey = ["sheets", 1];
  const observer = new QueryObserver(client, {
    queryKey,
    queryFn: async () => {
      reads += 1;
      const seen = [...rows]; // read BEFORE the write lands
      await new Promise(r => setTimeout(r, 30));
      return seen;
    },
    retry: false,
  });
  const unsubscribe = observer.subscribe(() => {});
  return {
    client,
    queryKey,
    write: () => {
      rows = ["Sheet 1", "Sheet 2"];
    },
    reads: () => reads,
    settle: async () => {
      await new Promise(r => setTimeout(r, 120));
      unsubscribe();
      return client.getQueryData<string[]>(queryKey);
    },
  };
}

describe("re-reading after a write that beat the first read", () => {
  it("THE TRAP: a plain invalidate keeps the empty pre-write answer", async () => {
    const s = setup();
    await new Promise(r => setTimeout(r, 5)); // the first read is in flight
    s.write();
    await s.client.invalidateQueries({ queryKey: s.queryKey });
    expect(await s.settle()).toEqual([]);
    expect(s.reads()).toBe(1);
  });

  it("cancel-then-invalidate reads the rows the write made", async () => {
    const s = setup();
    await new Promise(r => setTimeout(r, 5));
    s.write();
    await refetchPastInFlight({
      cancel: () => s.client.cancelQueries({ queryKey: s.queryKey }),
      invalidate: () => s.client.invalidateQueries({ queryKey: s.queryKey }),
    });
    expect(await s.settle()).toEqual(["Sheet 1", "Sheet 2"]);
    expect(s.reads()).toBe(2);
  });
});
