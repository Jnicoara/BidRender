import { describe, it, expect } from "vitest";
import { searchAssemblies } from "./assemblySearch";

// Fixture names only — not the shipped starters, so a renamed starter cannot
// change what this asserts.
const library = [
  { id: 1, name: "Duplex receptacle standard", category: "Devices" },
  { id: 2, name: "Single pole switch", category: "Devices" },
  { id: 3, name: "GFCI receptacle", category: "Devices" },
  { id: 4, name: "2x4 LED troffer", category: "Lighting" },
];

describe("searching assemblies to link a hand-priced line", () => {
  it("finds an assembly by the slang an electrician types", () => {
    // A bare `includes` on the name found nothing for either of these.
    expect(searchAssemblies(library, "recep", 8).map(a => a.id)).toContain(1);
    expect(searchAssemblies(library, "gfi", 8).map(a => a.id)).toContain(3);
  });
  it("finds words in any order", () => {
    expect(searchAssemblies(library, "switch pole", 8)[0]?.id).toBe(2);
  });
  it("finds nothing for words the library does not have", () => {
    expect(searchAssemblies(library, "zz pole bracket", 8)).toEqual([]);
  });
  it("an empty box lists the first few, and the cap holds", () => {
    expect(searchAssemblies(library, "  ", 2).map(a => a.id)).toEqual([1, 2]);
  });
  it("hands back the caller's own rows, not copies", () => {
    expect(searchAssemblies(library, "troffer", 8)[0]).toBe(library[3]);
  });
});
