# Track B — morning questions, 2026-10-15

Things the overnight run did NOT decide, because they touch something shared,
money, or can't be undone. Each has a suggested answer after the dash.

## Q1. The Gate's MySQL image keeps being refused — change where it comes from?

`.github/workflows/gate.yml` pulls `public.ecr.aws/docker/library/mysql:8.0`
for the `test` job (moved off Docker Hub on 2026-10-09 for the same reason).
Tonight that pull failed with "toomanyrequests: Data limit exceeded" four
times (runs 38669536985, 38682319349, 38684208140 and one more), failing the
Gate in under a minute with no test run. A re-run got through each time.

The workflow is shared by every track and gates the staging deploy, so B did
not change it. Options:

1. Pull from GitHub's own registry (`ghcr.io`), which GitHub runners reach
   without the shared-IP limit — needs a copy of the image pushed there once.
2. Keep ECR but retry the pull in a step before the job's service starts
   (a service container can't retry; a `docker run` step can).
3. Leave it; re-run by hand when it happens.

— **Suggested: 1** (A's call — it is the Gate). Until then, "Gate red in
under a minute" means "look at the log before believing it".
