# Catalog review check — 2026-10-08

The owner's catalog review, as checked read-only against the starter seed
(`C:\dev\catalog-review\decisions-check.txt`, copied verbatim below so the
decisions live in the repo). What was applied, and the calls made on the
NOT SURE items, is recorded at the end of this file once built.

```text
CATALOG DECISIONS CHECK - starter seed vs owner decisions
Source: server/seed/materials (1,824 rows), server/seed/baselineAssemblies.ts + starterAssemblies.ts (183 starters), starterParts.ts (334 keys), baselineRunTypes.ts (15 run types). local-dev @ 1e7f544 plus uncommitted working tree, read 2026-10-08. Read-only: nothing in the repo was changed.
Searched names AND search words/descriptions. Starters are cited by ref (e.g. RS2) and key.

ADD  (23 decisions: 12 truly missing, 2 partly there, 7 already exist, 2 not sure. About 38 new rows if every missing one is added)
======================================================================
Searched names AND search words/descriptions. "Exists" gives the exact current name.

TRULY MISSING
1.  #6 bare solid copper - MISSING. Only "#6 bare stranded Copper" exists (used by PG11, PG20, GR5). Suggest "#6 bare solid Copper".
2.  6/2 NM-B - MISSING. Have 14/2, 12/2, 10/2, 8/2, 6/3 NM-B and "6/2 MC cable Copper". Suggest "6/2 NM-B Copper".
3.  12/3 UF-B - MISSING. UF-B today is 14/2, 12/2, 10/2, 8/2 only. Suggest "12/3 UF-B Copper".
4.  10/3 UF-B - MISSING. Suggest "10/3 UF-B Copper".
5.  PVC Sch 40 expansion couplings 1/2"-2" - PARTLY: only '1/2" PVC expansion fitting' exists. Missing 3/4", 1", 1-1/4", 1-1/2", 2" (5 rows). Name them like the existing row ('3/4" PVC expansion fitting'), or rename all six to "expansion coupling" (your call, see NOT SURE).
6.  PVC female adapters 1/2"-2" - PARTLY: only '1/2" PVC female adapter' exists. Missing 3/4", 1", 1-1/4", 1-1/2", 2" (5 rows).
7.  2-hole EMT straps 1/2"-1" - MISSING. Only one-hole straps per size, plus the generic "EMT strap" (being removed) that carries "two-hole" as a search word. Suggest '1/2" EMT two-hole strap', '3/4" ...', '1" ...' (3 rows).
8.  Liquidtight 90 connectors 3/4" and 1" - MISSING. Only '1/2" liquidtight 90-degree connector' exists. Suggest '3/4" liquidtight 90-degree connector', '1" liquidtight 90-degree connector'.
9.  LFNC (Carflex) 1/2" and 3/4" + straight and 90 connectors - MISSING (6 rows). Note: the LIQUIDTIGHT METAL rows (LFMC) carry "carflex" as a search word, which is wrong (Carflex is the nonmetallic LFNC). Searching "carflex" today returns the metal product. Drop that word when LFNC is added.
10. Spec-grade 20A duplex - MISSING as its own item. "20A duplex receptacle" exists (no grade). The 20A SWITCHES carry "commercial spec grade"; no receptacle does.
11. 2-gang box extender - MISSING. Only "Single-gang box extender" exists.
12. Phase-color tape (red, blue, white, green, black, brown, orange, yellow, gray) - MISSING (9 rows). Only "Electrical tape" exists, with "colored phase" in its search words.

PARTLY THERE
13. Old-work box clips (F-clips / Madison straps) - Madison strap EXISTS as "Device wing bracket" (search words: madison bar strap). F-clips (box support clips, Caddy-style) MISSING. Suggest renaming "Device wing bracket" to "Madison strap (old-work box support)" and adding "Old-work box F-clip".
14. LV1/LV2 low-voltage brackets - LV1 EXISTS as "Low-voltage mud ring" (single-gang implied; used by MH14, MS6, MS7, MS8). LV2 (2-gang) MISSING. Suggest "Low-voltage mud ring, 1-gang (LV1)" + new "Low-voltage mud ring, 2-gang (LV2)". The rename touches 4 starters' part name only (key stays).

ALREADY EXIST
15. Tamper-resistant duplex 15A and 20A - EXIST: "Duplex receptacle" (15A, used by DV1, DV3, DV6, RS5, MS12) and "20A duplex receptacle". Both carry "tamper resistant tr" in search words only; the NAME does not say TR. If shipped devices are meant to be TR, say so in the name.
16. TR+WR GFCI 15A and 20A - EXIST: "GFCI receptacle, weather-resistant" (15A; DV8, LT17, PG20) and "20A GFCI receptacle, weather-resistant" (MH6). Both carry "wr tr" in search words.
17. USB receptacle - EXISTS: "USB combo receptacle" (DV10).
18. 4" square-to-round mud ring - EXISTS: '4" square mud ring, fixture' (round opening; used by DV30, LT24, LT27, LT28, CS13, GC4).
19. Fan-rated ceiling box and fan brace - EXIST: "Fan-rated ceiling box" (LT2) and "Ceiling fan brace box" (LT3, LT11).
20. Pull boxes 6x6, 8x8, 12x12 - EXIST, three kinds each: "6x6 pull box" / "6x6 pull box, NEMA 3R" / "6x6 PVC pull box", same for 8x8 and 12x12 (also 4x4, 16x16, 24x24).
21. SER 2-2-2-4, 4-4-4-6, 2/0-2/0-2/0-1 - EXIST: "2-2-2-4 SER Copper", "2-2-2-4 SER Aluminum", "4-4-4-6 SER Copper", "4-4-4-6 SER Aluminum", "2/0-2/0-2/0-1 SER Aluminum" (no copper 2/0, which is normal - it is sold as aluminum).

NOT SURE (details under NOT SURE)
22. Gas pipe bonding clamp - "Water pipe bonding clamp" carries "cold gas" in search words, so a gas search finds it. No separate CSST/gas-line clamp. Not sure whether you want a distinct item.
23. Snap-in NM connectors 1/2" and 3/4" - '1/2" cable connector' and '3/4" cable connector' exist; their search words say BOTH "snap in" and "two screw", so one row stands for both styles. Not sure whether you want them split.

REMOVE  (131 rows across 5 decisions; 2 of them used by a starter or run type)
======================================================================

1. #14, #12, #10 bare copper (solid and stranded): 4 row(s)
  - #14 bare solid Copper  [Wire & Cable]
  - #12 bare solid Copper  [Wire & Cable]  <<< USED BY 3 run type(s): "1/2" EMT, 2 #12 + ground"; "3/4" EMT, 3 #12 + ground"; "700 series surface raceway, 2 #12 + ground"
  - #10 bare solid Copper  [Wire & Cable]
  - #10 bare stranded Copper  [Wire & Cable]
  Note: Only 4 rows exist: there is no "#14 bare stranded" or "#12 bare stranded". #12 bare solid is the GROUND in 3 shipped run types, so removing it leaves those types with no ground wire (they match by exact name, no rename map). Owner call: point them at #10/#8 bare, or keep #12 bare solid.

2. Generic "EMT strap": 1 row(s)
  - EMT strap  [Conduit Fittings]
  Note: Its search words include "two-hole 2-hole", which is the only way a 2-hole EMT strap is found today (see ADD 7).

3. Generic items that duplicate their own sized versions (clear cases, none used): 3 row(s)
  - Wall pack  [Lighting Hardware]
  - Bath exhaust fan  [Equipment & Appliances]
  - EV charger  [Equipment & Appliances]
  Note: Siblings: Wall pack, mini / large / full cutoff; Bath exhaust fan, 50/80/110/150 CFM (+ light combo, heater combo); 32A/40A/48A EV charger. Possible others are under NOT SURE (generic surface raceway fittings, "Wall plate").

4. ALL 3-1/2" conduit and fittings: 33 row(s)
  - 3-1/2" EMT  [Conduit]
  - 3-1/2" EMT 90-degree elbow  [Conduit Fittings]
  - 3-1/2" EMT 45-degree elbow  [Conduit Fittings]
  - 3-1/2" EMT LB conduit body  [Conduit Fittings]
  - 3-1/2" EMT T conduit body  [Conduit Fittings]
  - 3-1/2" EMT LL conduit body  [Conduit Fittings]
  - 3-1/2" EMT LR conduit body  [Conduit Fittings]
  - 3-1/2" EMT C conduit body  [Conduit Fittings]
  - 3-1/2" EMT set-screw connector  [Conduit Fittings]
  - 3-1/2" EMT set-screw coupling  [Conduit Fittings]
  - 3-1/2" EMT compression connector  [Conduit Fittings]
  - 3-1/2" EMT compression coupling  [Conduit Fittings]
  - 3-1/2" EMT raintight connector  [Conduit Fittings]
  - 3-1/2" EMT raintight coupling  [Conduit Fittings]
  - 3-1/2" PVC Sch 40  [Conduit]  <<< USED BY 1 run type(s): "3-1/2" PVC Sch 40, underground"
  - 3-1/2" PVC Sch 40 connector  [Conduit Fittings]
  - 3-1/2" PVC Sch 40 coupling  [Conduit Fittings]
  - 3-1/2" PVC Sch 40 90-degree elbow  [Conduit Fittings]
  - 3-1/2" PVC Sch 40 45-degree elbow  [Conduit Fittings]
  - 3-1/2" PVC Sch 40 LB conduit body  [Conduit Fittings]
  - 3-1/2" PVC Sch 40 T conduit body  [Conduit Fittings]
  - 3-1/2" PVC Sch 40 LL conduit body  [Conduit Fittings]
  - 3-1/2" PVC Sch 40 LR conduit body  [Conduit Fittings]
  - 3-1/2" PVC Sch 40 C conduit body  [Conduit Fittings]
  - 3-1/2" PVC Sch 40 90-degree sweep, 24" radius  [Conduit Fittings]
  - 3-1/2" PVC Sch 40 90-degree sweep, 36" radius  [Conduit Fittings]
  - 3-1/2" PVC Sch 40 45-degree sweep, 24" radius  [Conduit Fittings]
  - 3-1/2" PVC Sch 40 45-degree sweep, 36" radius  [Conduit Fittings]
  - 3-1/2" EMT one-hole strap  [Conduit Fittings]
  - 3-1/2" PVC one-hole strap  [Conduit Fittings]
  - 3-1/2" conduit bushing  [Conduit Fittings]
  - 3-1/2" conduit locknut  [Conduit Fittings]
  - 3-1/2" strut conduit strap  [Strut & Supports]
  Note: There are no 3-1/2" rigid, IMC, Sch 80 or flex rows, so this is EMT + PVC Sch 40 + shared fittings. "3-1/2" strut conduit strap" is a strut part, not a conduit fitting: included here because it only fits 3-1/2" conduit, confirm. "3-1/2" PVC Sch 40" is the raceway of the shipped run type "3-1/2" PVC Sch 40, underground" (one of the ten underground types added in 3ef66d8), so that run type goes too or it seeds with no pipe.

5. ALL IMC conduit and fittings: 90 row(s)
  - 1/2" IMC  [Conduit]
  - 3/4" IMC  [Conduit]
  - 1" IMC  [Conduit]
  - 1-1/4" IMC  [Conduit]
  - 1-1/2" IMC  [Conduit]
  - 2" IMC  [Conduit]
  - 2-1/2" IMC  [Conduit]
  - 3" IMC  [Conduit]
  - 4" IMC  [Conduit]
  - 1/2" IMC connector  [Conduit Fittings]
  - 1/2" IMC coupling  [Conduit Fittings]
  - 1/2" IMC 90-degree elbow  [Conduit Fittings]
  - 1/2" IMC 45-degree elbow  [Conduit Fittings]
  - 1/2" IMC LB conduit body  [Conduit Fittings]
  - 1/2" IMC T conduit body  [Conduit Fittings]
  - 1/2" IMC LL conduit body  [Conduit Fittings]
  - 1/2" IMC LR conduit body  [Conduit Fittings]
  - 1/2" IMC C conduit body  [Conduit Fittings]
  - 3/4" IMC connector  [Conduit Fittings]
  - 3/4" IMC coupling  [Conduit Fittings]
  - 3/4" IMC 90-degree elbow  [Conduit Fittings]
  - 3/4" IMC 45-degree elbow  [Conduit Fittings]
  - 3/4" IMC LB conduit body  [Conduit Fittings]
  - 3/4" IMC T conduit body  [Conduit Fittings]
  - 3/4" IMC LL conduit body  [Conduit Fittings]
  - 3/4" IMC LR conduit body  [Conduit Fittings]
  - 3/4" IMC C conduit body  [Conduit Fittings]
  - 1" IMC connector  [Conduit Fittings]
  - 1" IMC coupling  [Conduit Fittings]
  - 1" IMC 90-degree elbow  [Conduit Fittings]
  - 1" IMC 45-degree elbow  [Conduit Fittings]
  - 1" IMC LB conduit body  [Conduit Fittings]
  - 1" IMC T conduit body  [Conduit Fittings]
  - 1" IMC LL conduit body  [Conduit Fittings]
  - 1" IMC LR conduit body  [Conduit Fittings]
  - 1" IMC C conduit body  [Conduit Fittings]
  - 1-1/4" IMC connector  [Conduit Fittings]
  - 1-1/4" IMC coupling  [Conduit Fittings]
  - 1-1/4" IMC 90-degree elbow  [Conduit Fittings]
  - 1-1/4" IMC 45-degree elbow  [Conduit Fittings]
  - 1-1/4" IMC LB conduit body  [Conduit Fittings]
  - 1-1/4" IMC T conduit body  [Conduit Fittings]
  - 1-1/4" IMC LL conduit body  [Conduit Fittings]
  - 1-1/4" IMC LR conduit body  [Conduit Fittings]
  - 1-1/4" IMC C conduit body  [Conduit Fittings]
  - 1-1/2" IMC connector  [Conduit Fittings]
  - 1-1/2" IMC coupling  [Conduit Fittings]
  - 1-1/2" IMC 90-degree elbow  [Conduit Fittings]
  - 1-1/2" IMC 45-degree elbow  [Conduit Fittings]
  - 1-1/2" IMC LB conduit body  [Conduit Fittings]
  - 1-1/2" IMC T conduit body  [Conduit Fittings]
  - 1-1/2" IMC LL conduit body  [Conduit Fittings]
  - 1-1/2" IMC LR conduit body  [Conduit Fittings]
  - 1-1/2" IMC C conduit body  [Conduit Fittings]
  - 2" IMC connector  [Conduit Fittings]
  - 2" IMC coupling  [Conduit Fittings]
  - 2" IMC 90-degree elbow  [Conduit Fittings]
  - 2" IMC 45-degree elbow  [Conduit Fittings]
  - 2" IMC LB conduit body  [Conduit Fittings]
  - 2" IMC T conduit body  [Conduit Fittings]
  - 2" IMC LL conduit body  [Conduit Fittings]
  - 2" IMC LR conduit body  [Conduit Fittings]
  - 2" IMC C conduit body  [Conduit Fittings]
  - 2-1/2" IMC connector  [Conduit Fittings]
  - 2-1/2" IMC coupling  [Conduit Fittings]
  - 2-1/2" IMC 90-degree elbow  [Conduit Fittings]
  - 2-1/2" IMC 45-degree elbow  [Conduit Fittings]
  - 2-1/2" IMC LB conduit body  [Conduit Fittings]
  - 2-1/2" IMC T conduit body  [Conduit Fittings]
  - 2-1/2" IMC LL conduit body  [Conduit Fittings]
  - 2-1/2" IMC LR conduit body  [Conduit Fittings]
  - 2-1/2" IMC C conduit body  [Conduit Fittings]
  - 3" IMC connector  [Conduit Fittings]
  - 3" IMC coupling  [Conduit Fittings]
  - 3" IMC 90-degree elbow  [Conduit Fittings]
  - 3" IMC 45-degree elbow  [Conduit Fittings]
  - 3" IMC LB conduit body  [Conduit Fittings]
  - 3" IMC T conduit body  [Conduit Fittings]
  - 3" IMC LL conduit body  [Conduit Fittings]
  - 3" IMC LR conduit body  [Conduit Fittings]
  - 3" IMC C conduit body  [Conduit Fittings]
  - 4" IMC connector  [Conduit Fittings]
  - 4" IMC coupling  [Conduit Fittings]
  - 4" IMC 90-degree elbow  [Conduit Fittings]
  - 4" IMC 45-degree elbow  [Conduit Fittings]
  - 4" IMC LB conduit body  [Conduit Fittings]
  - 4" IMC T conduit body  [Conduit Fittings]
  - 4" IMC LL conduit body  [Conduit Fittings]
  - 4" IMC LR conduit body  [Conduit Fittings]
  - 4" IMC C conduit body  [Conduit Fittings]
  Note: 9 sizes x 10 items (conduit, 90, 45, LB, T, LL, LR, C body, connector, coupling). None used by a starter or run type. Note: the 10 sizes of "rigid one-hole strap" carry "imc" as a search word; they are shared rigid/IMC straps and stay, but the "imc" word could be dropped with IMC gone.

SPECIALTY  (108 rows across 25 groups)
======================================================================

- 1/0 and 2/0 bare copper: 2
  - 1/0 bare stranded Copper  [Wire & Cable]
  - 2/0 bare stranded Copper  [Wire & Cable]

- Large Sch 80 sweeps (taken as 2-1/2" to 4"; 1"-2" Sch 80 sweeps not included): 12
  - 2-1/2" PVC Sch 80 90-degree sweep, 24" radius  [Conduit Fittings]
  - 2-1/2" PVC Sch 80 90-degree sweep, 36" radius  [Conduit Fittings]
  - 2-1/2" PVC Sch 80 45-degree sweep, 24" radius  [Conduit Fittings]
  - 2-1/2" PVC Sch 80 45-degree sweep, 36" radius  [Conduit Fittings]
  - 3" PVC Sch 80 90-degree sweep, 24" radius  [Conduit Fittings]
  - 3" PVC Sch 80 90-degree sweep, 36" radius  [Conduit Fittings]
  - 3" PVC Sch 80 45-degree sweep, 24" radius  [Conduit Fittings]
  - 3" PVC Sch 80 45-degree sweep, 36" radius  [Conduit Fittings]
  - 4" PVC Sch 80 90-degree sweep, 24" radius  [Conduit Fittings]
  - 4" PVC Sch 80 90-degree sweep, 36" radius  [Conduit Fittings]
  - 4" PVC Sch 80 45-degree sweep, 24" radius  [Conduit Fittings]
  - 4" PVC Sch 80 45-degree sweep, 36" radius  [Conduit Fittings]

- 2-1/2" to 4" rigid conduit bodies: 15
  - 2-1/2" rigid conduit LB conduit body  [Conduit Fittings]
  - 2-1/2" rigid conduit T conduit body  [Conduit Fittings]
  - 2-1/2" rigid conduit LL conduit body  [Conduit Fittings]
  - 2-1/2" rigid conduit LR conduit body  [Conduit Fittings]
  - 2-1/2" rigid conduit C conduit body  [Conduit Fittings]
  - 3" rigid conduit LB conduit body  [Conduit Fittings]
  - 3" rigid conduit T conduit body  [Conduit Fittings]
  - 3" rigid conduit LL conduit body  [Conduit Fittings]
  - 3" rigid conduit LR conduit body  [Conduit Fittings]
  - 3" rigid conduit C conduit body  [Conduit Fittings]
  - 4" rigid conduit LB conduit body  [Conduit Fittings]
  - 4" rigid conduit T conduit body  [Conduit Fittings]
  - 4" rigid conduit LL conduit body  [Conduit Fittings]
  - 4" rigid conduit LR conduit body  [Conduit Fittings]
  - 4" rigid conduit C conduit body  [Conduit Fittings]

- Busway: 2
  - Busway  [Distribution Equipment]
  - Busway elbow  [Distribution Equipment]

- Cable tray: 4
  - Cable tray  [Distribution Equipment]
  - Cable tray elbow  [Distribution Equipment]
  - Cable tray tee  [Distribution Equipment]
  - Cable tray support bracket  [Distribution Equipment]

- Under-carpet cable: 1
  - Under-carpet flat cable  [Distribution Equipment]

- Power poles: 3
  - Tele-power pole, 10 ft  [Distribution Equipment]  <<< USED BY 1 starter(s), key "tele-power-pole-10-ft": CS9 "Tele-power pole"
  - Tele-power pole, 15 ft  [Distribution Equipment]
  - Power pole fitting kit  [Distribution Equipment]  <<< USED BY 1 starter(s), key "power-pole-fitting-kit": CS9 "Tele-power pole"

- Furniture whips: 2
  - Modular furniture whip, 6 ft  [Distribution Equipment]  <<< USED BY 1 starter(s), key "modular-furniture-whip-6-ft": CS10 "Modular furniture feed"
  - Modular furniture whip, 10 ft  [Distribution Equipment]

- Fire alarm panels/modules: 4
  - Fire alarm control panel  [Life Safety]
  - Addressable module  [Life Safety]
  - Fire alarm relay module  [Life Safety]
  - Fire alarm remote annunciator  [Life Safety]

- RG11: 1
  - RG11 coax cable Copper  [Low Voltage]

- Fiber: 2
  - Fiber optic cable  [Low Voltage]
  - Fiber patch panel  [Low Voltage]

- NVR: 1
  - NVR enclosure  [Low Voltage]

- HDMI: 1
  - HDMI wall plate  [Low Voltage]

- Light poles, pole bases, anchor bolts: 7
  - 12 ft light pole  [Lighting Hardware]
  - 20 ft light pole  [Lighting Hardware]  <<< USED BY 1 starter(s), key "20-ft-light-pole": GC3 "Site / parking lot pole light"
  - 30 ft light pole  [Lighting Hardware]
  - Pole anchor bolt kit  [Lighting Hardware]  <<< USED BY 1 starter(s), key "pole-anchor-bolt-kit": GC3 "Site / parking lot pole light"
  - Concrete pole base  [Lighting Hardware]  <<< USED BY 1 starter(s), key "concrete-pole-base": GC3 "Site / parking lot pole light"
  - Pole base cover  [Lighting Hardware]  <<< USED BY 1 starter(s), key "pole-base-cover": GC3 "Site / parking lot pole light"
  - Pole base grout  [Lighting Hardware]  <<< USED BY 1 starter(s), key "pole-base-grout": GC3 "Site / parking lot pole light"

- Exothermic weld: 2
  - Exothermic weld mold  [Grounding & Bonding]
  - Exothermic weld powder  [Grounding & Bonding]

- Snow melt: 1
  - Snow melt controller  [Equipment & Appliances]

- Well pump parts: 5
  - 12/2 submersible pump cable Copper  [Wire & Cable]  <<< USED BY 1 starter(s), key "12-2-submersible-pump-cable": RS16 "Well pump connection"
  - Well pump control box  [Equipment & Appliances]  <<< USED BY 1 starter(s), key "well-pump-control-box": RS16 "Well pump connection"
  - Well pump pressure switch  [Equipment & Appliances]  <<< USED BY 1 starter(s), key "well-pump-pressure-switch": RS16 "Well pump connection"
  - Well pump pitless adapter  [Equipment & Appliances]
  - Submersible pump splice kit  [Equipment & Appliances]  <<< USED BY 1 starter(s), key "submersible-pump-splice-kit": RS16 "Well pump connection"

- 480V panelboards: 1
  - 480V 3-phase panelboard  [Distribution Equipment]

- CT cabinets: 1
  - Current transformer cabinet  [Distribution Equipment]

- VFDs: 1
  - Variable frequency drive  [Distribution Equipment]  <<< USED BY 1 starter(s), key "variable-frequency-drive": MH11 "Motor on VFD"

- Motor starters: 4
  - Combination motor starter  [Distribution Equipment]
  - Motor starter, size 0  [Distribution Equipment]
  - Motor starter, size 1  [Distribution Equipment]  <<< USED BY 1 starter(s), key "motor-starter-size-1": MH10 "Motor with starter, 3-phase"
  - Motor starter, size 2  [Distribution Equipment]

- 400A+ disconnects: 2
  - 400A fused disconnect  [Distribution Equipment]
  - 600A fused disconnect  [Distribution Equipment]

- 400A+ fuses: 2
  - 400A cartridge fuse  [Panels]
  - 600A cartridge fuse  [Panels]

- 2", 3", 5", 8" canless (every variant): 20
  - 2" canless wafer LED downlight  [Lighting Hardware]  <<< USED BY 1 starter(s), key "2in-canless-wafer-led-downlight": LT31 "Wafer LED downlight, 2" (canless)"
  - 3" canless wafer LED downlight  [Lighting Hardware]
  - 5" canless wafer LED downlight  [Lighting Hardware]
  - 8" canless wafer LED downlight  [Lighting Hardware]  <<< USED BY 1 starter(s), key "8in-canless-wafer-led-downlight": LT32 "Wafer LED downlight, 8" (canless)"
  - 2" canless wafer LED downlight, CCT selectable  [Lighting Hardware]
  - 3" canless wafer LED downlight, CCT selectable  [Lighting Hardware]
  - 5" canless wafer LED downlight, CCT selectable  [Lighting Hardware]
  - 8" canless wafer LED downlight, CCT selectable  [Lighting Hardware]
  - 2" canless wafer LED downlight, gimbal  [Lighting Hardware]
  - 3" canless wafer LED downlight, gimbal  [Lighting Hardware]
  - 5" canless wafer LED downlight, gimbal  [Lighting Hardware]
  - 8" canless wafer LED downlight, gimbal  [Lighting Hardware]
  - 2" canless wafer LED downlight, slim  [Lighting Hardware]
  - 3" canless wafer LED downlight, slim  [Lighting Hardware]
  - 5" canless wafer LED downlight, slim  [Lighting Hardware]
  - 8" canless wafer LED downlight, slim  [Lighting Hardware]
  - 2" canless wafer LED downlight, wet rated  [Lighting Hardware]
  - 3" canless wafer LED downlight, wet rated  [Lighting Hardware]
  - 5" canless wafer LED downlight, wet rated  [Lighting Hardware]
  - 8" canless wafer LED downlight, wet rated  [Lighting Hardware]

- 3" and 5" can shells (every type): 12
  - 3" recessed can, new construction IC  [Lighting Hardware]
  - 3" recessed can, new construction non-IC  [Lighting Hardware]
  - 3" recessed can, remodel IC  [Lighting Hardware]
  - 3" recessed can, remodel non-IC  [Lighting Hardware]
  - 3" recessed can, airtight shallow  [Lighting Hardware]
  - 3" recessed can, sloped ceiling  [Lighting Hardware]
  - 5" recessed can, new construction IC  [Lighting Hardware]
  - 5" recessed can, new construction non-IC  [Lighting Hardware]
  - 5" recessed can, remodel IC  [Lighting Hardware]
  - 5" recessed can, remodel non-IC  [Lighting Hardware]
  - 5" recessed can, airtight shallow  [Lighting Hardware]
  - 5" recessed can, sloped ceiling  [Lighting Hardware]

Specialty rows used by a starter: 16 rows, in 8 starters (CS9, CS10, GC3, RS16, MH11, MH10, LT31, LT32), marked <<< above. Specialty does not delete, so nothing breaks; those starters just price from a part the picker shows lower down.
Near misses NOT tagged (owner call): Fire alarm battery; Pole handhole cover, Pole mounting arm, Pole wire harness; Furniture feed connector; Pump control relay (well/sump); Busway/cable tray rows are generic placeholders; the four 480V-208Y/120V transformers; 400A panels and 400A meter base (owner listed 480V panelboards and 400A+ disconnects only).

RENAME  (9 decisions: 8 have exact proposed names, 1 needs your call (half-size). Starter-used rows renamed: "Wire nuts" (114 starters), "30A dryer receptacle" (RS2), "50A range receptacle" (RS1), and 16 box rows. Keys stay, so no recipe breaks)
======================================================================
Every rename goes through RENAMED_BASELINE_MATERIALS (renamed in place, ids kept) and must match pricing/frozen-names.json + shared/frozenMaterialNames.ts, or frozenMaterialNames.test.ts fails. Starters name a KEY, so a rename never breaks a recipe. Shipped run types match by EXACT name, so a run-type material renamed must be edited there too (none below is a run-type material).

1. "#3/4 MC cable Copper"
   WHAT IT IS: #3 AWG copper, 4 insulated conductors + ground, MC cable. Same "gauge/conductors" notation as 12/4. It comes from the "3-4" entry in MC_SIZES (server/seed/materials/wireAndCable.ts), next to "3-3". Its old name was "3-4 MC cable"; it became "#3/4" on owner answer Q2d so it would not read as 3/4 inch.
   USED BY: no starter, no run type.
   PROPOSED: "#3 4-conductor MC cable Copper". If you rename it, "3/3 MC cable Copper" (#3, 3 conductors) has the same 3/3-reads-like-a-fraction problem: "#3 3-conductor MC cable Copper" for consistency.

2. Dryer receptacle -> split
   CURRENT: "30A dryer receptacle" (search words: 14-30r 10-30 four prong three). USED BY RS2 "Dryer receptacle, 30A" (which also uses "Dryer cord, 4-wire", so RS2 is 4-wire).
   PROPOSED: rename it to "30A dryer receptacle, NEMA 14-30R (4-wire)" (RS2 keeps it), ADD "30A dryer receptacle, NEMA 10-30R (3-wire)", and move the "10-30 three" words to the new row.

3. Range receptacle
   CURRENT: "50A range receptacle". USED BY RS1 "Range receptacle, 50A".
   PROPOSED: "50A range receptacle, NEMA 14-50R".
   Also: its search words include "6-50", which is a welder receptacle, not a range. Drop it.

4. RV receptacle
   CURRENT: "30A RV receptacle" (search words already have tt-30). USED BY: none.
   PROPOSED: "30A RV receptacle, NEMA TT-30R". ("50A RV receptacle" (RS13) is a 14-50R; you did not ask, but "50A RV receptacle, NEMA 14-50R" would match.)

5. "half-size breaker" -> "Tandem breaker"   ** NEEDS YOUR CALL - see NOT SURE 1 **
   CURRENT (8 rows, none used by a starter): "15A 1-Pole half-size breaker", "20A 1-Pole half-size breaker", "30A 1-Pole half-size breaker", "15A 2-Pole half-size breaker", "20A 2-Pole half-size breaker", "30A 2-Pole half-size breaker", "40A 2-Pole half-size breaker", "50A 2-Pole half-size breaker".
   Tandems ALREADY EXIST as their own rows: "15/15 tandem breaker", "15/20 tandem breaker", "20/20 tandem breaker", "30/30 tandem breaker" (+ "15A 2-Pole quad breaker", "20A 2-Pole quad breaker").

6. 12/2 MC with dimming
   CURRENT: "12/2 MC cable with 16/2 dimming Copper". USED BY: none.
   PROPOSED: "12/2 MC cable with 16/2 dimming pair (0-10V) Copper" ("Copper" stays last, per the frozen naming rule that every wire ends with its metal).

7. Add depth to every box name
   Depth source: [data] = the row's own description/search words say it; [typical] = the common product, NOT in the data - verify against what you buy. Covers, rings, extension rings, nail plates and pull-box covers are not boxes and are left out. Rows marked * are used by starters (name changes only, key stays).
   Single-gang box *                    -> Single-gang box, plastic, 3" deep            [typical; 22 starters]
   Single-gang metal box                -> Single-gang metal box, 2-1/2" deep           [typical]
   Double-gang box *                    -> Double-gang box, plastic, 3" deep            [typical; DV11, DV16, RS1, RS2]
   Double-gang metal box                -> Double-gang metal box, 2-1/2" deep           [typical]
   Triple-gang box *                    -> Triple-gang box, plastic, 3" deep            [typical; DV17]
   Triple-gang metal box                -> Triple-gang metal box, 2-1/2" deep           [typical]
   Single-gang box, deep                -> Single-gang box, plastic, 3-1/2" deep        [typical]
   Double-gang box, deep                -> Double-gang box, plastic, 3-1/2" deep        [typical]
   4-gang box                           -> 4-gang box, plastic, 3" deep                 [typical]
   5-gang box                           -> 5-gang box, plastic, 3" deep                 [typical]
   Single-gang old-work box *           -> Single-gang old-work box, 3" deep            [typical; DV6, GR1]
   Double-gang old-work box             -> Double-gang old-work box, 3" deep            [typical]
   Triple-gang old-work box             -> Triple-gang old-work box, 3" deep            [typical]
   Masonry box, single-gang             -> Masonry box, single-gang, 3-1/2" deep        [typical; search words say "deep"]
   Masonry box, double-gang             -> Masonry box, double-gang, 3-1/2" deep        [typical]
   Masonry box, triple-gang             -> Masonry box, triple-gang, 3-1/2" deep        [typical]
   4" square box *                      -> 4" square box, 1-1/2" deep                   [data; 30 starters]
   4" square box, 2-1/8" deep           -> no change                                    [data]
   4-11/16" square box *                -> 4-11/16" square box, 2-1/8" deep             [data; DV22, RS13]
   Octagon box, plastic *               -> Octagon box, plastic, 2-1/4" deep            [typical; LT10, LT12, LT13, LT15]
   Octagon box, metal *                 -> Octagon box, metal, 1-1/2" deep              [data; LT30]
   Octagon box, metal, 2-1/8" deep      -> no change                                    [data]
   Shallow round box *                  -> Shallow round box, 1/2" deep                 [data ("pancake 1/2 inch"); RS9]
   Old-work ceiling box                 -> Old-work ceiling box, 2-1/4" deep            [typical]
   Fan-rated ceiling box *              -> Fan-rated ceiling box, 2-1/4" deep           [typical; LT2]
   Ceiling fan brace box *              -> Ceiling fan brace box, 1-1/2" deep           [typical; LT3, LT11]
   Concrete ring, 4" deep / 6" deep     -> no change                                    [data]
   Handy box *                          -> Handy box, 1-7/8" deep                       [typical; MH2, MH9]
   1/2" weatherproof box, single-gang * -> 1/2" weatherproof box, single-gang, 2" deep  [typical; LT17, MH6]
   1/2" weatherproof box, double-gang * -> 1/2" weatherproof box, double-gang, 2" deep  [typical; PG20]
   1/2" weatherproof box, triple-gang   -> 1/2" weatherproof box, triple-gang, 2" deep  [typical]
   3/4" weatherproof box, single-gang   -> 3/4" weatherproof box, single-gang, 2" deep  [typical]
   3/4" weatherproof box, double-gang   -> 3/4" weatherproof box, double-gang, 2" deep  [typical]
   1/2" weatherproof round box *        -> 1/2" weatherproof round box, 2" deep         [typical; LT16, LT29]
   3/4" weatherproof round box          -> 3/4" weatherproof round box, 2" deep         [typical]
   1/2" weatherproof box, single-gang, PVC -> 1/2" weatherproof box, single-gang, PVC, 2" deep [typical]
   3/4" weatherproof box, single-gang, PVC -> 3/4" weatherproof box, single-gang, PVC, 2" deep [typical]
   FS / FD cast boxes (8 rows)          -> no change; FS = shallow, FD = deep is the trade name and the descriptions say so. Adding inches is possible but FS/FD is what gets ordered.
   Floor box *                          -> NOT SURE: depth depends on the product (DV33)
   Pull boxes (4x4 ... 24x24, NEMA 1, NEMA 3R, PVC; 16 rows) -> add the third dimension, e.g. "6x6x4 pull box", "12x12x4 pull box, NEMA 3R", "12x12x6 PVC pull box" [typical: 4" deep up to 12x12, 6" for 16x16 and 24x24 - verify]. 6x6 used by PG6, 12x12 by MS3.
   Siding mounting block, Retrofit bar hanger, Box support bracket - not boxes, no change.

8. Wire nuts -> wire ranges   ** see NOT SURE 3 **
   CURRENT: "Wire nuts" (description: medium/orange, general purpose; USED BY 114 starters, key "wire-nuts"), "Wire nuts, small" (red/yellow), "Wire nuts, large" (gray/blue). "Direct burial wire nut" is separate and unchanged.
   PROPOSED (ranges are the common published ones; they vary a little by brand, verify):
     "Wire nuts, small"  -> "Wire nuts, #22-#14"
     "Wire nuts"         -> "Wire nuts, #18-#10"   (114 starters; key stays)
     "Wire nuts, large"  -> "Wire nuts, #14-#6"
   The current color notes are backwards for the common brand: orange is the SMALLEST of orange/yellow/red, not the medium. Drop colors from the names and descriptions, or fix them.

9. 1/2" conduit bushing -> split into insulating and grounding
   CURRENT: '1/2" conduit bushing' (search words: plastic insulating insulated throat). USED BY: none. The same row exists for 3/4" through 4" (2" is used by PG2). There is one unsized "Grounding bushing" row (Grounding & Bonding).
   PROPOSED: '1/2" conduit bushing' -> '1/2" insulating bushing', and ADD '1/2" grounding bushing'. Your decision names 1/2" only: see NOT SURE 4 for the other 9 sizes and the unsized "Grounding bushing".

SEARCH WORDS  (1 decision, 0 changes needed)
======================================================================
"MLO" on "100A main-lug sub-panel": ALREADY THERE. Its search words are "100 amp mlo subpanel load center loadcenter panelboard remote distribution no". Every one of the 21 main-lug rows carries "mlo". Nothing to do.

NOT SURE  (9 items that need your call)
======================================================================
1. Half-size -> "Tandem breaker" would be WRONG for these 8 rows as I read them. They are described as "1/2 inch slim space saver" (one circuit in half a space, e.g. a 1/2" THQP-style breaker), while tandems (two circuits in one space) already exist as 4 rows of their own ("15/15", "15/20", "20/20", "30/30 tandem breaker"). Renaming would give two different products the same kind of name. And a "40A or 50A 2-Pole tandem" is not a normal part. Options: (a) keep "half-size"; (b) rename to "half-inch" or "1/2-inch" to be clearer; (c) retire the half-size rows if you meant they are the same as the tandems. The 8 ABB THQP brand variants hang off these parents.
2. #12 bare solid copper is the ground in 3 shipped run types ('1/2" EMT, 2 #12 + ground', '3/4" EMT, 3 #12 + ground', '700 series surface raceway, 2 #12 + ground'). Removing it seeds those types with no ground on a fresh database. Point them at "#10 bare stranded"? That is also on the remove list. "#8 bare solid Copper" or keeping #12 bare solid are the options.
3. Wire nuts: "Wire nuts" is in 114 of the 183 starters. Renaming it to a range says what it is; if the range chosen is too small for #12 device work, every one of those recipes is priced with the wrong nut. The proposed #18-#10 covers #12 and #10 device splices.
4. Bushings: your decision says 1/2" only. The same split applies to 3/4"-4" (and 3-1/2" is being removed). Rename all 9 to "insulating bushing" and add 9 sized grounding bushings, or 1/2" only? And keep or retire the unsized "Grounding bushing"?
5. Generic surface raceway fittings: "Raceway coupling", "Raceway flat elbow", "Raceway inside elbow", "Raceway outside elbow", "Raceway tee fitting", "Raceway entrance end fitting" (+ end cap, blank end plate, mounting strap, device boxes, divider clip, fixture box, conduit connector) have no series. Six of them now have a 700-series twin (added 3ef66d8). They may be meant for the 500/1500/2400 series rows, so not clearly duplicates. "Raceway entrance end fitting" is used by DV34, which also uses the 700-series box and plate, so DV34 mixes generic and 700-series parts.
6. "Wall plate" (generic) has 87 sized/typed siblings and is used by 37 starters. It IS a generic that duplicates its own sized versions, but removing it would strip 37 recipes. Left off the remove list.
7. Gas bonding clamp and snap-in NM connectors: see ADD 22 and 23.
8. Large Sch 80 sweeps: I took "large" as 2-1/2"-4" (12 rows). If you meant 2" and up, add the 4 2" rows (16 total).
9. Found while checking, not in your list: every aught wire row (1/0, 2/0, 3/0, 4/0: THHN, XHHW, bare, USE-2, URD and others) carries a bogus search word "10ga", "20ga", "30ga" or "40ga". A search for "10ga" can surface 1/0 wire.

```

