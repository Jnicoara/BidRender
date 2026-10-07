/**
 * Unit tests for material database pricing logic.
 * Tests the userPrice > defaultPrice > unitMaterialCost fallback chain.
 */
import { describe, it, expect } from "vitest";

// ─── Effective price logic (mirrors client-side effectivePrice) ────────────────

function effectivePrice(m: {
  userPrice: number | null;
  defaultPrice: number | null;
  unitMaterialCost: number | null;
}): number | null {
  if (m.userPrice != null && m.userPrice > 0) return m.userPrice;
  if (m.defaultPrice != null && m.defaultPrice > 0) return m.defaultPrice;
  if (m.unitMaterialCost != null && m.unitMaterialCost > 0)
    return m.unitMaterialCost;
  return null;
}

function isMissingPrice(m: Parameters<typeof effectivePrice>[0]): boolean {
  return effectivePrice(m) === null;
}

// ─── Age indicator logic ──────────────────────────────────────────────────────

// The clock is a PARAMETER: reading Date.now() here as well as in the test
// made "exactly 30 days" 30 days and a millisecond whenever the clock ticked
// between the two reads — red on local-dev run for 74a2ade, 2026-10-07.
function ageClass(
  lastUpdated: Date | null,
  now: number = Date.now()
): "green" | "yellow" | "red" | "none" {
  if (!lastUpdated) return "none";
  const days = (now - lastUpdated.getTime()) / 86_400_000;
  if (days <= 30) return "green";
  if (days <= 90) return "yellow";
  return "red";
}

// ─── CSV auto-detect logic ────────────────────────────────────────────────────

function autoDetectMapping(headers: string[]): Record<string, string> {
  const lower = headers.map(h => h.toLowerCase());
  const find = (candidates: string[]) => {
    for (const c of candidates) {
      const idx = lower.findIndex(h => h.includes(c));
      if (idx >= 0) return headers[idx];
    }
    return "";
  };
  return {
    description: find(["description", "desc", "name", "item", "material"]),
    category: find(["category", "cat", "section", "trade", "phase"]),
    itemId: find([
      "item_id",
      "itemid",
      "item_code",
      "itemcode",
      "code",
      "sku",
      "id",
    ]),
    unit: find(["unit", "uom"]),
    userPrice: find([
      "user_price",
      "userprice",
      "my_price",
      "supply_price",
      "cost",
      "price",
    ]),
    defaultPrice: find([
      "default_price",
      "defaultprice",
      "base_price",
      "list_price",
      "listprice",
    ]),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("effectivePrice fallback chain", () => {
  it("returns userPrice when set and positive", () => {
    expect(
      effectivePrice({
        userPrice: 12.5,
        defaultPrice: 8.0,
        unitMaterialCost: 5.0,
      })
    ).toBe(12.5);
  });

  it("falls back to defaultPrice when userPrice is null", () => {
    expect(
      effectivePrice({
        userPrice: null,
        defaultPrice: 8.0,
        unitMaterialCost: 5.0,
      })
    ).toBe(8.0);
  });

  it("falls back to unitMaterialCost when userPrice and defaultPrice are both null", () => {
    expect(
      effectivePrice({
        userPrice: null,
        defaultPrice: null,
        unitMaterialCost: 5.0,
      })
    ).toBe(5.0);
  });

  it("returns null when all prices are null", () => {
    expect(
      effectivePrice({
        userPrice: null,
        defaultPrice: null,
        unitMaterialCost: null,
      })
    ).toBeNull();
  });

  it("returns null when all prices are zero", () => {
    expect(
      effectivePrice({ userPrice: 0, defaultPrice: 0, unitMaterialCost: 0 })
    ).toBeNull();
  });

  it("treats zero userPrice as missing (falls through to defaultPrice)", () => {
    expect(
      effectivePrice({ userPrice: 0, defaultPrice: 8.0, unitMaterialCost: 5.0 })
    ).toBe(8.0);
  });

  it("isMissingPrice returns true when all prices are null/zero", () => {
    expect(
      isMissingPrice({
        userPrice: null,
        defaultPrice: null,
        unitMaterialCost: null,
      })
    ).toBe(true);
    expect(
      isMissingPrice({ userPrice: 0, defaultPrice: 0, unitMaterialCost: 0 })
    ).toBe(true);
  });

  it("isMissingPrice returns false when any price is positive", () => {
    expect(
      isMissingPrice({
        userPrice: null,
        defaultPrice: 5.0,
        unitMaterialCost: null,
      })
    ).toBe(false);
    expect(
      isMissingPrice({
        userPrice: 12.5,
        defaultPrice: null,
        unitMaterialCost: null,
      })
    ).toBe(false);
  });
});

describe("age indicator", () => {
  it("returns 'none' for null lastUpdated", () => {
    expect(ageClass(null)).toBe("none");
  });

  it("returns 'green' for dates within 30 days", () => {
    const recent = new Date(Date.now() - 10 * 86_400_000); // 10 days ago
    expect(ageClass(recent)).toBe("green");
  });

  it("returns 'yellow' for dates 30-90 days ago", () => {
    const mid = new Date(Date.now() - 60 * 86_400_000); // 60 days ago
    expect(ageClass(mid)).toBe("yellow");
  });

  it("returns 'red' for dates older than 90 days", () => {
    const old = new Date(Date.now() - 120 * 86_400_000); // 120 days ago
    expect(ageClass(old)).toBe("red");
  });

  it("boundary: exactly 30 days is green", () => {
    const now = Date.now();
    const boundary = new Date(now - 30 * 86_400_000);
    expect(ageClass(boundary, now)).toBe("green");
    // ...and one millisecond past it is not: the boundary is real.
    expect(ageClass(boundary, now + 1)).toBe("yellow");
  });

  it("boundary: exactly 91 days is red", () => {
    const now = Date.now();
    const boundary = new Date(now - 91 * 86_400_000);
    expect(ageClass(boundary, now)).toBe("red");
  });
});

describe("CSV column auto-detection", () => {
  it("detects standard supply house headers", () => {
    const headers = [
      "Item_Code",
      "Category",
      "Description",
      "Unit",
      "User_Price",
      "Default_Price",
    ];
    const mapping = autoDetectMapping(headers);
    expect(mapping.description).toBe("Description");
    expect(mapping.category).toBe("Category");
    expect(mapping.itemId).toBe("Item_Code");
    expect(mapping.unit).toBe("Unit");
    expect(mapping.userPrice).toBe("User_Price");
    expect(mapping.defaultPrice).toBe("Default_Price");
  });

  it("detects alternate header names (case-insensitive)", () => {
    // "List Price" contains "list_price" as a substring only when spaces are replaced
    // The auto-detect uses h.includes(candidate) where candidate is "list_price" — won't match "List Price"
    // Use a header that actually matches: "ListPrice" contains "listprice"
    const headers = [
      "SKU",
      "Trade",
      "Material Name",
      "UOM",
      "Cost",
      "ListPrice",
    ];
    const mapping = autoDetectMapping(headers);
    expect(mapping.description).toBe("Material Name");
    expect(mapping.category).toBe("Trade");
    expect(mapping.itemId).toBe("SKU");
    expect(mapping.unit).toBe("UOM");
    expect(mapping.userPrice).toBe("Cost");
    expect(mapping.defaultPrice).toBe("ListPrice");
  });

  it("returns empty string for unrecognized columns", () => {
    const headers = ["col1", "col2", "col3"];
    const mapping = autoDetectMapping(headers);
    expect(mapping.description).toBe("");
    expect(mapping.category).toBe("");
  });
});
