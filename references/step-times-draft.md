# Step times — a starting draft for the top 30 residential and top 30 commercial starters

**Track C, 2026-10-12. A DRAFT for the owner to change. Nothing here is in
the app or the spreadsheet.** No code, no database and no sheet was touched.

## 1. What this is

Every starter assembly can build its labor from **work steps** — mount the
box, prep the cable, terminate, set the device, plate, test — each with a
time in minutes. Change a step once and every assembly using it moves.

This file gives you:

- a minute figure for each step, with **what it assumes** (height, wall,
  NM vs MC vs conduit) so you can disagree with a specific motion;
- the step list and the total for **60 starters**: the top 30 residential
  (§ 5) and the top 30 commercial (§ 6), and why each one made the cut.

**Where the numbers came from.** Every time here was worked out from the
motions of the job: hold, drive two nails, strip three conductors, tighten
four screws. **None is copied, paraphrased or "adjusted from" NECA, RSMeans
or any other published labor table**, and none should be.

**Where I was unsure I rounded up a little, and marked it ⚑.** You asked for
"a little high beats low" (your Q2 answer on 2026-10-09), and a high step is
easy to spot and pull down, where a low one quietly loses money on every bid.

### How to use it

- **Steps S01–S47 are already on the "Steps" tab** of
  `pricing/starter-catalog-pricing.xlsx`. Type your number in the yellow
  **Minutes** column. The **Draft** column on that tab is the older draft;
  the "Mine" column in § 3 below is this one. They differ on two steps only
  (S16 and S44, both rounded up).
- **Steps S48–S109 are NEW** (§ 4). They are not in the app or on the sheet
  yet. Mark them up here; adding them is a code change for Track C and a
  sheet rebuild for Track A, after the live release.
- **Cable time is not a step.** It comes from each cable's own hours per
  100 ft on `pricing/labor-units-starter.xlsx` (your Q1 answer). The
  "+ cable" column below only shows what my rough rates would add, so you
  can see a whole number: **NM #14–#10 and MC 12/2 at 5 min per 10 ft, NM
  #8 and up at 9 min per 10 ft** (the rates already in
  `step-based-labor-plan.md` § 10), plus three new ones flagged where used.

## 2. What EVERY time assumes, unless the step says otherwise

| Assumption       | Residential                                                                    | Commercial                                                                  |
| ---------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Who              | One journeyman, working alone                                                  | Same                                                                        |
| Work             | **New work, open wood framing**, before drywall (trim after)                   | **Metal studs, lay-in grid at 9–10 ft**, deck reachable from an 8 ft ladder |
| Wiring method    | **NM (Romex)**                                                                 | **12/2 MC** for branch work; conduit only where the step says so            |
| Device height    | Standard (16" receptacles, 48" switches) — no ladder                           | Same                                                                        |
| Ceiling work     | ≤ 9 ft, 6 ft step ladder                                                       | ≤ 10 ft, 6–8 ft ladder; **no lift**                                         |
| Material         | At hand, out of the box                                                        | Same                                                                        |
| **NOT in steps** | Layout, material handling, cleanup, travel, breaks, inspections — **overhead** | Same — plus hoisting to a roof and lift rental                              |
| **NOT in steps** | Pulling cable — **the cable's own per-foot row**                               | Conduit runs and feeders — **traced runs** on the plans                     |
| Old work         | Use the **Retrofit** modifier, not different steps (your Q8)                   | Same; height over 10 ft uses the **height** modifier                        |

So every total below is **hands-on time only**. Where a starter has typed
hours today (DV1 0.75, DV4 0.6, DV2 0.9, LT1 0.6, DV5 0.7, LT2 1.5, DV3
1.25), the steps come in under them. That gap is the overhead, which goes
in the assembly's overhead hours (your Q2 answer), and the app will not
clear a typed number until steps + overhead reach it.

## 3. The steps already in the app (S01–S47)

"Mine" is this draft. "Sheet draft" is what the Steps tab shows now.

