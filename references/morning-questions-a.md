# Morning questions — Track A night run 2026-10-14 → 15

Only things for live, money, or that cannot be undone. Everything reversible
was decided and is in `overnight-log-a.md`.
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

