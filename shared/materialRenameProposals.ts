/**
 * The wire and cable names DECIDED by the owner on 2026-10-01 (size and
 * conductors, then type, then the metal spelled out at the END), current ->
 * proposed, exactly as references/materials-naming-and-pricing-plan.md § 1.1
 * (on a-materials-plan) lists them. Generated from that table; every current
 * name is checked against the shipped catalog by server/materialNaming.test.ts.
 *
 * A row the plan flagged (⚠) depends on an open question and is marked so,
 * rather than carrying the flag inside a name.
 */
export const WIRE_AND_CABLE_PROPOSALS: readonly {
  current: string;
  proposed: string;
  openQuestion?: string;
}[] = [
  { current: "#14 THHN", proposed: "#14 THHN Copper" },
  { current: "#12 THHN", proposed: "#12 THHN Copper" },
  { current: "#10 THHN", proposed: "#10 THHN Copper" },
  { current: "#14 THHN stranded", proposed: "#14 THHN stranded Copper" },
  { current: "#12 THHN stranded", proposed: "#12 THHN stranded Copper" },
  { current: "#10 THHN stranded", proposed: "#10 THHN stranded Copper" },
  { current: "#8 THHN", proposed: "#8 THHN Copper" },
  { current: "#6 THHN", proposed: "#6 THHN Copper" },
  { current: "#4 THHN", proposed: "#4 THHN Copper" },
  { current: "#3 THHN", proposed: "#3 THHN Copper" },
  { current: "#2 THHN", proposed: "#2 THHN Copper" },
  { current: "#1 THHN", proposed: "#1 THHN Copper" },
  { current: "#1/0 THHN", proposed: "#1/0 THHN Copper" },
  { current: "#2/0 THHN", proposed: "#2/0 THHN Copper" },
  { current: "#3/0 THHN", proposed: "#3/0 THHN Copper" },
  { current: "#4/0 THHN", proposed: "#4/0 THHN Copper" },
  { current: "250 kcmil THHN", proposed: "250 kcmil THHN Copper" },
  { current: "300 kcmil THHN", proposed: "300 kcmil THHN Copper" },
  { current: "350 kcmil THHN", proposed: "350 kcmil THHN Copper" },
  { current: "400 kcmil THHN", proposed: "400 kcmil THHN Copper" },
  { current: "500 kcmil THHN", proposed: "500 kcmil THHN Copper" },
  { current: "#8 XHHW AL", proposed: "#8 XHHW Aluminum" },
  { current: "#6 XHHW AL", proposed: "#6 XHHW Aluminum" },
  { current: "#4 XHHW AL", proposed: "#4 XHHW Aluminum" },
  { current: "#2 XHHW AL", proposed: "#2 XHHW Aluminum" },
  { current: "#1 XHHW AL", proposed: "#1 XHHW Aluminum" },
  { current: "#1/0 XHHW AL", proposed: "#1/0 XHHW Aluminum" },
  { current: "#2/0 XHHW AL", proposed: "#2/0 XHHW Aluminum" },
  { current: "#3/0 XHHW AL", proposed: "#3/0 XHHW Aluminum" },
  { current: "#4/0 XHHW AL", proposed: "#4/0 XHHW Aluminum" },
  { current: "250 kcmil XHHW AL", proposed: "250 kcmil XHHW Aluminum" },
  { current: "300 kcmil XHHW AL", proposed: "300 kcmil XHHW Aluminum" },
  { current: "350 kcmil XHHW AL", proposed: "350 kcmil XHHW Aluminum" },
  { current: "400 kcmil XHHW AL", proposed: "400 kcmil XHHW Aluminum" },
  { current: "500 kcmil XHHW AL", proposed: "500 kcmil XHHW Aluminum" },
  { current: "14-2 NM-B", proposed: "14/2 NM-B Copper" },
  { current: "12-2 NM-B", proposed: "12/2 NM-B Copper" },
  { current: "10-2 NM-B", proposed: "10/2 NM-B Copper" },
  { current: "14-3 NM-B", proposed: "14/3 NM-B Copper" },
  { current: "12-3 NM-B", proposed: "12/3 NM-B Copper" },
  { current: "10-3 NM-B", proposed: "10/3 NM-B Copper" },
  { current: "8-2 NM-B", proposed: "8/2 NM-B Copper" },
  { current: "8-3 NM-B", proposed: "8/3 NM-B Copper" },
  { current: "6-3 NM-B", proposed: "6/3 NM-B Copper" },
  { current: "14-2 MC cable", proposed: "14/2 MC cable Copper" },
  { current: "14-3 MC cable", proposed: "14/3 MC cable Copper" },
  { current: "14-4 MC cable", proposed: "14/4 MC cable Copper" },
  { current: "12-2 MC cable", proposed: "12/2 MC cable Copper" },
  { current: "12-3 MC cable", proposed: "12/3 MC cable Copper" },
  { current: "12-4 MC cable", proposed: "12/4 MC cable Copper" },
  { current: "10-2 MC cable", proposed: "10/2 MC cable Copper" },
  { current: "10-3 MC cable", proposed: "10/3 MC cable Copper" },
  { current: "10-4 MC cable", proposed: "10/4 MC cable Copper" },
  { current: "8-2 MC cable", proposed: "8/2 MC cable Copper" },
  { current: "8-3 MC cable", proposed: "8/3 MC cable Copper" },
  { current: "8-4 MC cable", proposed: "8/4 MC cable Copper" },
  { current: "6-2 MC cable", proposed: "6/2 MC cable Copper" },
  { current: "6-3 MC cable", proposed: "6/3 MC cable Copper" },
  { current: "6-4 MC cable", proposed: "6/4 MC cable Copper" },
  { current: "4-2 MC cable", proposed: "4/2 MC cable Copper" },
  { current: "4-3 MC cable", proposed: "4/3 MC cable Copper" },
  { current: "3-3 MC cable", proposed: "3/3 MC cable Copper" },
  // Q2d answered 2026-10-07: "#3/4", so a #3 four-wire does not read as
  // 3/4 inch. The size parser does not read "#3/4" yet — the rename step's
  // parser change must (references/materials-review-sheet-plan.md).
  { current: "3-4 MC cable", proposed: "#3/4 MC cable Copper" },
  { current: "2-2 MC cable", proposed: "2/2 MC cable Copper" },
  { current: "2-3 MC cable", proposed: "2/3 MC cable Copper" },
  {
    current: "12-2 MC cable, isolated ground",
    proposed: "12/2 MC cable isolated ground Copper",
  },
  { current: "14-2 UF-B", proposed: "14/2 UF-B Copper" },
  { current: "12-2 UF-B", proposed: "12/2 UF-B Copper" },
  { current: "10-2 UF-B", proposed: "10/2 UF-B Copper" },
  { current: "8-2 UF-B", proposed: "8/2 UF-B Copper" },
  { current: "#16 fixture wire", proposed: "#16 fixture wire Copper" },
  { current: "#18 fixture wire", proposed: "#18 fixture wire Copper" },
  {
    current: "14-2 fire alarm cable",
    proposed: "14/2 fire alarm cable Copper",
  },
  {
    current: "16-2 fire alarm cable",
    proposed: "16/2 fire alarm cable Copper",
  },
  { current: "14-3 SJOOW cord", proposed: "14/3 SJOOW cord Copper" },
  { current: "12-3 SOOW cord", proposed: "12/3 SOOW cord Copper" },
  { current: "10-3 SOOW cord", proposed: "10/3 SOOW cord Copper" },
  { current: "12-3 tray cable", proposed: "12/3 tray cable Copper" },
  {
    current: "12-2 submersible pump cable",
    proposed: "12/2 submersible pump cable Copper",
  },
  {
    current: "14-4 mini-split cable",
    proposed: "14/4 mini-split cable Copper",
  },
  { current: "#14 bare CU, solid", proposed: "#14 bare solid Copper" },
  { current: "#12 bare CU, solid", proposed: "#12 bare solid Copper" },
  { current: "#10 bare CU, solid", proposed: "#10 bare solid Copper" },
  { current: "#8 bare CU, solid", proposed: "#8 bare solid Copper" },
  { current: "#10 bare CU, stranded", proposed: "#10 bare stranded Copper" },
  { current: "#8 bare CU, stranded", proposed: "#8 bare stranded Copper" },
  { current: "#6 bare CU, stranded", proposed: "#6 bare stranded Copper" },
  { current: "#4 bare CU, stranded", proposed: "#4 bare stranded Copper" },
  { current: "#2 bare CU, stranded", proposed: "#2 bare stranded Copper" },
  { current: "#1/0 bare CU, stranded", proposed: "#1/0 bare stranded Copper" },
  { current: "#2/0 bare CU, stranded", proposed: "#2/0 bare stranded Copper" },
  // SER names SPELL OUT THE FULL CONDUCTOR SET (owner, 2026-10-07, second
  // answers): "4/0-4/0-4/0-2/0 SER Aluminum", never the "4/0-3" shorthand.
  // This replaced the "N/3" short form these rows were first proposed with
  // ("8/3 SER Copper"). The shorthand was also a real hazard: "4/0-3 SER
  // Aluminum" differed only by capitals from the RETIRED "4/0-3 SER
  // aluminum", which the seed's case-blind SQL turned into a row deleted on
  // every start (server/seedNameCase.test.ts). The shorthand stays findable
  // as a search word on each row.
  { current: "8-8-8-8 SER CU", proposed: "8-8-8-8 SER Copper" },
  { current: "6-6-6-6 SER CU", proposed: "6-6-6-6 SER Copper" },
  { current: "4-4-4-6 SER CU", proposed: "4-4-4-6 SER Copper" },
  { current: "2-2-2-4 SER CU", proposed: "2-2-2-4 SER Copper" },
  { current: "1-1-1-3 SER CU", proposed: "1-1-1-3 SER Copper" },
  { current: "4-4-4-6 SER AL", proposed: "4-4-4-6 SER Aluminum" },
  { current: "2-2-2-4 SER AL", proposed: "2-2-2-4 SER Aluminum" },
  {
    current: "1/0-1/0-1/0-2 SER AL",
    proposed: "1/0-1/0-1/0-2 SER Aluminum",
  },
  {
    current: "2/0-2/0-2/0-1 SER AL",
    proposed: "2/0-2/0-2/0-1 SER Aluminum",
  },
  {
    current: "3/0-3/0-3/0-1/0 SER AL",
    proposed: "3/0-3/0-3/0-1/0 SER Aluminum",
  },
  { current: "4/0-4/0-2/0 SER AL", proposed: "4/0-4/0-2/0 SER Aluminum" },
  {
    current: "4/0-4/0-4/0-2/0 SER AL",
    proposed: "4/0-4/0-4/0-2/0 SER Aluminum",
  },
  { current: "250-250-250 SER AL", proposed: "250-250-250 SER Aluminum" },
  { current: "4-4-6 SEU AL", proposed: "4-4-6 SEU Aluminum" },
  { current: "2-2-4 SEU AL", proposed: "2-2-4 SEU Aluminum" },
  { current: "#4/0 USE-2 AL", proposed: "#4/0 USE-2 Aluminum" },
  { current: "1/0 URD triplex AL", proposed: "1/0 URD triplex Aluminum" },
];

/**
 * Renames the OWNER decided row by row, on the review sheet (2026-10-07).
 * Same rename-in-place as the rest: the row keeps its id, so every recipe
 * pointing at it (starter LT7, LT8) follows without an edit.
 *
 * - Ground rods are three items, not duplicates: 5/8" x 8 ft is the one
 *   usually used; the plain 10 ft is a 5/8" rod; 3/4" x 10 ft stays.
 * - Wafers: 4" and 6" separately, as canless wafers. The combined 5"/6" row
 *   BECOMES the 6" item (starter LT7, "Wafer LED downlight, 6" (canless)",
 *   already prices from it) — this reverses the 5"/6" decision recorded in
 *   server/seed/materials/lighting.ts, which says so.
 */
export const OWNER_RENAMES: readonly { current: string; proposed: string }[] = [
  { current: "Ground rod, 8 ft", proposed: 'Ground rod, 5/8" x 8 ft' },
  { current: "Ground rod, 10 ft", proposed: 'Ground rod, 5/8" x 10 ft' },
  {
    current: '4" wafer LED downlight',
    proposed: '4" canless wafer LED downlight',
  },
  {
    current: '5"/6" wafer LED downlight',
    proposed: '6" canless wafer LED downlight',
  },
];
