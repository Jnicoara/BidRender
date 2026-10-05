# Questions for the owner — one at a time

Started 2026-10-05 by Track A. **Answer the top open one.** Each has a
recommended answer; "yes" means take the recommendation. When a question is
answered, write the answer and the date under it and move to the next. The
work each answer unblocks is named, so nothing waits on a question nobody
asked.

Where each question came from is listed under it, so an answer can be
recorded there as well (CLAUDE.md § "Where decisions live": a decision that
overrides an old one is written down in BOTH places).

---

## 1. Breakers: "1-Pole" or "Single-Pole"? — OPEN

**The question.** When a breaker is one pole, should its name say
**"20A 1-Pole breaker"** or **"20A Single-Pole breaker"** (what it says today)?

**Why it is asked again.** On 2026-10-01 you said "1-Pole everywhere". But on
2026-09-24 the app was deliberately changed to "Single-Pole", and a test and
two documents say so. Before reversing a recorded decision, we confirm it once.

**What it changes.** Names only — no price and no quantity moves. Old names
keep finding the same item in search, and every bid, assembly and count keeps
pointing at the same row.

**Recommended answer: yes, "1-Pole" — for BREAKERS only.** A "single-pole
switch" keeps its name, because there "single-pole" is what the device is
called, not a pole count. The 2-Pole and 3-Pole names already follow this
pattern, so "1-Pole" makes all three match.

**Unblocks:** the materials rename (after the size-reading fix).
**Source:** `materials-naming-and-pricing-plan.md` § 8 question 1 (branch
`a-materials-plan`); CLAUDE.md § Brands, "One convention for single-pole
breakers".

**Answer:**

---

## 2. What do REMOVE and RELOCATE cost? — waiting on 1

**The question.** A mark can now say a device is to be **removed** (demo) or
**relocated** (moved). Neither buys a new device, so neither is priced as one,
and that is correct. But taking a device out, or moving it, is still labor,
and today **that labor is on the bid nowhere**. It costs $0. The count's card
says "N remove/relocate — labor not on the bid" so it is not hidden. How
should that labor be priced?

**Recommended answer: one labor line per count, for each kind.** Example: a
"Duplex receptacle" count with 4 removes and 2 relocates puts two lines on the
bid: "Remove duplex receptacle × 4" and "Relocate duplex receptacle × 2", each
at hours per device that you set. Like every starter number in the app, those
hours ship at zero and say "not priced" until you, or a contractor, type one.
They never quietly guess. A relocate line covers labor only. If the move needs
new wire or a new box, that is counted as normal new work.

**Other choices, if not that:** (b) leave it off the bid and keep the
warning; (c) one lump "demo" line per bid, typed by hand.

**Unblocks:** Track B pricing remove/relocate (no migration expected).
**Source:** `todo.md` "Owner: what do REMOVE and RELOCATE cost?";
`references/track-b-handoff.md` Open 1.

**Answer:**

---

## 3. A run that ENDS on an existing device — does it price its drop? — waiting on 2

**The question.** When a traced conduit or cable run ends on a device marked
**existing**, the run still prices its own drop there (the vertical piece of
pipe and wire down the wall to the device). The device itself is not priced,
because it is existing. Should the drop stay on the bid?

**Recommended answer: yes, keep pricing the drop.** The run is new work, and a
new pipe down to an old box is real material and real labor. Dropping it
would make a bid read short exactly where existing work is being tied into.
To keep it visible, the run would say "ends on an existing device", so an
estimator who meant to leave that drop off can see it. (A switch to leave one
drop off does not exist yet. It needs a small new column; it is listed in
`todo.md`, and would be its own question.)

**Other choice:** never price a drop at an existing device (a bid can then
come out short wherever new work joins old).

**Unblocks:** closing the 2026-10-05 audit item; a small wording change on the
run panel (Track B).
**Source:** `todo.md` "Decide: a RUN ending on an existing mark";
`references/track-b-handoff.md` Open 2.

**Answer:**

---

## Queued after these (not asked yet)

From `materials-naming-and-pricing-plan.md` § 8, asked once question 1 is
answered: SER names and look-alike sizes (2), example prices saying so on a
bid and quote (3), "Copper" on low-voltage cable (4), and hiding supplier
import until its review screen exists (5).
