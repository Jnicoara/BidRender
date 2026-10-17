# Morning answers — Track C, 2026-10-15

One line each: the question in plain words → what I recommend, and why.
Reply "all yes", or list the numbers you want different. Full wording and
detail: `pricing/morning-questions.md` (top block and "From overnight run
#2"). Nothing here has been applied.

## These change what a bid totals

1. **Copy this bid (top 0):** when a bid is copied, should the copy use today's library prices or keep the old frozen ones? → **Today's prices.** A copy is a new bid; last year's numbers on it would be a quiet wrong price.
2. **PG19 generator hookup (top 1):** swap the "battery charger" line for a "12V Group 26R battery"? → **Yes.** The generator already has a charger built in, so today PG19 prices a part that's in the box and misses the battery.
3. **DV32 poke-throughs (top 2):** rename them as "prewired duplex" and take out DV32's separate receptacle line? → **Yes.** The prewired unit includes the receptacle, so DV32 currently counts one receptacle too many.
4. **CW2 EV charger (top 3):** make "EVSE pedestal" the charger _on_ its pedestal? → **Yes.** It's CW2's only equipment line; as a bare mount, the "EV charger" assembly has no charger in it.
5. **RS4 dishwasher (top 7):** rename "Dishwasher whip" to "Dishwasher power cord kit, 5 ft"? → **Yes.** It's the only product for this job at the three stores; a shop that hardwires deletes the line on that job.
6. **Cable tray (top 8):** rename the four tray rows and price tray per foot as a 12 ft section ÷ 12? → **Yes.** Platt sells 12 ft sections, and no starter uses tray, so no starter's total moves.

## These make a line say "Not priced" instead of guessing

7. **Hood suppression micro-switch (top 4):** no example price, marked "Specialty — price from your supplier"? → **Yes.** It comes from the hood-suppression contractor; CS15's line says "Not priced" until a real price is typed.
8. **Furniture feed connector and whips (top 5):** no example price, Specialty? → **Yes.** Each fits one furniture maker's system; CS10's line says "Not priced" until typed.
9. **Busway, switchboards, 208V panelboard (top 9):** no example price, Specialty? → **Yes.** Each is quoted per job, and no starter uses them.
10. **Power poles and accessory pack (top 6):** rename the two poles and the "fitting kit" to an "accessory pack"? → **Yes.** All three are at Platt. A stops and asks if the pole turns out to ship with the pack already (it would be counted twice).

## Tonight's eight — none changes a bid number

11. **Q-AI1, plan reader time limit:** give the AI plan reader a 90-second cap with no retries (today it can wait ~6 minutes before saying it failed)? → **Yes, after one timing of a real read on a big sheet,** so the cap isn't tighter than a normal slow read.
12. **Q-R1, restored name clash:** when restoring something whose name was reused since, add " (restored)" to its name? → **Yes.** Otherwise a picker shows two identical names, possibly at different prices.
13. **Q-SEC1, old unused routes:** switch off the seven legacy API routes that have no screen? → **Yes, in their own commit.** One of them let any user change another company's rows (fixed); nothing uses them.
14. **Q-SEC2, who edits the letterhead:** only owners and admins may change branding and proposal design; estimators see them read-only? → **Keep.** That's what the role list always said; it just wasn't enforced.
15. **Q-SEC3, sign-up limit:** 10 new accounts an hour from one place, 100 an hour site-wide? → **Keep 100 for beta;** raise it before a public launch.
16. **Q-G1, guide off on every device:** remember "guide off" per person instead of per browser? → **Not yet.** Per browser is fine for beta; per person needs a new column (Track A).
17. **Q-DB1 (Track A), stuck database connections:** if the database stops answering, the server can stay stuck after it comes back, until restarted — make stuck connections get thrown away, and make the hosting health check touch the database? → **Yes to both; check the health check first** (one look at the app spec).
18. **Q-AUTH1 (Track A), sign-ins slowing everyone:** move password checking off the server's main thread (11 sign-ins at once stall other requests ~0.7 s)? → **Yes, a small worker pool, after the sender-limit fix (A-S12).** Not urgent at beta size; no stored password changes.
