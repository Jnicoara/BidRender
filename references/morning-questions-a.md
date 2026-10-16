# Morning questions — Track A night run 2026-10-14 → 15

Only things for live, money, or that cannot be undone. Everything reversible
was decided and is in `overnight-log-a.md`.

## 2026-10-15 night (second queue) — counting and totals

### N0. FIXED, changes a total in one case: a resent batch of marks counted twice

On the Plans screen, if a batch of taps reached the server but the answer was
lost (Wi-Fi drop, tablet asleep), the screen sent the batch again and every
mark counted twice: 3 receptacles became 6. **Server fix on `track-a-night`**
(`server/markReplay.ts`, test red before): a mark is placed once per key. It
takes effect when Track B adds one line to the screen (`track-b-handoff.md`).
**What moves:** only a count that would have been doubled. No existing bid
changes; marks already doubled on a bid stay as they are. Nothing to decide
unless you want B to hold the line.

### N1. On a SCAN, should an "AI says same" find be allowed into Confirm all? (affects counts)

Found by the counting deep test (`client/src/lib/countingScan.test.ts`),
with saved fake AI answers and no money spent. On a scanned sheet every find
starts flagged ("the tag beside it is not read"), so **Confirm all takes
nothing** until a person looks. That part is safe. Pressing **Ask AI** and
getting "same" clears that flag, and the find becomes "clear", so the next
Confirm all takes it. So if the AI wrongly answers "same" on a GFCI, Confirm
all counts that GFCI as a duplex. Nothing is counted without a person
pressing Confirm all, but that one press now trusts the AI.

- **A (today):** keep as is. The AI is a helper, and Confirm all is the
  person's decision.
- **B (recommended):** an AI-cleared scan find stays out of Confirm all and
  is confirmed one at a time, with the AI's answer shown. Safer, and costs
  one tap per find on scans.
- **C:** B, but only for finds the AI moved from flagged to clear.

Nothing changed tonight. It's a count decision, so it's yours.

## 1. GitHub minutes once the repo is private — needs a money decision BEFORE switching

Measured: the Gate used **≈ 17,400 billed minutes / month**; tonight's change
(on `track-a-night`, nothing tested less) brings it to **≈ 10,000** — still
~5× the 2,000 free, and more once GitHub's private 2-CPU runner slows the
suite. Full numbers and options: `private-repo-plan.md` § 1–3.

**If nothing is decided: with no payment method, Actions stop when the 2,000
run out (≈ day 6) — no Gate, and no staging deploy, until the 1st.**

Pick one (or a mix): **A** pay overage with a budget (≈ $48/mo at today's
speed), **B** a self-hosted runner on a ≈ $24 droplet, **C** track WIP pushes
run a light check and the full Gate on demand before handoff, **D** A also
works on a track branch so local-dev only fast-forwards (free, no testing
lost), **E** stay public.

Also: merge `track-a-night`'s Gate change to local-dev? It also carries the
fix for tonight's outage (every track's Gate failed pulling MySQL — "Data
limit exceeded"), so B and C stay red until it lands.

## 2. DigitalOcean — one-minute check (read-only)

Docs say both apps use the GitHub integration with autodeploy, which keeps
working when private. Confirm in each app's App Spec that the source is
`github:` (not `git:`), and that the DigitalOcean GitHub App can see
`BidRender` (`private-repo-plan.md` § 4).

## 3. Next live release — the boot change vs your Q1

You listed the boot change in the next release. Your Q1 (2026-10-13) says
it ships in the release **after** the end-of-pricing load, never with it —
and that load is **not in the seed files yet** (only the pack fix changed
seed since live). The boot change is already on local-dev, so any release
from local-dev carries it. Pick one:

- **a.** Waive Q1 for this release: the pricing edits go out later through
  `starterDrift.mts --apply` (pins every company first; on live that is your
  own, test, and user 3036's companies).
- **b.** Hold this release until the pricing load is in the seed — but then
  it rides WITH the boot change anyway, which Q1 also forbids, unless the
  boot change is reverted on local-dev for one release.
- **c.** Something else.

Plan: `next-live-release-plan.md` § "Night prep 2026-10-14"; steps are the
same either way except step 9.

## 4. Remove live companies 5–8 (user 3036)? — you said "yes pending"

Script ready and tested (`scripts/removeRaceCompanies.mts`, dry run by
default; `--apply` needs `--expect 5,6,7,8` and removes nothing if what it
finds differs; refuses any company with an invite, a second member, any
other row pointing at it, or someone's active pointer). Runs after the
day's verified backup, with the eight rows saved to JSON first
(release plan step 10). Yes / no?

## 5. Invite gate — when to switch it on (live)

Server side built, OFF (`invite-gate-plan.md` § 12). Switching on = set
`SIGNUP_INVITE_ONLY=on` on the live app (an env change, redeploys). **My
recommendation: not until the sign-in page hides "Create account"** (not
built — needed a visual check, no dev server tonight); otherwise strangers
fill in the form and are refused only on submit. Also: apply the drafted
`users.email` UNIQUE (`references/drafts/users-email-unique.sql`) in the
same release? It is additive; count duplicates first.
