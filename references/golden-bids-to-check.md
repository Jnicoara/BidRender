# Golden bids — the list to check with a calculator

Track A, 2026-10-15. Every number below is what the code **computed**; none
has been checked by hand yet. Each bid in `server/fixtures/goldenBids.json`
says `"checked": "computed, NOT hand-checked yet"` until somebody has.

**How to use this:** work down one bid, redo each line with a calculator, and
tick it. A bid that checks out gets its `checked` note changed to
`"hand-checked YYYY-MM-DD by <who>"` in the JSON (that note may be edited by
hand — the Gate hashes only the numbers). **A number that does not check out
is a bug in the app, not in this list: do not update the golden file to match
— tell Track A which line.**

The harness: `server/goldenBids.test.ts` builds the bids through the real
routers; `server/goldenBids.ts` explains the comparison. Any number that
moves fails the Gate. To change one on purpose:
`GOLDEN_UPDATE_REASON="why" pnpm vitest run server/goldenBids.test.ts`, then
commit the file; the reason is kept in its `history`.

Rules used everywhere: **direct cost = material + labor**; labor = hours ×
quantity × rate; money rounds to the cent per line.

---

## 1. `counts` — 7 counted receptacles + 12 troffers added by hand

Rate: journeyman $62/h. Receptacle assembly = box $0.89 + receptacle $1.64 +
plate $0.47 = **$3.00**, 0.15 h. Troffer assembly = troffer $68.50, 0.25 h.

| Line                          | Qty | Material                | Hours                | Labor $               | Direct       |
| ----------------------------- | --- | ----------------------- | -------------------- | --------------------- | ------------ |
| Receptacle (counted on plans) | 7   | 7 × 3.00 = **21.00**    | 7 × 0.15 = **1.05**  | 1.05 × 62 = **65.10** | **86.10**    |
| Troffer (added by hand)       | 12  | 12 × 68.50 = **822.00** | 12 × 0.25 = **3.00** | **186.00**            | **1,008.00** |

- [ ] Total due **$1,094.10** (no overhead, profit or tax on this company). Hours 4.05.

## 2. `homerun` — one 100 ft 1/2" EMT homerun, 2 #12 + ground

Prices: EMT $0.85/ft, 0.04 h/ft; #12 $0.21/ft, 0.006 h/ft; #12 green
$0.19/ft, 0.006 h/ft; coupling $0.42, connector $0.37, strap $0.11.

| Line           | Qty                          | Material | Hours | Labor $ | Direct     |
| -------------- | ---------------------------- | -------- | ----- | ------- | ---------- |
| EMT            | 100 ft                       | 85.00    | 4.00  | 248.00  | **333.00** |
| #12 conductors | 200 ft (2 × 100)             | 42.00    | 1.20  | 74.40   | **116.40** |
| #12 ground     | 100 ft                       | 19.00    | 0.60  | 37.20   | **56.20**  |
| Couplings      | 9 (10 ft sticks over 100 ft) | 3.78     | 0     | 0       | **3.78**   |
| Connectors     | 2 (one each end)             | 0.74     | 0     | 0       | **0.74**   |
| Straps         | 11                           | 1.21     | 0     | 0       | **1.21**   |

- [ ] Total due **$511.33**. Hours 5.80.
- [ ] **Question to check, not a calculation:** the fittings carry **0 hours**
      although the test gave them hours (connector 0.05 h). The code treats
      fitting labor as inside the EMT's per-foot hours (`laborInRunRate`).
      Is that how you price it? If not, this is a pricing bug.
- [ ] Is **11 straps** right for 100 ft (the strap spacing rule)?

## 3. `drops` — 60 ft run + 4 receptacles with drops, run height 10'-0"

Same prices as bid 2; receptacle assembly as bid 1. Receptacles mount at
1'-6", so each drop is 10'-0" − 1'-6" = **8.5 ft**.

| Line       | Qty                      | Material | Hours | Labor $ | Direct     |
| ---------- | ------------------------ | -------- | ----- | ------- | ---------- |
| Receptacle | 4                        | 12.00    | 0.60  | 37.20   | **49.20**  |
| EMT        | 60 + 4 × 8.5 = **94 ft** | 79.90    | 3.76  | 233.12  | **313.02** |
| Couplings  | 5                        | 2.10     | 0     | 0       | **2.10**   |
| Connectors | 2                        | 0.74     | 0     | 0       | **0.74**   |
| Straps     | 7                        | 0.77     | 0     | 0       | **0.77**   |

- [ ] Total due **$365.83**. Hours 4.36.
- [ ] Couplings and straps are counted on the 60 ft run only, not the 34 ft
      of drops. Right?

## 4. `remove-relocate` — 3 new, 5 removed, 2 relocated

Receptacle assembly as bid 1. Remove hours: the count's own **0.25 h** (it
beats the assembly's 0.2). Relocate hours: the assembly's **0.6 h**.

