# Track B — overnight log, 2026-10-14 → 15

Owner away. Rules: push ONLY track-b; never local-dev / staging / main; no
staging or live DB; no migrations (draft for A and park); MySQL 3307 shared,
never stopped; one dev server at most. Questions that move a bid number
beyond the plan, money, or anything irreversible go to
`references/morning-questions-b.md`.

## Step 0 — local-dev Gate for d0152f60 (21:38–)

- Run 38682319349 failed in 9 s before any test: the `test` job could not
  pull `public.ecr.aws/docker/library/mysql:8.0` ("toomanyrequests: Data
  limit exceeded"), the third such refusal tonight (also 38669536985 on
  track-b). Not a code fault. Re-ran the failed job once (a re-run, not a
  push).
