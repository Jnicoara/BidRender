# Morning questions — overnight run 2026-10-14 → 15 (Track C)

One question per line: **the question → suggested answer. Why. What it
affects.** Answer "all yes" or list the ones you want different. Nothing
below has been applied: the name reviews are read-only, and anything that
changes a bid number or a starter waits for you.

Every EARLIER review (Conduit through Fasteners & Anchors) is fully
answered; the only open item there is Breakers Q9, which waits for the
brand-variants pass by design and needs nothing from you now.

## ⚠⚠ NIGHT 3 (2026-10-15 → 16) — WRONG NUMBERS FOUND, fixed on track-c, need your call on what is already saved

- **Q-DEF1 ⚠⚠ CHANGES BID MONEY (already saved data), the widest one** —
  Settings › Pricing read its boxes with `(Number(text) || 0) / 100`, so
  typing "15%" (or "1,5", or emptying the box) and leaving it saved the
  COMPANY profit / overhead / productivity as **0%**, said "Company
  default saved", and re-priced every Draft bid following it. Seen on
  screen (profit 15% → 0% from typing "15%"); fixed on track-c
  (`commitPercentEdit`: "15%" is 15, blank or a typo is refused and
  nothing moves). → **A runs a read-only list on live of companies whose
  default profit or overhead is exactly 0, for you to ask them about.**
  A 0 can be deliberate; nothing is changed automatically.