## What was built — 2026-10-09 (Track A, session 25)

Code: `87066f4` (with the merge `c9eebd7` and the CI fixes `66b3961`).
The lists the seed reads are `shared/catalogReview20261008.ts` (renames,
retired) and `server/seed/materials/specialty.ts` (the Specialty tag).
Tests: `server/catalogReview20261008.test.ts` (pure) and
`server/catalogReviewSeed.test.ts` (database) — each mutation-checked red.

**Catalog: 1,824 -> 1,793 shipped rows.** 138 retired, 107 added, 23
renamed in place, 108 tagged Specialty. Nothing deleted: a retired row
keeps its id (`isActive = false`), so anything priced from one resolves.

### Calls made on the NOT SURE items, and why

| Item                                      | Call                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #12 bare on 3 run types (NS 2)            | New row **`#12 THHN green Copper`** (solid, the owner's "#12 THHN green"); the three types name it. Existing databases: a seed pass moves a SHIPPED type's link off #12 bare only if it still points there (`RUN_TYPE_MATERIAL_SWAPS`). Company copies untouched.                                            |
| 3-1/2" underground run type               | Dropped from the shipped list; ARCHIVED (not deleted) where it exists (`RETIRED_BASELINE_RUN_TYPES`). Staging: 0 runs on it.                                                                                                                                                                                 |
| Wire nuts small / large (§ 4)             | **Folded by rename, not kept:** "Wire nuts, small" -> `Wire nut, 22-12 AWG (blue/orange)`, "Wire nuts, large" -> `Wing nut wire connector, 14-6 AWG (blue)`. Neither on a starter; folding avoids two rows for one part. "Wire nuts" -> `Wire nut, 22-8 AWG (tan/red)`, same row.                            |
| Generic connectors (§ 5)                  | Split-bolt, H-tap, Butt splice, Ring terminal, Spade terminal, Insulated multi-tap block: on no starter, **retired**. Cord grip: on LT25 and MH8, **renamed in place** to `1/2" cord grip (0.25"-0.50" cord)` — both starters keep the line with no repair pass.                                             |
| Wire ranges changed from the owner's list | Set-screw splice #8-#2 -> **#14-#2**, 4/0-500 -> **#4-500**; multi-tap 4/0-#6 -> **3/0-#6**, 500-4/0 -> **500-#4** (no maker found selling the listed ranges: Ilsco SPA-2 / SPA-500, Polaris IPL3/0 / IPLD500). Lug ranges and H-tap sizes kept as typical — verify.                                         |
| Bushings (NS 4)                           | **Every size**: "N conduit bushing" -> `N insulating bushing` (renamed; PG2 keeps it) + new `N grounding bushing`. The unsized "Grounding bushing" (no starter) **retired**.                                                                                                                                 |
| Box depths (§ 6)                          | Renamed ONLY where the catalog's own data stated the depth: 4" square (1-1/2"), 4-11/16" square (2-1/8"), metal octagon (1-1/2"), shallow round (1/2"). The "typical" ones are listed for the owner: `C:\dev\catalog-review\verify-box-depths.txt`.                                                          |
| Half-size breakers (NS 1)                 | **Kept** as "half-size" (owner).                                                                                                                                                                                                                                                                             |
| PVC expansion (§ ADD 5)                   | Named like the shipped 1/2" row (`N" PVC expansion fitting`); "expansion coupling" is a search word on all six.                                                                                                                                                                                              |
| Snap-in NM (NS 7)                         | Split out: `1/2" snap-in NM connector`, `3/4" snap-in NM connector`; "snap in" removed from the screw clamps.                                                                                                                                                                                                |
| Gas bonding clamp (NS 7)                  | Added `Gas pipe bonding clamp`; "gas" removed from the water pipe clamp's words.                                                                                                                                                                                                                             |
| F-clips / LV2 (§ ADD 13-14)               | Added `Old-work box F-clip`, `Low-voltage mud ring, 2-gang`. "Device wing bracket" and "Low-voltage mud ring" NOT renamed (not asked); "lv1" added as a search word.                                                                                                                                         |
| Already there (not added)                 | Direct-burial gel connector = `Direct burial wire nut`; UF splice kit = `Underground splice kit` ("uf" added). **Heat shrink tubing**: the generic row exists, so per "only if not already in Consumables" no sized rows were added. **Answered 2026-10-08 (owner): keep the single generic row, no sizes.** |
| Specialty and search                      | Sorts after everyday rows that answer the search the SAME way (after phrase and match tier). A search that names a specialty row still finds it first ("busway", "4 pvc 80 sweep"). A company's copy is never tagged, and forking does not copy the tag.                                                     |
| "10ga" words (§ 7)                        | Gone from all 12 aught rows; a test checks every "Nga" word matches the name's gauge.                                                                                                                                                                                                                        |
| Found while building                      | "Wire nut" is now a FITTING noun in the search lexicon (it had read as the fastener "nut", and the wing nut led "marrette"). LFMC rows lost "carflex". The #3 MC rows keep "3/3" / "#3/4" as search words so the old names still find them.                                                                  |