| Line                        | Qty | Material       | Hours | Labor $ | Direct    |
| --------------------------- | --- | -------------- | ----- | ------- | --------- |
| Receptacle (new marks only) | 3   | 9.00           | 0.45  | 27.90   | **36.90** |
| Remove …                    | 5   | 0 (labor only) | 1.25  | 77.50   | **77.50** |
| Relocate …                  | 2   | 0 (labor only) | 1.20  | 74.40   | **74.40** |

- [ ] Total due **$188.80**. Hours 2.90.

## 5. `scope-tags` — four receptacle lines of 10, 11, 12, 13

| Line | Tag             | Material | Labor           | Direct     |
| ---- | --------------- | -------- | --------------- | ---------- |
| 10   | We install      | 30.00    | 1.50 h → 93.00  | **123.00** |
| 11   | Owner furnished | **0**    | 1.65 h → 102.30 | **102.30** |
| 12   | By others       | 0        | 0               | **0**      |
| 13   | Excluded        | 0        | 0               | **0**      |

- [ ] Total due **$225.30**. Hours 3.15.

## 6. `labor-only` — 8 × labor-only assembly + 2 × parts-less, not ticked

| Line                                   | Qty | Hours        | Rate       | Direct     |
| -------------------------------------- | --- | ------------ | ---------- | ---------- |
| Trace and tag (ticked Labor only)      | 8   | 8 × 1.5 = 12 | helper $38 | **456.00** |
| Light pole, set (NOT ticked, no parts) | 2   | 2 × 6 = 12   | $62        | **744.00** |

- [ ] Total **$1,200.00**, and the bid says **1 part not priced** — the light
      pole's missing material. The ticked line says nothing.

## 7. `free-count` — 14 fixtures priced by hand, 3 exit signs blank

| Line                                    | Qty | Material | Hours | Labor $  | Direct         |
| --------------------------------------- | --- | -------- | ----- | -------- | -------------- |
| Type F1 fixture ($212.40, 1.25 h typed) | 14  | 2,973.60 | 17.5  | 1,085.00 | **4,058.60**   |
| Type X exit sign (nothing typed)        | 3   | —        | —     | —        | **not priced** |

- [ ] Total **$4,058.60**, and the bid says **1 line not priced**.

## 8. `op-and-tax` — overhead, profit, productivity, markup, tax, expenses

Company: overhead 12%, profit 15% markup, productivity +5%, material markup
10%, journeyman $71.50. Tax area 6.25% + 1.75% = **8%**, on materials only,
on the selling price. Expenses: permit $185 (not taxed, not marked up), lift
rental $420 (taxed, marked up). Bid moved to **Active**, so its settings froze.

Lines (hours × 1.05 for productivity):

| Line           | Qty    | Material | Markup 10% | Hours                    | Labor $ | Direct     |
| -------------- | ------ | -------- | ---------- | ------------------------ | ------- | ---------- |
| Receptacle     | 9      | 27.00    | 2.70       | 9 × 0.15 × 1.05 = 1.4175 | 101.35  | **128.35** |
| EMT            | 85 ft  | 72.25    | 7.23       | 85 × 0.04 × 1.05 = 3.57  | 255.26  | **327.51** |
| #12 conductors | 170 ft | 35.70    | 3.57       | 1.071                    | 76.58   | **112.28** |
| #12 ground     | 85 ft  | 16.15    | 1.62       | 0.5355                   | 38.29   | **54.44**  |
| Couplings      | 8      | 3.36     | 0.34       | 0                        | 0       | **3.36**   |
| Connectors     | 2      | 0.74     | 0.07       | 0                        | 0       | **0.74**   |
| Straps         | 9      | 0.99     | 0.10       | 0                        | 0       | **0.99**   |

Roll-up:

- [ ] Lines direct 627.67 + lift 420 = **direct cost 1,047.67**
- [ ] - material markup 15.63 = **1,063.30**
- [ ] × 1.12 overhead (+127.60) = **1,190.90**
- [ ] × 1.15 profit (+178.64) = **1,369.54**
- [ ] - permit 185 = **subtotal 1,554.54**
- [ ] Lift as charged: 420 × 1.12 × 1.15 = **540.96**; expenses total 185 + 540.96 = **725.96**
- [ ] Taxable: materials at selling price (156.19 + 15.63) × 1.12 × 1.15 ≈ **221.31**, + lift **540.96** = **762.27**
- [ ] Tax 762.27 × 8% = **60.98**
- [ ] **Total due 1,615.52**
- [ ] Check the bid really froze: overhead, profit and productivity all say
      "bid" as their source.

---

## Not covered yet — and why

- **Quoted lines.** The columns exist (`isQuoteItem`, `quoteId`,
  `bidUnitCost`, `quotedMarkupPct`), but no screen or router writes them and
  pricing ignores them (`db.ts` loads `quotedLinePct: null`). A golden quoted
  line would pin a feature that is not built. Add one when it is. A
  supplier's price typed onto a line is bid 7.
- **Wire extra and makeup** (`acceptExtraStarters`) and **material markup
  bands**: not on any golden bid yet. Next to add.