- **Q-CLOSE1 ⚠ CHANGES PERFORMANCE NUMBERS (already saved data)** — Job
  close-out recorded a BLANK total as 0 hours, and in "By assembly" every
  line left blank as 0 actual hours (seen on screen). Those zeros feed
  Performance (delivered margin reads too good) and the hour suggestions
  ("this assembly takes less time than you think"). Fixed on track-c: a
  blank total is refused, and By assembly needs every line ("…or use One
  total"); `closeout-blank-line-{before,after}.png`. → **A runs a
  read-only list on live of close-out lines at exactly 0 actual hours, for
  you to check with those shops.** A real 0 is possible but rare. (The
  hour SUGGESTIONS no longer learn from a 0 — three of them offered to set
  an assembly to 0 h; Performance totals still include them.)
- **Q-QTY1 ⚠ CHANGES BID MONEY (already saved data)** — Typing a decimal
  quantity KEY BY KEY into an assembly's material box, or a kit's assembly
  box, stored it 10× or 100× too big: "1.5" saved as **15**, "2.25" as
  **225** (the box dropped the dot as it was typed; pasting was fine).
  Seen on screen on the old build, both screens; fixed on track-c
  (`DraftNumberInput`; shots `assembly-qty-typed-2_25-{before,after}.png`,
  `kit-qty-typed-2_25-{before,after}.png`). The fix changes nothing
  already stored. **Should A run a READ-ONLY list on live of every
  company assembly line and kit item whose quantity is a whole number of
  10 or more, for you to eyeball?** → **Yes, list only, change nothing.**
  A shop's own fix is editing the assembly; bids already priced from a
  wrong one keep their frozen line until re-added. Shipped starters are
  not affected (they come from the seed files, not typing).
- **Q-QTY3 ⚠ WRONG NUMBER IN B'S FILE (not touched, listed for B)** — the
  run-type editor's extra % and makeup inches (`takeoff/RunTypePicker.tsx`
  `ExtraDraftField`) have the SAME dropped-dot fault: a typed 2.5 % extra
  saves as 25 %, which moves wire/conduit footage on every bid using that
  type. → **B fixes it next (same pattern as `DraftNumberInput`), and the
  same read-only list as Q-QTY1 for run types with a whole-number extra of
  10 or more.** Not seen on screen by C (B's screen); found by reading.
- **Q-TAX1 ⚠ CHANGES BID MONEY (already saved data)** — a tax area whose
  rate part was left BLANK was saved at 0 % (seen on screen; fixed on
  track-c, `tax-blank-rate-{before,after}.png`). → **A runs a read-only
  list on live of tax-area parts at exactly 0 %, for you to check.** A 0
  typed on purpose is fine; a blank that became 0 means bids in that area
  are missing that tax.
- **Q-MOD1 ⚠ CHANGES WHAT NEW BID LINES COUNT** — archiving a job condition
  (say "Working at height +50%") stops it applying to NEW bid lines from
  every assembly that has it, silently; lines already on bids keep it.
  Measured: the same assembly added before and after the archive priced
  2 h × 1.5 then 2 h × 1.0. The editor now SAYS so ("Archived, so not
  applied to new bid lines" + "Take off this recipe";
  `archived-modifier-assembly-editor-{before,after}.png`). → **Keep it
  (archive = retired, stop using it)** — but you may prefer "keep applying
  until taken off the recipe". Affects: labor hours on new lines only.
- **Q-IMP1 (money, low urgency — the import is hidden)** — a price list that
  names one material twice at DIFFERENT prices: the last row wins (pinned
  by `supplierPricing.test.ts`, "the last price stands"). It used to win
  silently and count the material twice; it now says "named at two prices
  — the last was used: $3 / $4 → $4" and counts once. → **Refuse that
  material instead (change nothing, list it)** — a guessed price is the
  thing this app avoids. Affects: which supplier price is stored when a
  sheet contradicts itself.
- **Q-QTY2** — same bug, assembly WORK STEPS "How many" box (×N): fixed by
  the same component; not shown on screen (needs a work step set up) —
  unit-tested only. → **Nothing to decide**; noted so you know it was
  the same fault.

## ⚠ AT THE TOP — these change a starter or what a bid line counts

0. ⚠ **CHANGES BID MONEY (a new feature, not built)** — "Copy this bid" (competitors all have it): when a bid is copied, should the copy be re-priced at **today's** library prices, or keep the **original's frozen** prices? → **Re-price at today's** — a copy is a new bid, and last year's numbers on it would be a quiet wrong price. Affects: what every copied bid totals. Sketch: `references/overnight-parked.md` P4.
1. ⚠ **STARTER EDIT** — Equipment Q1: in PG19 (standby generator hookup), swap the `Generator battery charger` line for a new `Generator battery, 12V Group 26R` row? → **Yes.** The generator ships with a charger built in, so PG19 prices a part already in the box and leaves out the battery. Affects: PG19's lines; adds one COMMON row (Platt, Generac 0H3421S). A confirms on a current spec sheet first.
2. ⚠ **STARTER EDIT** — Distribution Q15: rename the poke-throughs to `4" poke-through, dual service, prewired duplex` / `4" poke-through, 2 prewired duplex`, and take the separate `20A duplex receptacle` line out of DV32? → **Yes.** The prewired unit already includes its receptacle, so DV32 prices one receptacle too many. Affects: DV32 loses one line.
3. ⚠ **CHANGES WHAT A LINE COUNTS** — Equipment Q11: make `EVSE pedestal` the charger on its pedestal, `Level 2 EV charger, pedestal mount, commercial`? → **Yes.** It is CW2's only equipment line, so as a bare mount CW2 "Commercial Level 2 EV charger" has no charger in it. Affects: what CW2's one line is priced from (no line added or removed). The other choice — keep it a mount and add a charger line — is a starter edit.
4. ⚠ **LINES WILL SAY "NOT PRICED"** — Distribution Q12: `Hood suppression micro-switch` gets no Example price, described "Specialty - price from your supplier."? → **Yes.** It comes from the hood-suppression contractor and is at none of the three stores. Affects: CS15's line reads "Not priced" until you type a price — true rather than made up.
5. ⚠ **LINES WILL SAY "NOT PRICED"** — Distribution Q13: `Furniture feed connector` and both `Modular furniture whip` rows get no Example price, Specialty description? → **Yes.** Each fits one furniture maker's system; none is at the three stores. Affects: CS10's line reads "Not priced".
6. ⚠ **MAY BECOME A STARTER EDIT** — Distribution Q14: `Tele-power pole, 10 ft, 2 duplex receptacles` (CS9), the 15 ft one, and `Power pole fitting kit` → `Power pole accessory pack, trim plates and hanger clamp`? → **Yes.** All three are at Platt (Wiremold). Affects: if A finds the pole already ships with the trim pack, A stops and asks before pricing CS9 (the pack would be counted twice).
7. ⚠ **CHANGES WHAT A LINE IS PRICED FROM** — Equipment Q7: rename `Dishwasher whip` to `Dishwasher power cord kit, 5 ft`? → **Yes.** It is the only product for this job at the three stores (HD Everbilt 98250). Affects: RS4's line is priced from a cord kit; a shop that hardwires deletes the line on the job.
8. ⚠ **PRICE PER FOOT** — Distribution Q6: rename the four cable-tray rows (aluminum, 4" deep, 9" rungs; bend; tee; wall bracket) and price the tray per foot as the 12 ft section ÷ 12? → **Yes.** Platt sells 12 ft sections. Affects: the per-foot tray number (no starter uses tray).
9. ⚠ **NO EXAMPLE PRICE** — Distribution Q1: `Busway`, `Busway elbow`, the 400/600/800A switchboards and the unsized `208V 3-phase panelboard` get no Example price (Specialty description; the 208V row keeps its own note)? → **Yes.** Each is quoted per job. Affects: any bid using them says "Not priced" until the supplier's number is typed (no starter uses them).

## Equipment & Appliances (`equipment-appliances-name-review.md`, rows 1582–1646)

(Q1, Q7 and Q11 are at the top.)

- Q2: `30A 6-circuit manual transfer switch, switch only`, drop "10" and "inlet" from its search words? → **Yes.** CW10 already counts the inlet and cord, so the price must be the switch alone. Affects: the name and search.
- Q3: `Attic fan, gable mount, 1300 CFM`, drop "whole house" and "thermostat"? → **Yes.** The common gable fan at HD; roof-mount is another product. Affects: RS20's priced product.
- Q4: `Baseboard heater, 1500W 240V, 6 ft` and `Baseboard heater thermostat, line voltage, double-pole, wall mount`? → **Yes.** Cadet at HD and Platt. Affects: the two names.
- Q5: `Bath exhaust fan, heater/light combo, 80 CFM, 1300W` and `Bath exhaust fan, LED light combo, 80 CFM`, drop "humidity" from the four sized fans? → **Yes.** Matches RS7's 80 CFM fan (Broan at HD). Affects: names and search.
- Q6: `Cord reel, 12/3, 50 ft, ceiling mount`? → **Yes.** The common shop reel (HD). Affects: the name; no starter.
- Q8: `Doorbell transformer, 16V 30VA`? → **Yes.** Runs a chime and a video doorbell, so RS10 and RS11 can share it. Affects: the name.
- Q9: `Dryer cord, 3-wire, 30A, 6 ft`, `Dryer cord, 4-wire, 30A, 6 ft`, `Range cord, 3-wire, 50A, 6 ft`? → **Yes.** All three at HD; matches the existing 4-wire range cord. Affects: names.
- Q10: `32A EV charger, plug-in, NEMA 14-50`, `40A EV charger, plug-in, NEMA 14-50`, `48A EV charger, hardwired`, drop "tesla"? → **Yes.** 48A must be hardwired (what RS12 says). Affects: names and search.
- Q12: `Floor heating mat, 120V, 30 sq ft, mat only`? → **Yes.** CK22 counts its own thermostat, so the mat is priced without one. Affects: the name.
- Q13: `Foil duct tape, 1.89" x 50 yd` and `6" inline duct fan, 240 CFM`? → **Yes.** Common at HD; no starter uses them. Affects: names.
- Q14: `Garbage disposal cord kit, 3 ft`? → **Yes.** The kit at HD. Affects: the name.
- Q15: `30A generator cord, L14-30, 25 ft`; `50A generator cord, 14-50P to CS6364, 25 ft`; `30A power inlet box, L14-30`; `50A power inlet box, CS6375`? → **Yes.** Each cord now plugs into its inlet. Affects: names; A confirms the PB50 connector (Platt's pages disagree).
- Q16: Keep one `Generator interlock kit, 150–225A main`, described "Fits one panel family - match the panel's brand and series"? → **Yes, for now.** Brand variants here would widen the panels-and-breakers brand rule. Affects: name and description.
- Q17: `Generator pad, 54" x 31" x 3", 9–26 kW air-cooled`? → **Yes.** Generac's standard pad (Platt). Affects: the name.
- Q18: Retire `Pump control relay`? → **Yes (hide, never delete).** Names no one product; no starter uses it. Affects: it leaves the pickers.
- Q19: `Range hood, 30" under-cabinet, ducted`, drop "downdraft"? → **Yes.** The common hood (Broan at HD); RS6 keeps the line. Affects: the name.
- Q20: Keep `Replacement fan grille`, described "Generic placeholder: a grille fits one fan model - price the one you buy"? → **Yes.** Useful on a service call; no one price fits. Affects: description.
- Q21: `Snow melt controller, automatic, 120V`, and add M4 `Roof de-icing cable, 120V, 60 ft`? → **Yes.** Both at Platt. Affects: name; one new COMMON row.
- Q22: `Spa bonding lug, direct burial, #8 solid`? → **Yes.** RS14/RS15 bond with #8 solid. Affects: the name.
- Q23: `Well pump pressure switch, 40/60 psi` and `Submersible pump splice kit, heat shrink, #14-#10`? → **Yes.** The common setting and kit. Affects: names.
- Q24: `Whole-house surge protector, hardwired, 120/240V`? → **Yes.** Keeps it apart from the breaker-style SPD. Affects: the name.
- Q25: Add M2 `AC whip, 1/2" x 6 ft liquidtight, #10`, no starter change? → **Yes.** COMMON at HD; swapping is the shop's call per job. Affects: one new row.
- Q26: Add M3 `Mechanical time switch, 24-hour, 240V 40A, indoor`? → **Yes.** COMMON (Intermatic T104). Affects: one new row.

## Distribution Equipment (`distribution-equipment-name-review.md`, rows 1647–1691)

(Q1, Q6, Q12, Q13, Q14 and Q15 are at the top.)

- Q2: `480V 3-phase panelboard` → `225A panelboard, 480Y/277V 3-phase main-lug, 42-space`, described "Complete: box, interior and cover"? → **Yes.** What Platt stocks; takes the accepted H1/H2 breakers. Affects: name and description.
- Q3: `30A 8-pole lighting contactor, electrically held, 120V coil, NEMA 1`, drop the placeholder note (CS2)? → **Yes.** The common enclosed one (Eaton at Platt). Affects: CS2's priced product.
- Q4: `Time clock, astronomic, 7-day, 1-circuit, 120–277V`, drop the note (CS2)? → **Yes.** Intermatic ET8015C. Affects: CS2's priced product.
- Q5: `200A automatic transfer switch, service-rated, NEMA 3R, 120/240V`, drop the note (PG19)? → **Yes.** The house-generator switch (Generac at Platt). Affects: PG19's priced product.
- Q7: `400A fused disconnect, NEMA 1, 240V` and `600A fused disconnect, NEMA 1, 240V`, moved to the Panels shelf? → **Yes.** Same pattern as the smaller disconnects. Affects: names and shelf (ids kept).
- Q8: `Motor starter, size {0,1,2}, NEMA 1, 120V coil` and `Combination motor starter, size 1, fusible, NEMA 1, 120V coil` (MH10)? → **Yes.** Enclosure and coil set the price as much as size. Affects: names.
- Q9: `Current transformer cabinet` → `CT cabinet, 48" x 36" x 11", NEMA 3R`? → **Yes.** The common Milbank size. Affects: the name.
- Q10: `Panel-mount surge protective device, Type 2, 208Y/120V 3-phase, 50 kA`, drop the note (PG18)? → **Yes.** PG18 feeds it from a 3-pole breaker. Affects: PG18's priced product.
- Q11: `Equipment shut-off relay, enclosed, 20A SPDT, dry-contact input` (CS15) and `Hood control interface relay, enclosed, 20A DPDT, 120V coil`, drop "suppression" from the first? → **Yes.** Both at Platt; stay two rows. Affects: names.
- Q16: Keep `Desk grommet outlet`, `Floor monument, 2-gang`, `Raised floor box` with no Example price and the Specialty description; drop "pop up"? → **Yes.** Countable, not one product at the three stores. Affects: price blank; no starter.
- Q17: Wireway renames (`4x4 wireway coupling`, `4x4 wireway elbow, 90-degree`, `4x4 / 6x6 wireway, 5 ft, NEMA 1, hinged cover`) and add M1–M4 (closure plates, 6x6 coupling and elbow)? → **Yes.** A coupling fits one size; a run needs end plates. Affects: names; four new COMMON rows.
- Q18: Add M5 `Cable tray splice plates, 12" ladder, aluminum, 4" deep, pair`? → **Yes.** Every tray joint takes a pair; SPECIALTY if A finds no part. Affects: one new row.
- Q19: Shelf moves — the four floor rows to Boxes, the seven furniture rows to Surface Raceway, the three hood parts to Equipment & Appliances? → **Yes.** None is distribution gear. Affects: the shelf only; ids and starters unchanged.

## Consumables (`consumables-name-review.md`, rows 1692–1719)

No starter edit. Q4, Q5 and Q7 rename rows a starter uses so the price is one tube or block, not a carton.

- Q1: `Electrical tape, black, 3/4" x 66 ft`, and `Phase tape, {colour}, 3/4" x 66 ft` for all 8 colours? → **Yes.** The full-size roll (HD, Platt). Affects: nine names.
- Q2: `Rubber splicing tape, 3/4" x 30 ft`? → **Yes.** The Scotch 23 roll. Affects: the name.
- Q3: `Mastic tape, 2" x 10 ft`, drop "pad"? → **Yes.** "Pad" is another row's name. Affects: name and search.
- Q4: `Duct seal, 1 lb`? → **Yes.** One block per condenser; a carton priced as one would be 10x high. Affects: the starter's priced product.
- Q5: `Firestop caulk, 10.1 oz tube`, drop "putty"? → **Yes.** A quarter tube per penetration is only right per tube. Affects: the starter's priced product.
- Q6: `Electrical putty pad, 7" x 7"`? → **Yes.** The size every maker sells. Affects: the name.
- Q7: `Silicone sealant, clear, 10.1 oz tube`? → **Yes.** The wall-pack starters take one tube each. Affects: the starters' priced product.
- Q8: `Expanding foam, gaps and cracks, 12 oz can`? → **Yes.** Keeps it apart from fire-block foam. Affects: the name.
- Q9: `PVC cement, gray, 8 oz`, drop "primer purple"? → **Yes.** Primer is a different product. Affects: name and search.
- Q10: `Pulling lube, 1 qt`? → **Yes.** The common bottle; a gallon is another price. Affects: the name.
- Q11: `Anti-oxidant compound, 4 oz`? → **Yes.** The Noalox bottle. Affects: the name.
- Q12: `Underground splice kit, UF cable, 14-8 AWG`? → **Yes.** A checks whether Platt's price is one kit or six. Affects: the name.
- Q13: `Heat shrink tubing assortment, 160-piece`, drop "sleeve"? → **Yes.** One size can't cover the use. Affects: the name.
- Q14: `Thread seal tape (PTFE), 1/2" x 520"`, drop "pipe dope"? → **Yes.** One row can't be both. Affects: the name.
- Q15: `Wire pulling grip, 0.75"-0.99" cable`? → **Yes.** A grip holds one cable range. Affects: the name.
- Q16: Packs — keep `each` on every row except arc flash (pack of 5) and zip ties (bag of 100), which you already set? → **Yes.** Sold one at a time. Affects: packs.
- Q17: Add M1 `Wire marker booklet, 0-9`? → **Yes.** COMMON at HD. Affects: one new row.
- Q18: Add M2 `Zip ties, 14", bag of 100`? → **Yes.** COMMON at HD. Affects: one new row.

## From the overnight build work

Sketches and reasons: `references/overnight-parked.md`. None of these changes a bid number.

- P1 Slimmer Plans toolbar: one tool row on a laptop — scale shortened to a chip, Ceilings and the drop-heights warning moved to the right panel's "This sheet" line, Copy text into ⋯? → **Yes.** Saves a 36 px row on every visit; parked because two of the controls are Track B's and the warning must not get quieter. Affects: the Plans screen layout only.
- P2 Tablet: tap places, drag pans, pinch zooms already works — add one first-open tip on touch devices saying so ("Tap to drop a point · drag to move the sheet · pinch to zoom")? → **Yes, Track B adds it** (the tips are B's). Affects: one tip.
- P3 Sheet work tag: Track B built it as Not said / New work / Demo / "Demo and new". Rename the last to "Both"? → **No, keep "Demo and new"** — it also shows in banners where "Both" would not say both of what. Affects: one label.
- D1 (decided, reversible) Sign-in page tagline now matches the landing page: "Electrical estimating, built by an electrician" (was "Electrical estimating for the field"). Different words? → **Keep.** Affects: one line.
- D2 (decided, reversible) The Dashboard's help box now reads "Can't find something? Ask where it is — e.g. labor rates" with a "Find it" button (was a sample question and "Ask"). → **Keep.** Affects: wording.

- Q-PH1 Price history: "Reset to BidRidge's price" on a material is recorded as **typed** (the history's "how" kinds are typed / imported / import undone / starter accepted). Add a "reverted" kind? → **Yes, later** — it needs a one-word enum change from Track A (draft below); until then "typed" is true, a person did it. Affects: the history's wording only, never a price.
  Draft for A (additive, step 1): ``ALTER TABLE `material_price_history` MODIFY `source` enum('typed','imported','import_undone','starter_accepted','reverted') NOT NULL;``

- Q-PS6 Shipped pack sizes (wire 250 ft roll, box of 25, 10 ft stick …): the rule that reads them from the pricing sheet is built and checked on every row, but NOT written to any material, because Track A's rule says no pack size goes to shops until the pack list has been through your sheet. Has it? → **Tell A when you've checked the sheet's packs; then A sends them as an offer** (never at boot). Affects: which rows show the "or [pack price]" box; never a stored price.

- C1 Copy: the library says **"Starter"** and bid lines say **"Example price"** for the same thing (one labor row shows both). One word everywhere — **"Example"**? → **Yes, "Example"** — it is what the bid, the banner and the first-run screen already say. Affects: words only.
- C2 Copy: the Dashboard card says **"Quick bid"**, the bid's button says **"Count"**, the screen says "counting mode". One name — **"Count"**? → **Yes**, with the card reading "Count it — no plan needed". Affects: words only.
- C3 Copy: the demo bid is "example bid", "sample" and "the example job". One name — **"sample bid"**? → **Yes.** Affects: words only.
- C4 (decided overnight, reversible — built) Error toasts no longer show raw text: `errorText` keeps every message the server wrote for a person and replaces only "Failed to fetch", validation dumps and code-like internal errors. 96 sites done; the 67 on the Plans screen are Track B's file and left for B. Different wording? → **Keep.** Affects: error wording only.

(Items 6–11 add below.)

## From overnight run #2 (2026-10-14 → 15)

- Q-SEC1 Security: the seven legacy routers (`projects`, `masterItems`, `masterAssemblies`, `masterLaborRates`, `projectAssemblies`, `projectItems`, `bidSummary`) have no screen and no caller in the app, but anyone signed in can still reach them through the API — one of them let any user change other companies' rows (fixed tonight). **Unmount them** in their own commit? → **Yes.** Affects: nothing on screen; retires `server/v545.test.ts`. (`references/security-sweep.md`)
- Q-SEC2 (decided overnight, reversible — built) Only the **owner or an admin** may change the letterhead and proposal look; estimators now see them read-only. That is what the role list always said (`settings.edit`), but nothing enforced it. Keep? → **Keep.** Affects: who can edit Settings › Branding / proposal design.
- Q-SEC3 (decided overnight, reversible — built) **Sign-up limit: 10 new accounts an hour from one place, 100 an hour across the whole site.** A beta wave bigger than 100 an hour would be refused with "wait an hour". Raise the overall number before a launch? → **Keep 100 for beta.** Affects: sign-up only.
- Q-G1 Guide mode: switching the guide off is remembered **per browser** (like the step bar and B's Plans tips). Should it follow the person to every device? That needs one new nullable column on the account (Track A, additive). → **Not yet** — per browser is fine for beta. Affects: whether a person who turned it off on the laptop sees it again on their phone. (`references/guide-mode.md` G5)
- Q-AI1 The plan reader has no time limit of its own: against an AI service that hangs it would wait up to ~6 minutes (120 s × 3 tries) before saying it failed. "Find it" now gives up at 15 s. Give the plan reader a cap too — say **90 s, no retries**? → **Yes, after one timing of a real read on a big sheet** (a cap tighter than a real read would turn slow reads into failures). Affects: only how long a failed read takes to say so. (`references/stress-results.md`)
- Q-R1 Restoring a deleted material, assembly or client whose name has since been reused leaves TWO active items with the same name (creating one would be refused). Nothing breaks, but a picker shows both — possibly at different prices. On restore, add " (restored)" to the name when it clashes? → **Yes.** Affects: names only. (break-it, 2026-10-15)
- Q-DB1 (for A — database layer and hosting) **A database that stops answering can leave the app dead after it comes back.** Drilled locally (`references/stress-results.md`, "Third round"): after reads hang three times, all 10 pooled connections sit waiting for replies that never come, and the server stops answering every database read until it is restarted — while `/api/version` still says 200. On live the likely version is a failover or dropped network path leaving connections half-open: up to ~15 minutes dead after the database is fine. Two parts: (1) give pooled queries a time limit that DESTROYS the connection when it fires (mysql2's own `timeout` does not — it hands the connection back out of step), sparing the nightly backup's long reads; (2) check what App Platform's health check hits — if it never touches the database, add one that does, so a wedged instance gets restarted. → **Yes to both, A to build; check (2) first, it is one look at the app spec.** Affects: nothing in normal running; how fast the app comes back after a database fault.
- Q-AUTH1 (for A — server build) **Every sign-in stalls everybody's requests for a moment.** Passwords are checked with `bcryptjs` (pure JavaScript, cost 12) on the server's one main thread. Measured on the production build (`references/stress-results.md`, "Sign-in burst"): 11 sign-ins at once took 0.69 s, and an ordinary bid read sent during them waited **701 ms** instead of 42. Invisible at beta size; a lever for anyone wanting to slow the whole site (the per-sender limit is the spoofable one, A-S12). Fix without touching any stored hash: move hashing off the main thread — the native `bcrypt` package (compiled; App Platform must build it) or `bcryptjs` in a 2-thread worker pool (a second esbuild entry). → **Worker pool, after A-S12; not urgent before more users.** Affects: nothing a person sees, except no stall during sign-ins.
