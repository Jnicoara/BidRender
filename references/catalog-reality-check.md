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

## Boxes, covers, rings and wall plates (42 items)

Checked 2026-10-09. **Depths skipped** (Track A). Every source here is a
search result (title and model number); no product page or spec sheet was
opened. "No page" rows are OK on trade knowledge only. Every duplicate
claim below was checked against the seed's names and aliases.

| #   | Item                                                   | Verdict                 | Finding                                                                                                                                         | Sources |
| --- | ------------------------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 2   | 4" square box, 1-1/2" deep                             | OK                      | the "1900" box; no page                                                                                                                         | — |
| 6   | Single-gang box                                        | OK                      | no page                                                                                                                                         | — |
| 9   | 1-gang wall plate, decorator, nylon                    | OK                      | Leviton 80401                                                                                                                                   | [Walmart](https://www.walmart.com/ip/Leviton-80401-NW-1-Standard-Size-Thermoplastic-Nylon-Mount-Pack-of-5-White-Gang-Decora-GFCI-Device-Wallplate-5/427599810) |
| 10  | 4" square mud ring                                     | OK                      | Steel City 52C13 family                                                                                                                         | [HD 52C13](https://www.homedepot.com/p/1-Gang-Square-Mud-Ring-52C13-50R/202590473) |
| 11  | 1-gang wall plate, duplex, nylon                       | OK                      | Leviton 80703                                                                                                                                   | [HD 80703](https://homedepot.com/p/Leviton-1-Gang-Red-Duplex-Outlet-Receptacle-Nylon-Standard-Wall-Plate-1-Pack-80703-R-80703-R/301671005) |
| 21  | 4" square blank cover                                  | OK                      | Steel City 52C1                                                                                                                                 | [Walmart 52C1](https://www.walmart.com/ip/Steel-City-52-C-1-Outlet-Box-Cover-4-in-L-x-4-in-W-Steel/39866700) |
| 22  | 1-gang wall plate, toggle, nylon                       | OK                      | Leviton 80701                                                                                                                                   | [HD 80701](https://homedepot.com/p/Leviton-1-Gang-White-Toggle-Nylon-Standard-Wall-Plate-1-Pack-80701-W-80701-W/301647710) |
| 25  | 4" square mud ring, fixture                            | OK                      | Raco 8756                                                                                                                                       | [HD 8756](https://www.homedepot.com/p/RACO-4-in-Square-Fixture-Raised-5-8-in-Mud-Ring-8756/100579922) |
| 48  | Low-voltage mud ring                                   | FLAG: misleading        | Nothing is sold under this name. Its aliases (lv1, old work, open back, bracket) describe a low-voltage mounting bracket (Arlington LV1, Caddy MPLS), which mounts to the wall, not to a 4" square box | [HD Caddy MPLSR2](https://www.homedepot.com/p/CADDY-4-1-4-in-L-x-2-1-2-in-W-Single-Gang-Low-Voltage-Device-Mounting-Bracket-2-Pack-MPLSR2/330785923) |
| 49  | Octagon box, plastic                                   | OK                      | Carlon A615DEL                                                                                                                                  | [HD A615DEL](https://www.homedepot.com/p/Carlon-1-Gang-4-in-20-5-cu-in-Electrical-PVC-New-Work-Octagon-Electrical-Ceiling-Box-with-L-Bracket-A615DEL-A615DEL/100565115) |
| 50  | 4-11/16" square box, 2-1/8" deep                       | OK                      | no page                                                                                                                                         | — |
| 61  | Panel knockout seal                                    | FLAG: misleading        | Sold as a "knockout seal", by trade size (1/2", 3/4"…), for any box, not just panels. No size in the name                                       | [HD Halex 1/2"](https://homedepot.com/p/Halex-1-2-in-Knockout-Seal-3-Piece-75-Pack-60605B/314822864) |
| 62  | 4-11/16" square raised cover, 30A/50A power receptacle | OK                      | Raco 878: one 2.141" opening that takes either 30A or 50A round receptacles                                                                      | [HD Raco 878](https://www.homedepot.com/p/RACO-4-11-16-in-W-Gray-1-Gang-Exposed-Work-Square-Cover-for-Single-2-141-in-Dia-30-50A-Round-Receptacle-1-Pack-878/202056196) |
| 63  | 4" square raised cover, single receptacle              | OK (alias)              | Steel City RS11, 1.406" opening. Alias "1.59" is the locking-device opening, a different cover                                                  | [HD RS11](https://www.homedepot.com/p/1-2-in-Raised-4in-Square-1-13-32-Single-Receptacle-Cover-RS11-10R-RS11-10R/202591756) |
| 65  | Weatherproof in-use cover                              | OK                      | TayMac MM410C                                                                                                                                   | [Walmart](https://www.walmart.com/ip/Taymac-While-In-Use-Weatherproof-Cover-4-In-W-MM410C/37953558) |
| 79  | Ceiling fan brace box                                  | OK                      | retrofit brace with box; no page                                                                                                                | — |
| 80  | Double-gang box                                        | OK                      | no page                                                                                                                                         | — |
| 81  | Handy box                                              | OK (alias)              | Real. Alias "1900" is wrong: in the trade, 1900 is the 4" square box                                                                            | no page |
| 82  | Handy box cover, single toggle                         | OK                      | Raco 865                                                                                                                                        | [HD 865](https://www.homedepot.com/p/4-in-H-x-2-in-W-Steel-Metallic-1-Gang-Handy-Box-Cover-for-Toggle-Switch-1-Pack-865/100095448) |
| 83  | Siding mounting block                                  | OK (ambiguous)          | Sold both with a built-in box (Arlington 8141) and as a bare block that needs a box; they price differently                                     | [HD 8141](https://www.homedepot.com/p/reviews/Arlington-Industries-1-2-in-Lap-Siding-Mounting-Kit-with-Built-In-Box-8141-1/202284580/4) |
| 84  | Single-gang old-work box                               | OK                      | no page                                                                                                                                         | — |
| 85  | 1/2" weatherproof box, single-gang                     | OK                      | Bell 5323-0                                                                                                                                     | [HD 5323-0](https://www.homedepot.com/p/BELL-N3R-Aluminum-Gray-1-Gang-Weatherproof-Outdoor-Electrical-Box-5-Outlets-at-1-2-in-With-2-Closure-Plugs-5323-0/204208013) |
| 86  | 1/2" weatherproof round box                            | OK                      | Bell 5361-0                                                                                                                                     | [HD 5361-0](https://www.homedepot.com/p/BELL-Round-Gray-Weatherproof-Box-with-Five-1-2-in-Threaded-Outlets-5361-0/204208041) |
| 90  | 1-gang wall plate, single receptacle, nylon            | OK                      | Leviton 80704                                                                                                                                   | [HD 80704](https://homedepot.com/p/Leviton-1-Gang-Black-Single-Outlet-Receptacle-Nylon-Standard-Wall-Plate-1-Pack-80704-E-80704-E/301671012) |
| 91  | 2-gang wall plate, duplex/duplex, nylon                | OK                      | Leviton 80716 (part number from memory, not looked up)                                                                                          | no page |
| 169 | Fan-rated ceiling box                                  | FLAG: duplicate         | Its aliases ("brace", "saf-t-brace") make it the same retrofit product as `Ceiling fan brace box`. A fan-rated NEW-work box is a different thing (Carlon BH525H, Raco 0295) | [HD BH525H](https://www.homedepot.com/p/reviews/Carlon-4-in-24-5-cu-in-Hard-Shell-Electrical-PVC-New-Work-Electrical-Ceiling-Box-with-Adjustable-Hanger-Bar-BH525H-BH525H/100124274/1) |
| 170 | Floor box                                              | FLAG: misleading        | Spans a 1-gang nonmetallic adjustable box (Carlon B121BFBRR) to cast multi-gang boxes at ten times the price; no gang count or material         | [HD B121BFBRR](https://www.homedepot.com/p/Carlon-1-Gang-21-cu-in-Adjustable-Floor-Box-Ivory-B121BFBRR-B121BFBRR/202077395) |
| 171 | Floor box cover                                        | FLAG: duplicate         | Aliases (brass, flip lid, duplex outlet plate) make it `Floor box cover, duplex`, which ships too                                               | seed |
| 172 | Octagon box, metal, 1-1/2" deep                        | OK                      | no page                                                                                                                                         | — |
| 173 | 6x6 pull box                                           | OK (alias)              | Real. Aliases "trough", "wireway" name a different product                                                                                      | no page |
| 174 | 12x12 pull box                                         | OK (alias)              | Same "trough"/"wireway" aliases                                                                                                                 | no page |
| 175 | Shallow round box, 1/2" deep                           | OK                      | pancake box, Steel City 56111                                                                                                                   | [HD 56111](https://www.homedepot.com/p/4-in-6-cu-in-Metal-Round-Pancake-Box-56111-30R-56111-30R/202601207) |
| 176 | 4" square mud ring, 2-gang                             | OK                      | Steel City 52C17                                                                                                                                | [HD 52C17](https://homedepot.com/p/2-Gang-Square-Mud-Ring-Silver-52C17-25R/202590477) |
| 177 | 4-11/16" square mud ring, 2-gang                       | OK                      | Raco 841                                                                                                                                        | [HD 841](https://www.homedepot.com/p/RACO-4-11-16-in-Square-2-Device-Mud-Ring-Raised-1-2-in-841/100131916) |
| 178 | Triple-gang box                                        | OK                      | no page                                                                                                                                         | — |
| 179 | 1/2" weatherproof box, double-gang                     | OK                      | Bell/Red Dot; no page for the exact part                                                                                                        | — |
| 207 | 1-gang blank plate                                     | FLAG: duplicate         | Same product as `1-gang wall plate, blank, nylon`; its alias "midway" also collides with `…, blank, nylon, midway`. The 2-, 3- and 4-gang blank plates repeat the pattern | [HD Leviton 0PJ13](https://homedepot.com/p/questions/Leviton-1-Gang-White-Blank-Plate-Nylon-Midway-Midsize-Wall-Plate-1-Pack-0PJ13-00W-R52-0PJ13-00W/100356907/0) |
| 208 | 2-gang wall plate, toggle/toggle, nylon                | OK                      | Leviton 80709                                                                                                                                   | [HD 80709](https://homedepot.com/p/Leviton-2-Gang-White-Toggle-Nylon-Standard-Wall-Plate-1-Pack-80709-W-80709-W/301647720) |
| 209 | 3-gang wall plate, toggle/toggle/toggle, nylon         | OK                      | Leviton 80711 (part number from memory)                                                                                                         | no page |
| 210 | Panel filler plate                                     | FLAG: misleading        | Filler plates fit one panel family: QOFP (QO) vs HOMFP (Homeline), and Schneider says only HOMFP may be used in Homeline. Generic cannot be bought right. Also filed under Wall Plates | [SE FAQ](https://www.se.com/ca/en/faqs/FA111735) · [HD HOMFPCP](https://www.homedepot.com/p/Square-D-HomeLine-Filler-Plates-3-Pack-HOMFPCP/202353318) |
| 211 | Weatherproof in-use cover, 2-gang                      | OK                      | Intermatic WP6200                                                                                                                               | [HD WP6200](https://homedepot.com/p/Intermatic-WP6200-Plastic-Gray-Double-Gang-Low-Profile-In-Use-Weatherproof-Cover-16-Configurations-WP6200G/308594373) |
| 212 | Weatherproof in-use cover, 30A/50A power receptacle    | OK (weak)               | Exists but not commonly stocked. Closest: Commercial Electric 12321 (20/50A round). In-use covers often will not close over a 50A cord cap        | [HD 12321](https://www.homedepot.com/p/Commercial-Electric-2-Gang-Metal-Weatherproof-Electrical-Outlet-Cover-for-20-Amp-50-Amp-Gray-12321/326780604) · [Mike Holt](https://forums.mikeholt.com/threads/50-amp-weatherproof-in-use-cover.139960/) |

**Proposed changes (boxes)**

- `Low-voltage mud ring` (and `…, 2-gang`) → `Low-voltage mounting bracket, 1-gang` (and 2-gang), keeping the aliases. Nothing is sold as a "low-voltage mud ring".
- `Panel knockout seal` → `1/2" knockout seal` (add 3/4" if wanted). Sold by size, and fits any box.
- `Panel filler plate` → a panel-family item with brand variants (QOFP, HOMFP…), under Panels. Same reason brand matters on breakers.
- `Fan-rated ceiling box` → define it as the new-work fan box (hanger bar or nail-on) and drop the "brace" aliases; today it duplicates `Ceiling fan brace box`.
- `Floor box cover` → retire into `Floor box cover, duplex`.
- `1-gang blank plate` (and 2-, 3-, 4-gang) → retire into `N-gang wall plate, blank, nylon`; drop "midway" from its aliases.
- `Floor box` → `Floor box, 1-gang, adjustable, nonmetallic` (or whatever the starter means).
- `Handy box` aliases → drop "1900".
- `6x6 pull box`, `12x12 pull box` aliases → drop "trough" and "wireway".
- `4" square raised cover, single receptacle` aliases → drop "1.59".
- `Siding mounting block` → optional: `Siding mounting block with box`, if that is what the starter means.

## Conduit, fittings, surface raceway, strut and supports, fasteners (55 items)

Checked 2026-10-09. Home Depot product pages returned 403, so its evidence
here is search-result titles and model numbers. No manufacturer catalog
loaded. "No page" rows are OK on trade knowledge only.

| #       | Item                                                   | Verdict                       | Finding                                                                                                                                       | Sources |
| ------- | ------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 28      | Ceiling support wire                                   | FLAG: misleading (unit)       | 12 ga hanger wire is real, but sold in 100 ft rolls or precut 6 ft packs; "each" with no length cannot be counted or priced                     | [HD 100 ft](https://www.homedepot.com/p/SUSPEND-IT-12-Gauge-100-ft-Hanger-Wire-for-Drop-Suspended-Ceiling-Grids-8850/100670613) · [HD 72 in](https://www.homedepot.com/p/Everbilt-12-Gauge-72-in-Hanger-Wire-10-Pack-CWHAWI72SILPK10/335761834) |
| 29      | Concrete wedge anchor                                  | FLAG: misleading (no size)    | Sold by diameter × length (3/8" × 2-1/4", × 3"…); 3/8" is the one that pairs with 3/8" rod                                                    | [HD Red Head 50082](https://homedepot.com/p/Red-Head-3-8-in-x-3-in-Steel-Hex-Nut-Head-Concrete-Wedge-Anchor-50082/308495430) |
| 31      | 3/4" liquidtight flexible conduit                      | OK                            | Southwire Titan line                                                                                                                          | [HD 1/2" same line](https://www.homedepot.com/p/questions/Southwire-1-2-in-x-100-ft-Liquidtight-Flexible-Metallic-Titan-Steel-Conduit-55082603/202819638/0) |
| 32      | 3/4" liquidtight flexible conduit connector            | OK                            | no page                                                                                                                                       | — |
| 42      | Independent support wire clip                          | OK (overlap)                  | Real: Caddy IDS "T-grid independent support clip". It is itself a grid clip, so it overlaps #43                                              | [Mike Holt](https://forums.mikeholt.com/threads/caddy-j-hook-t-bar-supports.138367/) |
| 43      | T-bar grid clip                                        | FLAG: misleading              | Caddy makes many T-grid clips (IDS, 515 fixture clip, J-hook grid clips); as named it may be #42 or something else                             | search titles only |
| 58      | 1/2" liquidtight flexible conduit                      | OK                            | Southwire 55082603                                                                                                                            | [HD](https://www.homedepot.com/p/questions/Southwire-1-2-in-x-100-ft-Liquidtight-Flexible-Metallic-Titan-Steel-Conduit-55082603/202819638/0) |
| 59      | 1/2" EMT raintight connector                           | OK                            | raintight compression fittings                                                                                                                | [Mike Holt](https://forums.mikeholt.com/threads/raintight-fittings.18383/post-18383) |
| 60      | 1/2" liquidtight flexible conduit connector            | OK                            | no page                                                                                                                                       | — |
| 72      | Beam clamp                                             | FLAG: misleading (no size)    | Sold by rod size (3/8", 1/2") and type                                                                                                         | [HD Caddy 3/8"](https://homedepot.com/p/CADDY-Universal-Beam-Clamp-Electrogalvanized-3-8-in-Rod-3-4-in-Max-Flange-100-Pack-3000037EG/331141659) |
| 76      | 2" PVC Sch 40                                          | OK                            | no page                                                                                                                                       | — |
| 77      | 1/2" flexible metal conduit                            | OK                            | standard RW/RWS                                                                                                                               | eBay listing |
| 78      | 1/2" flexible metal conduit connector                  | OK                            | no page                                                                                                                                       | — |
| 108     | 3/8" all-thread rod, 10 ft                             | OK                            | 10 ft is the supply-house stick; retail snippets showed 3 and 6 ft for 3/8"                                                                   | [HD 5/8" × 10 ft](https://www.homedepot.com/p/Everbilt-5-8-in-x-10-ft-Zinc-Plated-Steel-Coarse-Threaded-Rod-03137/332734306) |
| 109     | Trapeze hanger kit                                     | FLAG: does not exist          | No stocked "kit" found. A trapeze is built on site from strut, two rods, nuts, washers and clamps or anchors                                   | none found (only patents) |
| 129–130 | 1/2" EMT, 3/4" EMT                                     | OK                            | no page                                                                                                                                       | — |
| 131–138 | PVC Sch 40, 1/2" to 4" (8 sizes)                       | OK                            | all standard trade sizes; no page                                                                                                             | — |
| 139–147 | PVC Sch 80, 1/2" to 4" (9 sizes)                       | OK                            | Cantex Sch 80 seen at 1/2", 3/4", 4"; 1-1/4", 2", 2-1/2", 3" at HD. 1" and 1-1/2" not seen but standard                                         | [HD A53AE12H](https://www.homedepot.com/p/Cantex-1-2-in-x-10-ft-Gray-Non-Metallic-PVC-Schedule-80-Conduit-A53AE12H/202352529) · [HD 2-1/2"](https://homedepot.com/p/2-1-2-in-x-10-ft-PVC-Schedule-80-Conduit-67553/100158945) |
| 148     | 2" rigid conduit                                       | OK                            | Wheatland 2" × 10 ft RMC                                                                                                                      | [HD](https://homedepot.com/p/Wheatland-Tube-2-in-x-10-ft-Rigid-Metal-Conduit-0544310000/202068054) |
| 149     | 1-1/4" flexible metal conduit                          | OK                            | Southwire RW 1-1/4"                                                                                                                           | eBay listing |
| 150     | 3/4" EMT raintight connector                           | OK                            | as #59                                                                                                                                        | — |
| 151     | 2" PVC Sch 40 90-degree elbow                          | OK                            | no page                                                                                                                                       | — |
| 152–153 | 1" and 2" PVC Sch 40 connector                         | OK (term)                     | Trade name is "terminal adapter" / "male adapter"; both are in the aliases                                                                    | — |
| 154     | 2" rigid conduit coupling                              | OK                            | no page                                                                                                                                       | — |
| 155     | 1-1/4" flexible metal conduit connector                | OK                            | Halex 04212 / 04412                                                                                                                           | [HD 04212](https://www.homedepot.com/p/Halex-1-1-4-in-Flexible-Metal-Conduit-FMC-Squeeze-Connector-04212/100148738) |
| 156–158 | 1/2", 3/4", 2" conduit locknut                         | OK                            | no page                                                                                                                                       | — |
| 159     | 2" insulating bushing                                  | OK                            | no page                                                                                                                                       | — |
| 160     | 2" mast roof flashing                                  | OK                            | Halex 60820, "2 in. SE roof flashing"                                                                                                         | [HD 60820](https://homedepot.com/p/Halex-2-in-Service-Entrance-SE-Roof-Flashing-60820/100209801) |
| 161     | 2" metal weatherhead                                   | OK                            | no page                                                                                                                                       | — |
| 162     | 2" riser strap                                         | OK                            | no page                                                                                                                                       | — |
| 163     | Roof flashing boot                                     | FLAG: misleading              | No size. Its aliases (rtu, rooftop, pipe seal) say a rooftop pipe boot, a real split boot exists (Gibraltar 81746); worth a size so it does not compete with #160 | [HD 81746](https://www.homedepot.com/p/Gibraltar-Building-Products-11-in-x-13-75-in-Rubber-Electrical-Mast-Split-Pipe-Boot-Roof-Flashing-in-Black-81746/305534037) |
| 164     | Raceway entrance end fitting                           | FLAG: duplicate + misleading  | No series, while `Surface raceway entrance end fitting, 500 series` / `…, 700 series` ship too; entrance ends are series-specific              | seed; [HD OFR10A](https://www.homedepot.com/p/Legrand-Wiremold-OFR-Series-Over-Floor-Raceway-Entrance-End-Fitting-Kit-OFR10A/204789243) |
| 165     | Surface raceway device box, 700 series                 | FLAG: duplicate               | Wiremold sells these boxes as "500 and 700 Series" (V5747, V5748): the same box as `…, 500 series`, and likely `Raceway device box, 1-gang`     | [HD V5747](https://www.homedepot.com/p/Legrand-Wiremold-500-and-700-Series-1-3-8-in-Shallow-Switch-and-Receptacle-Box-V5747/202065081) · [HD V5748](https://www.homedepot.com/p/Legrand-500-and-700-Series-Electrical-Switch-Receptacle-Box-V5748/202518488) |
| 166     | Surface raceway device plate, 700 series               | FLAG: misleading / duplicate  | The 500/700 boxes take standard NEMA plates (stated for the 2-gang box; 1-gang unverified), so a "700 series plate" is not a separate product | search title only |
| 167     | Surface raceway, 500 series                            | OK                            | Wiremold V500                                                                                                                                 | HD collection (title via search) |
| 168     | Surface raceway, 700 series                            | OK                            | Wiremold V700                                                                                                                                 | [HD BW16](https://homedepot.com/p/Legrand-Wiremold-700-Series-Metal-Surface-Raceway-T-Fitting-White-BW16/100203434) |
| 315     | 1/2" all-thread rod, 10 ft                             | OK                            | no page                                                                                                                                       | — |
| 316     | 3/8" flat washer                                       | OK                            | no page                                                                                                                                       | — |
| 317     | Grid box bracket                                       | FLAG: misleading (term)       | The product is a T-bar box hanger (Caddy 512 / 512A); "grid box bracket" is not what it is called                                             | [Mike Holt](https://forums.mikeholt.com/goto/post?id=1654767) |
| 318     | 3/8" hex nut                                           | OK                            | no page                                                                                                                                       | — |
| 319     | Temporary pole, 6x6 post                               | OK (note)                     | Posts are sold by length (10, 12, 16 ft); no length in the name                                                                               | no page |
| 320     | J-hook                                                 | FLAG: misleading (no size)    | Caddy CAT J-hooks run 3/4" to 4" bundle size, with flange, rod or wire mounts                                                                  | Platinum Tools data sheet (search) |

**Proposed changes (raceway and supports)**

- `Ceiling support wire` → `12 ga ceiling hanger wire`, sold by the foot (or a stated precut length).
- `Concrete wedge anchor` → `3/8" x 3" concrete wedge anchor` (add 1/2" if wanted).
- `Beam clamp` → `Beam clamp, 3/8" rod` (add 1/2").
- `T-bar grid clip` → rename to what the starter means (e.g. `T-grid fixture clip`), or retire.
- `Independent support wire clip` → `T-grid independent support clip` (the Caddy IDS name).
- `Grid box bracket` → `T-bar box hanger`, keeping the old name as an alias.
- `Trapeze hanger kit` → retire as a material and make it a starter assembly (strut, 2 rods, nuts, washers, 2 clamps or anchors). One "each" price for it would be invented.
- `Roof flashing boot` → `Pipe roof flashing boot, adjustable split`, so it does not compete with `2" mast roof flashing`.
- `Raceway entrance end fitting` → retire into the 500- and 700-series entrance end fittings.
- `Surface raceway device box, 700 series` and `…, 500 series` → one `Surface raceway device box, 500/700 series, 1-gang`.
- `Surface raceway device plate, 700 series` and `…, 500 series` → one plate row, or none if a standard wall plate fits (verify the 1-gang box first).
- `J-hook` → `J-hook, 2"` (add 1" and 4" if wanted).
- `Temporary pole, 6x6 post` → add the length meant.
- The generic `Raceway coupling`, `Raceway flat elbow`, `Raceway inside elbow`, `Raceway outside elbow`, `Raceway tee fitting`, `Raceway end cap`, `Raceway mounting strap`, `Raceway device box, 1-gang`… (unused, not checked one by one) → review against the 500/700-series rows; they look like the same parts without a series.
