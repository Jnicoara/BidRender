# Catalog reality check — do the starter items exist as named?

**Track C, started 2026-10-09. Research only: nothing in the catalog was
changed.** Names are frozen (`pricing/frozen-names.json`); anything the
owner approves from here is applied by Track A, through
`RENAMED_BASELINE_MATERIALS` / `RETIRED_BASELINE_MATERIALS`, never as a text
edit (CLAUDE.md § Materials).

**What was asked:** for each starter item, does it exist in the real world
as named, in that size, rating or depth? No prices. Flag items that do not
exist as named, wrong sizes or ratings, misleading names and duplicates,
and for each one suggest the closest real, commonly stocked item with
sources.

## Scope of this pass

- **The 362 items that a starter assembly or shipped run type prices from**:
  every row with a non-zero "Used by" in `starter-catalog-pricing.xlsx`
  (`pricing/starterSheetLayout.ts` `catalogInSheetOrder`, read on
  `local-dev` `679cce8` + C's `c-sch80-500`). That covers the "~300
  most-used items" and "everything used in starter assemblies" together.
  If a rebuild of the sheet shows a different count of used rows, stop and
  find out why before treating this list as complete: either the starters
  changed or this file is stale.
- **Box depths are skipped**, because Track A is checking those. A box is
  checked as a product type only.
- **Not yet done:** the other 1,463 catalog rows, family by family.

## Method

- Up to three sources per item: the manufacturer's catalog or spec sheet
  first, then Home Depot, Lowe's, Graybar or another supplier page. For an
  obvious standard (12/2 NM-B, 1/2" EMT) one good source was enough. The
  effort went into the items that looked doubtful.
- Where a page would not load, the finding rests on the search result
  snippet, and the row says so.
- Verdicts: **OK**; **FLAG: does not exist** (not made as named);
  **FLAG: wrong size/rating**; **FLAG: misleading** (ambiguous, missing the
  rating that sets the price, or the wrong trade term); **FLAG: duplicate**
  (the same real product as another catalog name).
- Each family's table was written by a research agent working from that
  family's list and then read through before being committed. Each "#" is
  the item's row in the pricing sheet's order.

## Wire & cable, and low-voltage cable and devices (51 items)

Checked 2026-10-09. **Read this before trusting the OKs:** most rows here
are commodity cable, and the ones marked "standard; no page loaded" are OK
on trade knowledge only, with no page behind them. Every FLAG row has a
source, or says it has none. The aliases quoted were read from the seed,
not assumed.

| #   | Item                                 | Verdict                  | Finding                                                                                                                                              | Sources |
| --- | ------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 3   | 14/2 NM-B Copper                     | OK                       | standard; no page loaded                                                                                                                             | — |
| 7   | 12/2 MC cable Copper                 | OK                       | Southwire 12/2 MC Armorlite                                                                                                                          | [HD 202316370](https://homedepot.com/p/reviews/Southwire-12-2-x-25-ft-Solid-CU-MC-Metal-Clad-Armorlite-Cable-68580021/202316370/5) |
| 8   | 12/2 NM-B Copper                     | OK                       | standard; no page loaded                                                                                                                             | — |
| 15  | #12 THHN Copper                      | FLAG: misleading         | Real, but the name does not say solid while its twin `#12 THHN stranded Copper` exists; only the alias says "solid". Pipe work is usually stranded.   | standard; no page loaded |
| 20  | 14/3 NM-B Copper                     | OK                       | standard; no page loaded                                                                                                                             | — |
| 23  | #10 THHN Copper                      | FLAG: misleading         | Same as #12: twin `#10 THHN stranded Copper`                                                                                                         | standard; no page loaded |
| 24  | 6/3 NM-B Copper                      | OK                       | standard; no page loaded                                                                                                                             | — |
| 30  | #4 bare stranded Copper              | OK                       | standard; no page loaded                                                                                                                             | — |
| 45  | 14/2 fire alarm cable Copper         | OK (alias)               | 14/2 red FPLP is real and unshielded by default; the alias "shielded" is wrong for it                                                                | [HD 332475151](https://www.homedepot.com/p/Syston-Cable-Technology-100-ft-14-2-Red-FPLP-Plenum-Rated-Unshielded-Copper-Fire-Alarm-Security-Burglar-Station-Wire-UV-Resistant-RoHS-6063-SB-RD-100/332475151) |
| 46  | 12/3 MC cable Copper                 | OK                       | standard; no page loaded                                                                                                                             | — |
| 47  | #12 THHN green Copper                | FLAG: misleading (minor) | Real; aliased "solid", but an equipment ground in pipe is usually stranded                                                                           | standard; no page loaded |
| 54  | 18/2 control wire Copper             | OK                       | standard; no page loaded                                                                                                                             | — |
| 55  | #6 bare stranded Copper              | OK                       | standard; no page loaded                                                                                                                             | — |
| 56  | 10/2 NM-B Copper                     | OK                       | standard; no page loaded                                                                                                                             | — |
| 57  | 4/0-4/0-4/0-2/0 SER Aluminum         | OK (alias)               | Southwire 13107801 is this exact cable. The aliases "4/0-3" and "4/0/3" are 3-wire shorthand and also describe SEU 4/0-4/0-4/0                        | [HD 202316402](https://www.homedepot.com/p/Southwire-500-ft-4-0-4-0-4-0-2-0-Gray-Stranded-AL-SER-Cable-13107801/202316402) · [HD SEU 202316289](https://www.homedepot.com/p/questions/Southwire-500-ft-4-0-4-0-4-0-Gray-Stranded-AL-SEU-Cable-13093001/202316289/1) |
| 69  | Cat6 cable Copper                    | OK                       | standard; no page loaded                                                                                                                             | — |
| 70  | Cat6 jack                            | OK                       | standard; no page loaded                                                                                                                             | — |
| 71  | 18/4 control wire Copper             | OK                       | standard; no page loaded                                                                                                                             | — |
| 73  | #8 bare solid Copper                 | OK                       | standard; no page loaded                                                                                                                             | — |
| 74  | 10/3 NM-B Copper                     | OK                       | standard; no page loaded                                                                                                                             | — |
| 75  | #6 THHN Copper                       | OK                       | stranded at this size; standard; no page loaded                                                                                                      | — |
| 105 | Keystone wall plate, 1-port          | OK                       | standard; no page loaded                                                                                                                             | — |
| 117 | 10/2 MC cable Copper                 | OK                       | standard; no page loaded                                                                                                                             | — |
| 118 | 10/3 MC cable Copper                 | OK                       | standard; no page loaded                                                                                                                             | — |
| 119 | 12/2 MC cable isolated ground Copper | OK (special order)       | Real (insulated ground plus an isolated ground), often special order. No manufacturer sheet found, only trade forum posts                            | [Mike Holt forum](https://forums.mikeholt.com/goto/post?id=1276543) |
| 120 | 14/4 mini-split cable Copper         | OK (note)                | Two real forms: 14/4 stranded tray-style cable, and Southwire 14/4 mini-split MC (armored). The name does not say which                              | [HD 205404476](https://www.homedepot.com/p/Southwire-50-ft-14-4-Stranded-CU-EZ-In-Mini-Split-MC-Metal-Clad-Cable-58340803/205404476) |
| 121 | 12/3 NM-B Copper                     | OK                       | standard; no page loaded                                                                                                                             | — |
| 122 | 8/2 NM-B Copper                      | OK                       | Southwire 8/2 SIMpull; less common than 8/3                                                                                                          | [HD 300502957](https://www.homedepot.com/p/Southwire-500-ft-8-2-Black-Red-Stranded-Romex-SIMpull-CU-NM-B-W-G-Wire-55188801/300502957) |
| 123 | 12/2 submersible pump cable Copper   | OK                       | Southwire 12/2 W/G submersible pump wire                                                                                                             | [HD 205358087](https://www.homedepot.com/p/Southwire-150-ft-12-2-Solid-CU-W-G-Submersible-Well-Pump-Wire-55163504/205358087) |
| 124 | #14 THHN Copper                      | FLAG: misleading         | Same as #12: twin `#14 THHN stranded Copper`                                                                                                         | standard; no page loaded |
| 125 | #8 THHN Copper                       | OK                       | standard; no page loaded                                                                                                                             | — |
| 126 | 12/2 UF-B Copper                     | OK                       | standard; no page loaded                                                                                                                             | — |
| 127 | 2/0 XHHW Aluminum                    | OK (alias)               | Real (XHHW-2 aluminum). The alias "thhn" lifts every aluminum XHHW row into THHN searches                                                            | Aluminum seen only on a third-party listing; no Southwire aluminum page loaded |
| 128 | 4/0 XHHW Aluminum                    | OK (alias)               | Same "thhn" alias                                                                                                                                    | standard; no page loaded |
| 292 | 300W landscape transformer           | OK                       | standard; no page loaded                                                                                                                             | — |
| 293 | Cat6 patch cord, 3 ft                | OK                       | standard; no page loaded                                                                                                                             | — |
| 294 | Cat6 patch panel                     | FLAG: misleading (minor) | Port count (24 or 48, both aliased) roughly doubles the item                                                                                          | standard; no page loaded |
| 295 | Cat6 RJ45 end                        | OK                       | standard; no page loaded                                                                                                                             | — |
| 296 | Coax F connector                     | OK                       | standard; no page loaded                                                                                                                             | — |
| 297 | Coax wall plate                      | OK                       | standard; no page loaded                                                                                                                             | — |
| 298 | 18/3 control wire Copper             | OK                       | standard; no page loaded                                                                                                                             | — |
| 299 | 18/5 control wire Copper             | OK                       | standard; no page loaded                                                                                                                             | — |
| 300 | Doorbell button                      | OK                       | standard; no page loaded                                                                                                                             | — |
| 301 | Doorbell chime, wired                | OK                       | standard; no page loaded                                                                                                                             | — |
| 302 | Horizontal cable manager             | OK                       | standard; no page loaded                                                                                                                             | — |
| 303 | In-ceiling speaker                   | OK                       | generic; no page loaded                                                                                                                              | — |
| 304 | Landscape light fixture              | OK                       | generic; no page loaded                                                                                                                              | — |
| 305 | Landscape lighting cable Copper      | FLAG: misleading         | Sold by gauge (12/2 common; 16/2 and 14/2 too), and gauge sets voltage drop and price. No gauge in the name; the aliases list 12/2 and 14/2            | [HD 12/2](https://www.homedepot.com/p/Southwire-50-ft-12-2-Black-Stranded-CU-Low-Voltage-Landscape-Lighting-Wire-55213442/301982435) · [HD 16/2](https://homedepot.com/p/Cerrowire-500-ft-16-2-Black-Stranded-Low-Voltage-Landscape-Lighting-Wire-241-1202J/202206445) |
| 306 | Network rack, wall mount             | OK                       | standard; no page loaded                                                                                                                             | — |
| 307 | RG6 coax cable Copper                | OK (minor)               | Most RG6 has a copper-clad steel center, so "Copper" overstates it slightly                                                                          | standard; no page loaded |
| 308 | Security camera, dome                | OK                       | generic; no page loaded                                                                                                                              | — |
| 309 | 16/2 speaker wire Copper             | OK                       | standard; no page loaded                                                                                                                             | — |
| 310 | Structured media enclosure           | OK                       | standard; no page loaded                                                                                                                             | — |
| 311 | Video doorbell                       | OK                       | generic; no page loaded                                                                                                                              | — |
| 312 | Video doorbell chime kit             | FLAG: misleading         | Not a standard product name: either the doorbell maker's power kit / chime connector, or a video-compatible wired chime kit (NICOR PrimeChime)        | [HD NICOR 318243912](https://www.homedepot.com/p/NICOR-PrimeChime-Plus-2-Black-Video-Compatible-Wired-Door-Bell-Chime-Kit-PRCP2-BLACK/318243912) |

**Duplicates:** none. Every same-size pair differs in construction (solid
or stranded, SER or SEU, XHHW or USE-2, Cat6 or Cat6 plenum). The trouble
is that the base names do not say which one they are.

**Proposed changes (wire)**

- `#12 THHN Copper`, `#10 THHN Copper`, `#14 THHN Copper` → `#12 THHN solid Copper` (and the same for #10 and #14). Each has a `stranded` twin, and only the alias tells them apart.
- `#12 THHN green Copper` → say solid or stranded, whichever is meant (stranded is the usual ground in pipe).
- `Landscape lighting cable Copper` → `12/2 landscape lighting cable Copper`. Add 16/2 only if wanted, and drop the "14/2" alias unless a row backs it.
- `Video doorbell chime kit` → `Video doorbell power kit` (if the starter means the maker's adapter) or `Video-compatible wired chime kit`.
- `Cat6 patch panel` → `Cat6 patch panel, 24-port`.
- `4/0-4/0-4/0-2/0 SER Aluminum` aliases → drop "4/0-3" and "4/0/3".
- every `XHHW Aluminum` row's aliases → drop "thhn".
- `14/2 fire alarm cable Copper` and `16/2 fire alarm cable Copper` aliases → drop "shielded".
- `14/4 mini-split cable Copper` → optional: add "stranded, non-armored" to set it apart from the MC version.