| Key | Step                                           | Unit          | Mine     | Sheet draft | What it assumes                                                                                                                   |
| --- | ---------------------------------------------- | ------------- | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| S01 | Mount a new-work box (nail-on)                 | each          | 4        | 4           | Plastic nail-on box on an open wood stud, standard height                                                                         |
| S02 | Mount a fan-rated box with brace               | each          | 8        | 8           | Open joists, adjustable brace, ceiling ≤ 9 ft                                                                                     |
| S03 | Prepare a cable end at a box                   | per cable end | 2        | 2           | NM #14–#12, box already up. **Also the panel end** of a home run                                                                  |
| S04 | Make up the grounds                            | each box      | 2        | 2           | Two or three grounds and one pigtail                                                                                              |
| S05 | Strip and terminate a device                   | each          | 4        | 4           | 15/20A device, #14 or #12, screw or back-wire                                                                                     |
| S06 | Extra: 3-way, 4-way or interconnect            | each          | 3        | 3           | One extra conductor to sort out and land                                                                                          |
| S07 | Extra: GFCI                                    | each          | 3        | 3           | **Suggest renaming "Extra: GFCI or AFCI device"** — the AFCI receptacle is the same bulk and the same test. Box deep enough       |
| S08 | Extra: device with leads (dimmer, sensor)      | each          | 2        | 2           | Wire-nut the leads instead of screws                                                                                              |
| S09 | Fold in and set the device                     | each          | 2        | 2           | Single-gang, not over-filled                                                                                                      |
| S10 | Plate or cover                                 | each          | 1        | 1           | One or two screws                                                                                                                 |
| S11 | Test                                           | each          | 1        | 1           | Plug tester or flip it once. Not a ring-out                                                                                       |
| S12 | Mount a 4" or 4-11/16" square box              | each          | 5        | 5           | Bracket on a metal stud (commercial), or screwed to a wood stud (resi 4-11/16" for range, dryer, RV)                              |
| S13 | Install a mud ring                             | each          | 1        | 1           | Two screws                                                                                                                        |
| S14 | Cut and connect MC at a box                    | per cable end | 4        | 4           | 12/2 MC, rotary cutter, red-head, snap-in or screw connector. Also the panel end                                                  |
| S15 | Ground pigtail to the box                      | each          | 1        | 1           | Pre-made green pigtail, tapped hole                                                                                               |
| S16 | Set a canless wafer                            | each          | **10 ⚑** | 8           | Finished drywall ceiling ≤ 9 ft, hole cutter, the wafer's own little J-box. **Rounded up**: overhead work, dust, fiddly knockouts |
| S17 | Mount a fixture bracket                        | each          | 3        | 3           | Crossbar to the box, check level                                                                                                  |
| S18 | Hang a surface fixture                         | each          | 12       | 12          | Ceiling light under ~15 lb, ≤ 9 ft                                                                                                |
| S19 | Assemble and hang a ceiling fan                | each          | 45       | 45          | Ordinary fan, downrod supplied, flat ceiling ≤ 9 ft. Vaulted or high ceiling is the height modifier                               |
| S20 | Set a lay-in fixture in the grid               | each          | 10       | 10          | 2x4 or 2x2, grid at 9–10 ft                                                                                                       |
| S21 | Hang a support wire to structure               | each          | 4        | 4           | Deck or joist at 12–14 ft, reachable from an 8 ft ladder off the floor                                                            |
| S22 | Grid clip                                      | each          | 0.5      | 0.5         | Snap on, bend the tab                                                                                                             |
| S23 | Connect a fixture whip (both ends)             | each          | 8        | 8           | Pre-made 6 ft MC whip                                                                                                             |
| S24 | Install a troffer retrofit kit                 | each          | 25       | 25          | Kit with its own driver; fixture in fair shape, lens not stuck                                                                    |
| S25 | Convert a 2-lamp fixture to ballast bypass     | each          | 25 ⚑     | 25          | Four sockets swapped. **Old fixtures with brittle sockets run long** — I'd not go lower                                           |
| S26 | Mount and connect an exit or emergency unit    | each          | 15       | 15          | Combo or exit, ceiling or wall ≤ 10 ft, on a ring                                                                                 |
| S27 | Hang a surface or suspended strip              | each          | 15       | 15          | 4 ft strip, ≤ 10 ft                                                                                                               |
| S28 | Remove a fixture and make it safe              | each          | 12       | 12          | ≤ 10 ft, fixture under ~25 lb, goes to the pile. Lamp recycling is overhead                                                       |
| S29 | Remove a device and blank it                   | each          | 5        | 5           | Device off, conductors capped, blank plate on                                                                                     |
| S30 | Open and close the panel cover                 | per visit     | 4        | 4           | Resi load center or a commercial panel with a dead front                                                                          |
| S31 | Snap in a breaker                              | each          | 2        | 2           | Plug-on or bolt-in, filler knocked out                                                                                            |
| S32 | Land a 1-pole circuit and label it             | each          | 6        | 6           | #14/#12, room in the gutter. A packed panel runs longer                                                                           |
| S33 | Land a 2-pole circuit and label it             | each          | 9 ⚑      | 9           | Up to #6. **Low for #4 and up** (the EV charger uses it) — think about 12 if you agree                                            |
| S34 | Mount a box on an independent support          | each          | 3        | 3           | Box to the wire clip above the grid                                                                                               |
| S35 | Make up a splice box                           | each          | 4        | 4           | Splice straight through, four wire nuts                                                                                           |
| S36 | Set a smoke or CO head and test                | each          | 3        | 3           | Twist on, pull the tab, press test                                                                                                |
| S37 | Frame in a bath fan housing                    | each          | 20       | 20          | New work from below, open joists                                                                                                  |
| S38 | Duct and roof cap for a bath fan               | each          | 45 ⚑     | 45          | Single storey, walkable shingle roof. **Many shops let the roofer do the cap** — delete the step on those jobs                    |
| S39 | Install a siding mounting block                | each          | 10       | 10          | Vinyl siding                                                                                                                      |
| S40 | In-use cover                                   | each          | 3        | 3           | Gasket, base, lid, screws                                                                                                         |
| S41 | Prepare a large cable end (#8 and up)          | per cable end | 4 ⚑      | 4           | #8–#4 NM. **I also use it for 10/3** (dryer, inlet) because 4-wire #10 is stiff — rounds a little high there                      |
| S42 | Terminate a large receptacle (#6, 4-wire)      | each          | 10 ⚑     | 10          | **Suggest renaming "Terminate a range, dryer or RV receptacle (4-wire)"**. Rounds high for the #10 dryer                          |
| S43 | Install a range or dryer cord on the appliance | each          | 10       | 10          | Appliance pulled out and reachable                                                                                                |
| S44 | Mount an outdoor disconnect                    | each          | **20 ⚑** | 15          | Siding or block wall, 2–4 anchors, ~5 ft up. **Rounded up**: drilling block or finding a stud through siding eats time            |
| S45 | Land conductors in a disconnect                | each          | 8        | 8           | Line, load and ground, up to #6                                                                                                   |
| S46 | Install a condenser whip (both ends)           | each          | 12       | 12          | Pre-made whip ≤ 6 ft                                                                                                              |
| S47 | Seal a penetration with duct seal              | each          | 2        | 2           | Press it in                                                                                                                       |

## 4. NEW steps the other 30 starters need (S48–S109) — not in the app yet

Keys are a suggestion; Track C fixes them when they go in.

| Key  | Step                                                       | Unit        | Mine | What it assumes                                                                                                                |
| ---- | ---------------------------------------------------------- | ----------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| S48  | Hang a wall fixture (vanity, sconce)                       | each        | 15   | 3-light vanity with glass shades, crossbar, centred over the mirror line                                                       |
| S49  | Mount and connect an under-cabinet light                   | each        | 15   | 24" hardwired bar, cable stubbed out under the cabinet at rough; short screws that won't come through the cabinet floor        |
| S50  | Hang a pendant and set its height                          | each        | 20 ⚑ | Cord or rod cut to height, ≤ 9 ft ceiling. **Over an island the height is often set with the customer** — that's why it's high |
| S51  | Extra: AFCI/GFCI breaker neutral                           | each        | 2    | Neutral to the breaker, its pigtail to the bar, press test                                                                     |
| S52  | Connect a dishwasher                                       | each        | 20 ⚑ | **Machine already set by others.** Kick plate off, connector, splice, close. If you also slide it in and level it, add 15–20   |
| S53  | Install a cord on a disposal                               | each        | 10   | Disposal hung by the plumber. Bottom plate off, connector, land three, close                                                   |
| S54  | Connect a range hood                                       | each        | 15 ⚑ | **Connect only** — hood hung by the cabinet installer. If you hang it too, add about 30                                        |
| S55  | Mount an EV charger on the wall                            | each        | 20   | Garage wall, find studs, bracket level with four lags, hang the unit                                                           |
| S56  | Land and set up an EV charger                              | each        | 25 ⚑ | #6 or #4, torque, set the amp switch, first charge or tester. **App and Wi-Fi setup can run long** — not counted               |
| S57  | Pull a breaker and free the circuit's neutral              | each        | 3    | For a breaker swap; circuit is not a shared-neutral (multiwire) circuit                                                        |
| S58  | Test a generator hookup with the generator running         | each        | 15 ⚑ | Customer's generator on site and runs. Interlock or transfer checked both ways                                                 |
| S59  | Mount a generator inlet box outside                        | each        | 20 ⚑ | Drill through siding and rim joist, mount, seal. **Brick or block runs longer**                                                |
| S60  | Install a panel interlock kit                              | each        | 30 ⚑ | Top-right spaces free. **If circuits must be moved to free them, add 5 per circuit moved**                                     |
| S61  | Remove an old meter base or meter-main                     | each        | 60 ⚑ | Power already off by the utility; label then unland; old one pulled off the wall. **Rotten siding or a stuck hub runs long**   |
| S62  | Mount a meter base or meter-main                           | each        | 45   | Level, fastened, hubs and knockouts set, sealed to the siding                                                                  |
| S63  | Land a service-entrance cable end (4/0 SER)                | per end     | 15   | Strip, form, torque to the lug — one end                                                                                       |
| S64  | Drive a ground rod and clamp it                            | each        | 20 ⚑ | **Normal soil, hammer drill with a driver bit.** Rock or hard clay runs far longer                                             |
| S65  | Make up the grounding electrode conductor                  | each        | 10   | Both ends of the bare GEC. Its footage rides on the wire's row                                                                 |
| S66  | Bond the water pipe                                        | each        | 10   | Clamp within 5 ft of entry, pipe reachable                                                                                     |
| S67  | Install the intersystem bonding bridge                     | each        | 10   | Mount and land to the GEC                                                                                                      |
| S68  | Write a full panel directory                               | each panel  | 15   | Up to ~30 circuits, typed or neat hand                                                                                         |
| S69  | Remove an old panel                                        | each        | 60 ⚑ | Label every circuit first, unland, pull the old can. Wire mess varies a lot                                                    |
| S70  | Mount a main panel                                         | each        | 30   | 200A 40-space load center, same spot as the old one                                                                            |
| S71  | Install a service mast through the roof                    | each        | 75 ⚑ | Hub, 10 ft 2" rigid, roof flashing, two straps, weatherhead. **Single storey, walkable roof.** Two-storey or steep: more       |
| S72  | Pull service conductors, drip loop, land in the meter base | each        | 30   | 4/0 and 2/0 aluminum through the mast                                                                                          |
| S73  | Land meter-to-panel conductors at both ends                | each        | 30   | Short nipple, 4/0 Al                                                                                                           |
| S74  | Re-land an existing circuit in a new panel                 | per circuit | 5 ⚑  | **Counted 20 on PG2 — change the count to the job.** Short or spliced-out conductors run longer                                |
| S75  | Fill the old fixture opening with a tile                   | each        | 3    | Tile supplied by others                                                                                                        |
| S76  | Remove an exit or emergency unit                           | each        | 8    | Battery unplugged, unit off, conductors capped                                                                                 |
| S77  | Mount a weatherproof box on block or brick                 | each        | 15 ⚑ | Drill and anchor. **At 12–14 ft on an extension ladder** — over that is the height modifier                                    |
| S78  | Hang and connect a wall pack, seal it                      | each        | 25 ⚑ | 15–25 lb fixture held on a ladder; splice, silicone top and sides, set the photocell                                           |
| S79  | Mount a box on a grid bracket                              | each        | 5    | Bracket across the tees, box on                                                                                                |
| S80  | Mount and wire a sensor power pack                         | each        | 8    | Through a ½" KO on the box, line, load, neutral, ground                                                                        |
| S81  | Strip and land a low-voltage pair or trio (both ends)      | each        | 6    | Sensor or 0-10V wiring, footage on the wire's row                                                                              |
| S82  | Set and adjust a ceiling sensor, walk test                 | each        | 10   | In the tile or on a ring; set time delay and sensitivity                                                                       |
| S83  | Remove a breaker and its conductors (demo)                 | each        | 6    | Unland, pull the conductors out of the gutter, breaker out                                                                     |
| S84  | Update one line of a panel directory                       | each        | 2    |                                                                                                                                |
| S85  | Install a low-voltage ring                                 | each        | 4    | Cut-in ring in drywall or on the stud                                                                                          |
| S86  | Hang a J-hook                                              | each        | 3 ⚑  | Deck or wall above the grid reachable from a ladder                                                                            |
| S87  | Terminate a Cat6 jack and plate                            | each        | 8    | One jack, punch 8 conductors, keystone in, plate on                                                                            |
| S88  | Terminate a Cat6 at the patch panel                        | each        | 6    | One port on an existing patch panel                                                                                            |
| S89  | Test and label a data drop                                 | each        | 4 ⚑  | **Basic wiremap tester.** Certification testing with a report is extra                                                         |
| S90  | Hang an 8 ft strip                                         | each        | 20 ⚑ | 8 ft fixture, one person, ≤ 12 ft. **Awkward alone** — a second hand on long rows is real                                      |
| S91  | Hang an aircraft-cable kit                                 | each        | 6    | Anchor to deck or joist, gripper on. Open ceiling sales floor                                                                  |
| S92  | Remove a device to replace it                              | each        | 4    | Plate off, device out, conductors straightened                                                                                 |
| S93  | Set and anchor a panelboard can                            | each        | 60 ⚑ | 225A can, block or concrete wall, four wedge anchors. **Heavy — two people for the lift**, counted as one person's hour        |
| S94  | Install the panel interior and dead front                  | each        | 20   |                                                                                                                                |
| S95  | Land a 3-phase feeder on a main breaker                    | each        | 45 ⚑ | Three phases, neutral and ground, up to 4/0 Cu or 250 Al, torqued. Feeder pull is a traced run                                 |
| S96  | Apply an arc-flash label                                   | each        | 3    |                                                                                                                                |
| S97  | Install a liquidtight whip (cut, two connectors)           | each        | 12 ⚑ | ½"–¾", up to 6 ft. ¾" is the high end                                                                                          |
| S98  | Pull and make up conductors in a short whip                | each        | 5 ⚑  | Three #12 in ½". **Counted twice on the RTU** for #6 in ¾"                                                                     |
| S99  | Connect at the sign's box                                  | each        | 10 ⚑ | Sign by others. **Usually on a lift at 15–20 ft — lift time not in here**                                                      |
| S100 | Mount a disconnect at a rooftop unit                       | each        | 30 ⚑ | On the unit or a short strut stand. Hoisting to the roof is overhead                                                           |
| S101 | Flash a roof penetration with a boot                       | each        | 20 ⚑ | **Some roofs need the roofer for the warranty** — delete then                                                                  |
| S102 | Land conductors at an RTU, check rotation                  | each        | 15   | 3-phase, rotation checked with the mechanical contractor                                                                       |
| S103 | Set a generator pad                                        | each        | 30 ⚑ | Level gravel, set the pad. **Setting the generator itself is the dealer's**                                                    |
| S104 | Mount a transfer switch                                    | each        | 45   | Beside the meter or panel, outdoor or garage wall                                                                              |
| S105 | Land an automatic transfer switch                          | each        | 45 ⚑ | Utility, generator and load sides, neutral and ground. Feeders are traced runs                                                 |
| S106 | Run and land generator control wire                        | each        | 15   | Both ends; footage on the wire's row                                                                                           |
| S107 | Connect the generator battery and charger                  | each        | 15   |                                                                                                                                |
| S108 | Start-up and transfer test                                 | each        | 30 ⚑ | **Often the dealer's job** — delete if so                                                                                      |
| S109 | Separate neutrals and grounds in the old panel (now a sub) | each        | 30 ⚑ | For a meter-main that turns the inside panel into a subpanel. **The PG3 recipe has no ground bar kit** — worth adding the part |

## 5. Top 30 RESIDENTIAL

**How they were picked:** the order is Track B's list in
`top-assemblies-draft.md` § 2 (the one you already marked up — the 4" wafer
went in at #4 on your word). These are the items that show up on almost
every new house or remodel, then the kitchen and laundry circuits every
house has, then the bigger one-offs that are on a lot of jobs and are big
money when they are (services, EV, generators).

"Step min" is the steps only. "+ cable" is what my rough cable rate would
add. "Hands-on h" is the two together. **Overhead goes on top.**

| #   | Ref  | Assembly                                 | Why it made the cut                                          | Steps                                                                                 | Step min | + cable (rough)                  | Hands-on h | Typed today |
| --- | ---- | ---------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- | -------- | -------------------------------- | ---------- | ----------- |
| 1   | DV1  | Duplex receptacle standard               | Most-counted item on any house                               | S01, cable, S03×2, S04, S05, S09, S10, S11                                            | 18       | 25 ft 12/2: ~12.5                | 0.51       | 0.75        |
| 2   | DV4  | Single-pole switch                       | Every room                                                   | S01, cable, S03×2, S04, S05, S09, S10, S11                                            | 18       | 20 ft 14/2: ~10                  | 0.47       | 0.6         |
| 3   | LT7  | Wafer LED downlight, 6" (canless)        | What new houses get instead of cans                          | cable, S03×2, S16, S11                                                                | 15       | 20 ft 14/2: ~10                  | 0.42       | not set     |
| 4   | LT8  | Wafer LED downlight, 4" (canless)        | Your call: "we use a lot of them"                            | cable, S03×2, S16, S11                                                                | 15       | 20 ft 14/2: ~10                  | 0.42       | not set     |
| 5   | DV2  | GFCI receptacle                          | Kitchens, baths, garage, laundry — several per house         | S01, cable, S03×2, S04, S05, S07, S09, S10, S11                                       | 21       | 25 ft 12/2: ~12.5                | 0.56       | 0.9         |
| 6   | DV13 | 3-way switch                             | Halls, stairs, any room with two doors                       | S01, cable, S03×2, S04, S05, S06, S09, S10, S11                                       | 21       | 20 ft 14/3: ~10                  | 0.52       | not set     |
| 7   | DV9  | AFCI receptacle                          | Where the AFCI is at the first outlet instead of the breaker | S01, cable, S03×2, S04, S05, S07, S09, S10, S11                                       | 21       | 25 ft 12/2: ~12.5                | 0.56       | not set     |
| 8   | LT1  | Surface-mount ceiling fixture            | Bedrooms, closets, halls                                     | S12, cable, S03×2, S04, S17, S18, S11                                                 | 27       | 20 ft 14/2: ~10                  | 0.62       | 0.6         |
| 9   | DV5  | Dimmer switch                            | Living, dining, any wafer group                              | S01, cable, S03×2, S04, S05, S08, S09, S10, S11                                       | 20       | 20 ft 14/2: ~10                  | 0.50       | 0.7         |
| 10  | RS9  | Combination smoke/CO detector            | Required in every bedroom and hall — always several          | S01, cable, S03×2, S04, S05, S06, S36                                                 | 20       | 20 ft 14/3: ~10                  | 0.50       | not set     |
| 11  | LT2  | Ceiling fan standard                     | Bedrooms and living rooms                                    | S02, cable, S03×2, S04, S19, S11                                                      | 60       | 20 ft 14/2: ~10                  | 1.17       | 1.5         |
| 12  | DV3  | Dedicated 20A receptacle                 | Fridge, microwave, laundry, garage                           | S01, cable, S03×2, S04, S05, S09, S10, S11, S30, S31, S32                             | 30       | 35 ft 12/2: ~17.5                | 0.79       | 1.25        |
| 13  | RS7  | Bath exhaust fan wiring                  | Every bathroom                                               | S37, S38, cable, S03×2, S04, S05, S11                                                 | 76       | 20 ft 14/3: ~10                  | 1.43       | not set     |
| 14  | DV8  | Outdoor GFCI receptacle, in-use cover    | Front and back of every house                                | S39, S01, cable, S03×2, S04, S05, S07, S09, S40, S11                                  | 33       | 25 ft 12/2: ~12.5                | 0.76       | not set     |
| 15  | LT12 | Vanity light                             | One per bathroom                                             | S01, cable, S03×2, S04, **S48**, S11                                                  | 26       | 20 ft 14/2: ~10                  | 0.60       | not set     |
| 16  | LT14 | Under-cabinet light                      | Most kitchens now                                            | cable, S03×2, **S49**, S11                                                            | 20       | 15 ft 14/2: ~7.5                 | 0.46       | not set     |
| 17  | RS4  | Dishwasher connection                    | Every kitchen                                                | cable, S03×2, **S52**, S11, S30, S31, S32, **S51**                                    | 39       | 35 ft 12/2: ~17.5                | 0.94       | not set     |
| 18  | RS5  | Garbage disposal, switched               | Most kitchens                                                | S01×2, cable, S03×4, S04×2, S05×2, S09×2, S10×2, **S53**, S11, S30, S31, S32, **S51** | 59       | 35 ft 12/2 + 10 ft 12/3: ~22.5   | 1.36       | not set     |
| 19  | RS6  | Range hood / microwave circuit           | Every kitchen (it is the hood, on your word)                 | cable, S03×2, **S54**, S11                                                            | 20       | 20 ft 14/2: ~10                  | 0.50       | not set     |
| 20  | RS1  | Range receptacle, 50A                    | Every electric-range house                                   | S12, cable, S41×2, S42, S10, S30, S31, S33, S43                                       | 49       | 40 ft 6/3: ~36                   | 1.42       | not set     |
| 21  | RS2  | Dryer receptacle, 30A                    | Every electric-dryer house                                   | S12, cable, S41×2, S42, S10, S30, S31, S33, S43                                       | 49       | 40 ft 10/3: ~20                  | 1.15       | not set     |
| 22  | LT10 | Pendant light                            | Kitchen islands, dining                                      | S01, cable, S03×2, S04, **S50**, S11                                                  | 31       | 20 ft 14/2: ~10                  | 0.68       | not set     |
| 23  | MH1  | HVAC condenser disconnect + whip         | Every house with central air                                 | S44, cable, S03×2, S45, S46, S47, S30, S31, S33                                       | 61       | 35 ft 10/2: ~17.5                | 1.31       | not set     |
| 24  | RS12 | EV charger circuit, 48A hardwired        | Growing fast; a big-ticket call                              | **S55**, cable, S41×2, **S56**, S30, S31, S33                                         | 68       | 40 ft 4/3: ~36 ⚑                 | 1.73       | not set     |
| 25  | RS13 | EV / RV receptacle, 50A (NEMA 14-50)     | The cheaper EV option, and RVs                               | S12, cable, S41×2, S42, S10, S40, S30, S31, S33, **S51**, S11                         | 45       | 40 ft 6/3: ~36                   | 1.35       | not set     |
| 26  | PG3  | Service upgrade 200A, meter-main outdoor | Most common service upgrade on older houses                  | **S61, S62**, cable, **S63×2, S109, S64×2, S65, S66, S67, S68**                       | 250 ⚑    | 10 ft SER + 30 ft #4 bare: ~30 ⚑ | 4.67       | not set     |
| 27  | PG2  | Service upgrade 200A, overhead           | The other common upgrade — full meter and panel swap         | **S69, S61, S71, S72, S62, S70, S73, S74×20, S64×2, S65, S66, S67, S68**              | 515 ⚑    | 30 ft #4 bare: ~15               | 8.83       | not set     |
| 28  | RS18 | Generator inlet and interlock            | Asked for after every big storm                              | **S59**, cable, S41×2, S45, **S60**, S30, S31, S33, **S58**                           | 96       | 25 ft 10/3: ~12.5                | 1.81       | not set     |
| 29  | PG19 | Standby generator hookup                 | Big job when it comes; feeders traced separately             | **S103, S104, S105, S106, S64, S65, S107, S108**                                      | 210 ⚑    | 30 ft 18/4: ~6 ⚑                 | 3.60       | not set     |
| 30  | PG9  | Breaker swap to AFCI/GFCI                | Every remodel and inspection fix                             | S30, **S57**, S31, **S51**, S11                                                       | 12       | none                             | 0.20       | not set     |

New steps in **bold**. Rough cable rates I had to invent for this table,
all ⚑: **4/3 NM** at the #8-and-up rate (it is heavier still — 1.0+ min/ft
would be fair), **4/0 SER at 1.5 min per ft**, **control wire at 0.2 min per
ft**, **bare #4 at the NM rate**.

**The two services want the most overhead of anything here.** The steps are
the hands-on work; permit, utility coordination, the inspection visit and
the cleanup of a full panel swap are not in them. Start the overhead at
2 h on PG2 and 1.5 h on PG3 and adjust.

**Close but not in the 30:** replace receptacle like-for-like (DR16),
old-work receptacle (DV6), panel replacement like-for-like (PG4), 100A
subpanel (PG5 — it was #26 until the 4" wafer took its place), wall sconce
(LT13), porch light (LT15), water heater (RS3), over-range microwave
(CK18). Swap any of them in and the step list is quick to write.

## 6. Top 30 COMMERCIAL

**How they were picked:** Track B's list in `top-assemblies-draft.md` § 1,
aimed at the small commercial and retail work you do (Dollar Tree remodels,
office TI, lighting retrofits, panel work). Lighting and the MC device
boxes lead because a store or office is mostly that; then the demo and
retrofit items, which every remodel is full of; then the one-per-job items
(panel, sign, RTU) that are always there and always expensive.

Both lists here are Track B's 30, in Track B's order, unchanged. (The 15
commercial step lists already in the app took PG7 from #23 and skipped DR1
at #13; both are here now.)

| #   | Ref  | Assembly                                         | Why it made the cut                            | Steps                                                          | Step min | + cable (rough)              | Hands-on h | Typed today |
| --- | ---- | ------------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------- | -------- | ---------------------------- | ---------- | ----------- |
| 1   | LT19 | 2x4 LED troffer, lay-in                          | The most-counted thing on any office or store  | S20, S21×2, S22×4, S23, S11                                    | 29       | whip is in S23               | 0.48       | not set     |
| 2   | DV20 | Duplex receptacle, MC                            | Every wall                                     | S12, S13, cable, S14×2, S15, S05, S09, S10, S11                | 23       | 25 ft 12/2 MC: ~12.5         | 0.59       | not set     |
| 3   | DR7  | Troffer LED retrofit kit                         | Lighting retrofits are a whole job type        | S24, S11                                                       | 26       | none                         | 0.43       | not set     |
| 4   | DR8  | 4 ft fluorescent to LED, ballast bypass (2-lamp) | The cheaper retrofit; hundreds per store       | S25, S11                                                       | 26       | none                         | 0.43       | not set     |
| 5   | DV26 | Single-pole switch, MC                           | Every room                                     | S12, S13, cable, S14×2, S15, S05, S09, S10, S11                | 23       | 20 ft 12/2 MC: ~10           | 0.55       | not set     |
| 6   | LT28 | Emergency light / exit combo                     | Code — every exit path                         | S12, S13, cable, S14×2, S26                                    | 29       | 25 ft 12/2 MC: ~12.5         | 0.69       | not set     |
| 7   | LT27 | Exit sign                                        | Code — every exit                              | S12, S13, cable, S14×2, S26                                    | 29       | 25 ft 12/2 MC: ~12.5         | 0.69       | not set     |
| 8   | DR3  | Demo lay-in fixture, make safe above ceiling     | Every remodel starts with demo                 | S28, S10                                                       | 13       | none                         | 0.22       | not set     |
| 9   | MS2  | Junction box above lay-in ceiling                | Every fixture group and re-feed                | S21, S34, S15, S35, S10                                        | 13       | none                         | 0.22       | not set     |
| 10  | DV21 | GFCI receptacle, MC                              | Break rooms, restrooms, near sinks             | S12, S13, cable, S14×2, S15, S05, S07, S09, S10, S11           | 26       | 25 ft 12/2 MC: ~12.5         | 0.64       | not set     |
| 11  | LT20 | 2x2 LED troffer, lay-in                          | Offices and corridors                          | S20, S21×2, S22×4, S23, S11                                    | 29       | whip is in S23               | 0.48       | not set     |
| 12  | DV29 | Wall occupancy sensor, MC                        | Energy code — offices, restrooms, storage      | S12, S13, cable, S14×2, S15, S05, S08, S09, S10, S11           | 25       | 20 ft 12/2 MC: ~10           | 0.58       | not set     |
| 13  | DR1  | Demo fixture, blank the box                      | Every remodel; resi too                        | S28, S10                                                       | 13       | none                         | 0.22       | not set     |
| 14  | DR2  | Demo device, blank plate                         | Every remodel; resi too                        | S29                                                            | 5        | none                         | 0.08       | not set     |
| 15  | LT22 | 4 ft LED strip, surface / suspended              | Back rooms, storage, open ceilings             | S27, S21×2, S23, S11                                           | 32       | whip is in S23               | 0.53       | not set     |
| 16  | DR5  | Relocate lay-in troffer (≤6 ft)                  | Every TI re-layout                             | S28, **S75**, S20, S21×2, S22×4, S23, S11                      | 44       | whip is in S23               | 0.73       | not set     |
| 17  | DV23 | Dedicated 20A receptacle, MC                     | Copiers, break-room appliances, POS            | S12, S13, cable, S14×2, S15, S05, S09, S10, S11, S30, S31, S32 | 35       | 40 ft 12/2 MC: ~20           | 0.92       | not set     |
| 18  | DR15 | Replace exit / emergency light                   | Failed units on every service call and remodel | **S76**, S26                                                   | 23       | none                         | 0.38       | not set     |
| 19  | LT29 | Exterior wall pack                               | Every building's back and sides                | **S77, S78**, S11                                              | 41 ⚑     | conduit is a traced run      | 0.68       | not set     |
| 20  | DV30 | Ceiling occupancy sensor + power pack            | Energy code in open areas                      | **S79**, S13, cable, S14×2, S15, **S80, S81, S82**             | 39       | 10 ft MC + 25 ft 18/3: ~10 ⚑ | 0.82       | not set     |
| 21  | DV31 | 0-10V dimmer, MC                                 | Every LED office with dimming                  | S12, S13, cable, S14×2, S15, S05, S08, **S81**, S09, S10, S11  | 31       | 20 ft MC + 25 ft 18/2: ~15 ⚑ | 0.77       | not set     |
| 22  | DR4  | Demo circuit back to panel                       | Comes with nearly every demo                   | S30, **S83**, S10, **S84**                                     | 13       | none                         | 0.22       | not set     |
| 23  | PG7  | Breaker add, single-pole                         | Every new circuit                              | S30, S31, S32                                                  | 12       | none                         | 0.20       | not set     |
| 24  | MS6  | Data drop, Cat6 (commercial)                     | Often in an office TI scope                    | **S85, S86×3**, cable, **S87, S88, S89**                       | 31       | 150 ft Cat6: ~22.5 ⚑         | 0.89       | not set     |
| 25  | LT23 | 8 ft LED strip (sales floor rows)                | Retail sales floors                            | **S90, S91×2**, S23, S11                                       | 41       | whip is in S23               | 0.68       | not set     |
| 26  | DV22 | Quad receptacle, MC                              | Desks, counters, workrooms                     | S12, S13, cable, S14×2, S15×2, S05×2, S09×2, S10, S11×2        | 31       | 25 ft 12/2 MC: ~12.5         | 0.72       | not set     |
| 27  | DR17 | Replace receptacle with GFCI                     | Every inspection punch list                    | **S92**, S05, S07, S09, S10, S11                               | 15       | none                         | 0.25       | not set     |
| 28  | PG13 | Panelboard 225A 3-phase, main breaker            | One per store or suite; big labor              | **S93, S94, S95, S96**, S68                                    | 143 ⚑    | feeder is a traced run       | 2.38       | not set     |
| 29  | CS1  | Sign circuit and disconnect                      | Every storefront                               | S30, S31, S32, S44, S45, **S97, S98, S99**, S47                | 69 ⚑     | the wire is in S98           | 1.15       | not set     |
| 30  | MH5  | Rooftop unit (RTU) hookup                        | Every commercial roof                          | **S100, S101, S97, S98×2**, S45, **S102**, S47                 | 97 ⚑     | the wire is in S98           | 1.62       | not set     |

New steps in **bold**. Rough cable rates I had to invent, all ⚑: **Cat6 at
0.15 min per ft** (one cable pulled through J-hooks), **control wire at 0.2
min per ft**.

**Things to check on these:**

- **LT23 has both support wire and aircraft cable in its recipe** (owner,
  2026-10-09: the estimator deletes whichever the job doesn't use). The steps
  use the aircraft-cable kit (S91×2) for an open sales floor. Under a grid,
  swap S91×2 for S21×2 (12 min becomes 8).
- **PG13 counts the panel itself.** The breakers are PG7 lines and the
  feeder is a traced run, so neither is in its steps.
- **CS1 and MH5 assume the sign and the unit are by others.** CS1 has no
  lift time; on most storefronts the sign connection is on a lift.
- **MS6:** if data is by others on your jobs, drop it from the list.

**Close but not in the 30:** replace receptacle like-for-like (DR16), replace
switch with occupancy sensor (DR18), isolated-ground receptacle at the cash
wrap (DV24), floor poke-through (DV32), 2-pole breaker add (PG8), track
light (LT30).

## 7. Every flag in one place (⚑)

Where I'd look first, most money first:

1. **Services (PG2, PG3) and the standby generator (PG19).** The most
   variable work on the list. Steps are hands-on only; the overhead has to
   carry permit, utility, inspection and cleanup. PG2 assumes **20 circuits
   to re-land** — that count belongs to the job.
2. **The ground rod (S64, 20 min)** assumes normal soil and a hammer drill.
3. **S33 for #4 (the EV charger)** — 9 min is light for #4. And **4/3 NM**
   pulls harder than my #8 rate.
4. **The roof (S38 bath fan cap, S71 service mast, S101 RTU boot)** — single
   storey, walkable. Some roofs belong to the roofer; delete the step then.
5. **Height and lifts (S77/S78 wall pack, S99 sign, S90 8 ft strip)** — no
   lift time anywhere. Over 10–14 ft is the height modifier.
6. **Things others often do (S52 dishwasher, S54 hood, S103 pad, S108
   generator start-up)** — each says what it assumes; delete or add.
7. **S16 wafer (8 → 10) and S44 outdoor disconnect (15 → 20)** — the two
   I rounded up from the older draft.
8. **S25 ballast bypass and S50 pendant height** — left high on purpose.
9. **PG3's recipe has no ground bar kit** for turning the inside panel into
   a subpanel (S109). Worth adding the part.

## 8. What happens next (for the tracks, not for you)

Nothing here is loaded. **Local-dev is frozen until the live release.**

- **Your part:** mark this up. For S01–S47, type your minutes straight into
  the yellow column on the Steps tab whenever you like — it carries over.
- **Track C, after the release:** add S48–S109 and the 30 new step lists
  (§ 5 rows 7, 15–19, 21–22, 24–30 and § 6 rows 13, 16–22, 24–30) to
  `server/seed/starterLaborSteps.ts`; rename S07 and S42 if you agree (steps
  are matched by key, so a rename moves no number). Every new step ships
  **not set**, like the first 47, until a minute is typed.
- **Track A:** one sheet rebuild so the new steps and starters appear on the
  Steps and Step totals tabs, carrying over anything you've typed.
- **No bid moves from any of this.** Steps price nothing until every step on
  an assembly has a time and its cable has hours per foot, and existing bid
  lines are frozen at the hours they were added with.
