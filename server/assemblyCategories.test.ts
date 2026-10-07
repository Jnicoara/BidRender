import { describe, expect, it } from "vitest";
import { ASSEMBLY_CATEGORIES } from "../drizzle/schema";
import {
  ASSEMBLY_CATEGORY_ORDER,
  groupByCategory,
} from "../shared/assemblyCategories";

describe("the assembly shelves", () => {
  it("are exactly the categories the column accepts", () => {
    // The screens' copy lagged 0122 by two categories and 29 starters
    // vanished from the Library (staging, 2026-10-07).
    expect([...ASSEMBLY_CATEGORY_ORDER].sort()).toEqual(
      [...ASSEMBLY_CATEGORIES].sort()
    );
  });

  it("show every row in a new category — the 0122 shelves", () => {
    const groups = groupByCategory([
      { category: "Devices", name: "a" },
      { category: "Demo & Retrofit", name: "b" },
      { category: "General", name: "c" },
    ]);
    expect(groups.map(g => g.category)).toEqual([
      "Devices",
      "Demo & Retrofit",
      "General",
    ]);
  });

  it("never drop a row whose category is not on the list", () => {
    const groups = groupByCategory([
      { category: "Lighting", name: "a" },
      { category: "Something new", name: "b" },
    ]);
    expect(groups.flatMap(g => g.items.map(i => i.name))).toEqual(["a", "b"]);
  });

  it("leave out empty shelves", () => {
    expect(groupByCategory([{ category: "Panels" }]).length).toBe(1);
  });
});
