# Stage 4 — make it safe before outsiders log in

**Status: PLAN ONLY, 2026-09-27. Nothing here is built.** Five pieces: email,
staging, AI correction logging, security basics, invite gate. Each section
starts with what already exists, measured against the code on `local-dev` at
`d2928ba`, because two of the five turned out to be partly done.

> **Detailed plans, 2026-09-29.** Piece 5 → `references/invite-gate-plan.md`
> (it picks a new `signup_invites` table, as leaned below). Piece 3 →
> `references/ai-correction-log-plan.md` (it found placed AI marks are saved
> with no group, § 1 there). Piece 1 is built on `a-email-reset`, not merged.

---

## The owner's answers (2026-09-27) — these override anything below

1. **Email provider: Resend.**
2. **DNS for bidridge.com is at DigitalOcean** (its nameservers point there).
   Email and staging records go in DigitalOcean → Networking → Domains.
3. **Staging: yes, and password-protected.**
4. **The AI log keeps the picture, not just the label.** Save the label and
   kind, the sheet, the box location, AND a small cut-out image of the symbol,
   stored in R2. The log cannot be backfilled, and shared symbol learning later
   needs the picture. Anything identifying the company, job or customer is
   stripped from what would be shared. **This overrides the "kind, not
   picture" line in § 3 below.**
5. **Migrations reach the locked database from the owner's laptop IP.** Home
   IPs change, so `references/deploying.md` § 10 has the steps to update it and
   what the error looks like when it is stale.
6. **Only the BidRidge owner can invite a new company.** Company owners
   inviting their own staff is unchanged.
7. **Terms page later, but it must exist before any sharing is turned on.**
   Recorded in `todo.md` § Pending.

## The owner's answers (2026-09-29) — email and password reset (piece 1)

These refine § "Shape of each code piece" item 1 and § E below.

1. **Mail comes from `no-reply@bidridge.com`.** The root domain is verified in
   Resend, whose bounce and SPF records sit on the `send.` subdomain. Measured
   2026-09-29: bidridge.com had no MX, no TXT and no `_dmarc` record, so
   nothing clashes — and nothing receives mail, so a reply to `no-reply@` goes
   nowhere. Invites will want a real Reply-To.
2. **Changing a password in Settings also signs out every OTHER device**; the
   device making the change gets a fresh session and stays in. Same mechanism
   as a reset (`users.sessionsValidAfter`).
3. **Staging delivers only to an allow-list** (`STAGING_EMAIL_ALLOWLIST`,
   starting with the owner's address). Anything else is logged as not sent.
   Live and staging get separate Resend keys so either can be revoked alone.
4. **A reset link is single-use and ends every old session.** Owner's
   condition before the build, with a test for each half.

Found while planning: `signSession` set no issued-at time, so no session could
be told apart by age. The reset work adds `setIssuedAt()`, and a token WITHOUT
one is refused once `sessionsValidAfter` is set — that is every session issued
before the change. The reset link is built from `APP_BASE_URL`, never from the
request's Host header, which an attacker controls.

---

## What already exists

| Piece                | Exists today                                                                                                                                                                                                                                                                                                                                                                                                          | Missing                                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Email             | Nothing. No mail library, no provider, no sender anywhere in `server/`. `authRouter` has signup, login, logout and change-password only. `todo.md` line 155 has "Password reset via email" open.                                                                                                                                                                                                                      | Everything.                                                                                                                                                                                                                       |
| 2. Staging           | Nothing. One App Platform app, one database, `main` deploys straight to users. `references/deploying.md` mentions a staging site once, hypothetically.                                                                                                                                                                                                                                                                | Everything.                                                                                                                                                                                                                       |
| 3. AI correction log | **Half.** `plan_copilot_findings` keeps what the AI proposed and whether it ended `confirmed` / `dismissed`, and `stampId` links a confirmed finding to the mark it became. `plan_copilot_corrections` remembers "this label is really that symbol" per plan set.                                                                                                                                                     | A **log**. The corrections table is a lookup that overwrites itself (`timesApplied` goes up, the history does not), and nothing records a confirmed AI mark being deleted or re-tagged afterwards. No anonymised fields anywhere. |
| 4. Security basics   | `app-platform-settings.txt` is gitignored, **not on disk** in either `C:\dev\BidPhase` or the old OneDrive folder, and **never committed** (checked every commit on every branch by filename). A history scan for real-looking secrets (`sk-ant-`, database URLs, `JWT_SECRET=`, R2 secrets) found only test placeholders. The two R2 read-only keys were already confirmed Run-time scope on 2026-09-16 (`todo.md`). | Database network lockdown is undocumented, so assume it is not done. Scope of the other settings is unchecked.                                                                                                                    |
| 5. Invite gate       | **Half.** Company invitations are built and solid: `company_invites`, a hashed code shown once, expiry, seat limits, revoke (`companyRouter.invite` / `acceptInvite`). The early-access waitlist is stored and has `notifiedAt`.                                                                                                                                                                                      | `auth.signup` is a `publicProcedure` that lets **anyone** create an account. An invite code is accepted only by someone already signed in, so it gates joining a company, not creating an account.                                |

One finding that is not on the list but belongs to piece 1: **a session lasts a
year and cannot be revoked** (`ONE_YEAR_MS` in `server/_core/sdk.ts`, a plain
signed token with nothing to check against). A password reset that does not log
out the old sessions does not help the person whose password was stolen, so the
reset has to carry a way to invalidate them.

---

## Build order

**0 → 1 → 2 → 3 → 4.** The reasoning is in each line.

0. **Security basics (piece 4).** Almost all owner clicks, no code, no
   dependencies, and it protects what is already live. Do it this week.
1. **Staging (piece 2).** Second, because every piece after it should be
   rehearsed there first — email especially, since the first real reset email
   should not go to a real user.
2. **Email + password reset (piece 1).** Needed before the invite gate: an
   invite you have to read out over the phone works for three people, not
   thirty.
3. **Invite gate (piece 5).** Uses email to deliver the invite. Must land
   before anyone outside the company is told the address.
4. **AI correction logging (piece 3).** Independent of the rest and could run in
   parallel with 2 or 3. Last only because nothing outside the company is
   blocked on it — but it must ship **before** outside users touch the AI, or
   their first and most useful corrections are lost.

## Which pieces need migrations

All three are **additive** (new tables, new nullable columns, no `UPDATE` to an
existing column), so each goes **step 1, before the push**, and step 3 is empty.
Still classify each file when written, per CLAUDE.md.

| Piece          | Migration   | What                                                                                                                                                                                                                                                                                                                     |
| -------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Email       | Yes         | `password_reset_tokens` (hashed token, userId, expiresAt, usedAt). `users.sessionsValidAfter` timestamp, NULL = no reset yet — a session issued before it is refused.                                                                                                                                                    |
| 2. Staging     | No new file | Staging's database is built by running every existing migration from zero (the same rule as `database-digitalocean.md` § 2).                                                                                                                                                                                             |
| 3. AI log      | Yes         | One new table, `ai_correction_log`. See below.                                                                                                                                                                                                                                                                           |
| 4. Security    | No          |                                                                                                                                                                                                                                                                                                                          |
| 5. Invite gate | Yes         | Signup invitations for a **new company** (issued by the admin, e.g. from the waitlist), separate from company invitations. Either a new table or a nullable `companyId` on `company_invites` — decide when building; a new table is the safer read because every existing reader of `company_invites` assumes a company. |

## Shape of each code piece

**1. Email.** One door, `server/email/`, the same idea as `server/llm`: the
provider, the from-address and a daily cap live there so nothing else can
forget them. With no provider key it logs "email not sent" and says so on
screen — never pretends it went. Password reset: "Forgot password?" on the
login page, the same answer whether the email exists or not, a 1-hour
single-use link, the token stored hashed (like invite codes), rate-limited, and
a completed reset sets `sessionsValidAfter` so every old session dies.

**2. Staging.** A second App Platform app deploying from a `staging` branch, its
own database on the same cluster (`bidrender_staging`, its own login), its own
R2 plans bucket, `DISABLE_SCHEDULED_JOBS=true` (no cron worker, so no nightly
purge or backup writes from staging), and email that only delivers to an
allow-list. Flow becomes `local-dev → staging → main`. `deploying.md` gets the
new step.

**3. AI correction log.** One table, written **after** the edit has committed,
inside its own `try/catch` that logs and swallows — the same "cannot block the
edit" rule as `ai_usage_daily`. Nothing reads it: no router query, no screen.
Written from four places: `planCopilot.dismiss`, `planCopilot.correct`, and
`takeoffStamps.remove` / `setLocation` when the mark has a finding pointing at
it. (`takeoff_runs.isSuggestion` exists but nothing creates AI runs today;
hook it when something does.) Two halves in one row:

- **Identified:** company (`dataUserId`), who made the edit (`actorUserId`), bid,
  sheet, finding, stamp, model, what the AI said, what the user changed it to,
  time. Foreign keys `set null` on delete, not cascade, so deleting a bid
  strips the identity and keeps the anonymised half.
- **Anonymised:** the normalised label, the AI's confidence tier and score, the
  action (dismissed / relabelled / deleted / re-tagged), the corrected symbol
  **kind** (not the company's assembly name, which can name a customer), a
  count, and the symbol shape (see question 4).

Sharing later is then `SELECT` of the anonymised columns — no rebuild.

**5. Invite gate.** `auth.signup` takes a required code and refuses without one
— on the server, since hiding the form does not stop a direct request. A
company invite code creates the account and joins that company in one step; a
new-company code creates the account as owner of a new company. The admin
screen's waitlist gets an "Invite" button that sends the email and stamps
`notifiedAt`. Existing accounts are untouched.

---

## What the owner has to do himself

Plain steps. Each says where to click and what "done" looks like.

### Step (a) — DONE 2026-09-27. What actually worked

A, B and C below are the ORIGINAL plan and A was wrong; this is what was done.

1. **App joined the database's VPC.** App and database are both in SFO3.
   Apps → bidrender → Networking → VPC network → Edit network → `default-sfo3`
   equivalent. Redeployed, no downtime.
2. **`DATABASE_URL` switched to the private host** — `private-` inserted after
   the `@`, nothing else. The database certificate lists that name, checked
   with `openssl s_client -starttls mysql` before the switch. Redeployed.
3. **Trusted Sources = `10.124.0.3` (the app's VPC egress IP) + `97.94.233.209`
   (the owner's laptop).** Entered as IP addresses, NOT by picking the app from
   the list — picking the app is what failed. The nightly backup is unaffected:
   the cron Worker only calls `https://bidridge.com/api/scheduled/…`, and the
   app runs the dump over its own `DATABASE_URL`.
4. **The 11 SECRET settings moved to Run Time**; the 8 plain ones
   (`VITE_APP_ID`, `NODE_ENV`, `PLAN_STORAGE`, the R2 account/bucket/endpoint
   names) stay Run and Build Time. Read from a downloaded App Spec, names and
   scopes only, file deleted. `scripts/build.mts` reads no setting but the
   `VITE_` ones.
5. **`app-platform-settings.txt`**: not on disk under the user folder, never in
   any commit. Nothing to rotate.

Checked after every change: `/api/version` served a fresh build, a
wrong-password login answered 401 (so sign-in reaches the database), the owner
signed in and opened a bid, and the laptop's `schemaDrift` connected (89).
The laptop-locked-out error is in `references/deploying.md` § 10.

### A. Lock down the database (piece 4) — about 15 minutes

1. Log in to **cloud.digitalocean.com**.
2. Left menu: **Databases** → click the MySQL cluster.
3. Open the **Network Access** tab. Find **Trusted Sources**. (Before the
   lockdown it read "Right now, your database is open to all incoming
   connections" — confirmed 2026-09-27.)
4. If it says anything like "all IPv4" or is empty, click **Edit**, and add the
   app: start typing the app's name and pick it from the list.
5. Also add **your own computer's internet address** — the page offers "add my
   current IP". This is what lets migrations run from your laptop. (See
   question 5: this address can change.)
6. Save. **Done looks like:** Trusted Sources lists exactly the app and your
   address, and bidridge.com still loads and shows your bids afterwards. If
   the site stops loading, remove the change you just made and tell me.

> **Tried 2026-09-27 and it took the site down — the steps above are wrong as
> written.** With the app `bidrender` as the only trusted source, the live
> site stopped working; removing the entry brought it back. The app reaches the
> database over the **public** hostname, and outbound traffic from App Platform
> leaves from shared addresses that the "app" trusted-source entry does not
> match. DigitalOcean's documented route for an app is the **VPC**: enable it
> on the app, point `DATABASE_URL` at the database's **private** hostname, and
> trust the app's **VPC egress private IP**
> (docs.digitalocean.com/products/app-platform/how-to/enable-vpc/). The build
> is not the cause — `scripts/build.mts` never connects to the database.
> Revised steps are being walked through with the owner one at a time.

### B. Check each setting's scope (piece 4) — about 10 minutes

1. Left menu: **Apps** → the app → **Settings** tab → **App-Level Environment
   Variables** (and the same under the component, if there is one).
2. For every row **except those starting `VITE_`**: click Edit, set scope to
   **Run Time**, and make sure **Encrypt** is ticked. Save.
3. Rows starting **`VITE_`** stay **Build Time** (or Run and Build Time). They
   are baked into the web page at build time and are not secret anyway.
4. Save. This triggers a redeploy. **Done looks like:** bidridge.com works
   after the redeploy, and the Activity tab shows a green deploy.

### C. The settings file (piece 4) — 2 minutes

`app-platform-settings.txt` is already gone from both project folders and was
never saved into git. Just check **Downloads**, **Desktop** and **Documents**
for a copy and delete it, then empty the Recycle Bin. If one turns up anywhere
that syncs (OneDrive, Google Drive, Dropbox) or was ever emailed or pasted into
a chat, tell me — then every key in it should be changed, and I will list them.

### D. Staging (piece 2) — about 30 minutes, when I say it is ready

1. **Apps → Create App**, pick the same GitHub repo, branch **`staging`**.
2. Pick the smallest size offered. Note the monthly price on the screen.
3. Paste the settings I give you (a staging set — different database login,
   different bucket, not the production values).
4. **Databases → the cluster → Users & Databases**: add a database
   `bidrender_staging` and a user `bidrender_staging_app`. I will give the exact
   permissions.
5. **Cloudflare → R2 → Create bucket** `bidrender-plans-staging`, then an API
   token for that bucket only.
6. Where bidridge.com's DNS lives: add `staging.bidridge.com` pointing at the new
   app (App Platform shows the exact record under **Settings → Domains**).

### E. Email (piece 1) — about 20 minutes

1. Sign up at the email provider we pick (question 1).
2. Add the domain **bidridge.com** in the provider's dashboard. It will show 2–4
   DNS records.
3. Add those records where bidridge.com's DNS lives. Wait for the provider to
   show **Verified** (minutes to a few hours).
4. Create an API key, and add it in DigitalOcean as `EMAIL_API_KEY`, Run Time,
   Encrypted — on production and on staging.

### F. Invite gate (piece 5) — nothing to click

Before it ships: send me the list of people who should be able to get in the
day it goes live, so nobody already using the app is locked out.

---

## Step (b) — staging, the detailed plan (2026-09-27)

Supersedes § D above where they differ.

> **Code side BUILT 2026-09-27**; the DigitalOcean/Cloudflare clicks remain.
> Owner's answers: shared cluster, AI off, $10 app. Built: the password gate
> (`server/stagingGate.ts`), the STAGING band (`StagingBand.tsx`), the
> database and a login proven unable to reach live data
> (`scripts/stagingDatabase.mts`), and `staging-app-settings.txt`. The owner's
> step 1 below (create database and user) was done by script instead. How it
> runs now: `references/deploying.md` § 11.

**What it is.** A second copy of the site at `staging.bidridge.com`, deployed
from a `staging` branch, with its own empty database, its own plans bucket, no
nightly jobs, and a password in front of every page. The flow becomes
`local-dev → staging → main`: a change is pushed to `staging`, checked there,
then fast-forwarded to `main`.

**Monthly cost — about $10.** Prices from digitalocean.com/pricing/app-platform,
read 2026-09-27; check the create screen.

| Item                              | Cost       | Why                                                                                                                                                               |
| --------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staging app, 1 vCPU / 1 GiB fixed | **$10/mo** | Same size as production (`apps-s-1vcpu-1gb-fixed`), so a practice run means something. The 512 MiB size is $5 but is a different machine from the one that ships. |
| Database                          | $0         | A second database on the existing cluster.                                                                                                                        |
| R2 bucket                         | ~$0        | Inside Cloudflare's free storage allowance at staging volumes.                                                                                                    |
| `staging.bidridge.com`            | $0         | DNS is already at DigitalOcean.                                                                                                                                   |
| Email (later)                     | $0         | Resend's free tier.                                                                                                                                               |

**The one real risk of the free database option:** staging shares the
production cluster's CPU and memory. A heavy test on staging can slow the live
site. At today's traffic that is acceptable; a separate cluster removes it for
roughly $15/mo more (question S1).

### What the owner clicks (about 30 minutes, one step at a time when we do it)

1. **Databases → cluster → Users & Databases:** add database
   `bidrender_staging` and user `bidrender_staging_app`.
2. **Apps → Create App**, same GitHub repo, branch `staging`, SFO3, 1 GiB
   fixed, same run command and an EMPTY build command (see memory: a custom
   build command breaks the build).
3. **Networking → VPC** on the new app, same VPC as the database. Then read
   its `10.x` egress IP.
4. **Database → Network Access:** add that `10.x` address. Without this the
   staging app is locked out on its first start — the lock from step (a)
   applies to it too.
5. **Cloudflare → R2:** create bucket `bidrender-plans-staging`, an API token
   scoped to that bucket only, and the same CORS rule as production
   (deploying.md § 9) with the staging origin.
6. **Staging app settings:** pasted from a file I prepare the same way as
   `new-db-url.txt` — secrets Run Time and encrypted from the start.
7. **Networking → Domains:** add `staging.bidridge.com` to the staging app.

### What I build

1. **A password gate**, because App Platform has no built-in way to put a
   password on an app. Express middleware asking for a username and password
   (HTTP basic auth) on every request, turned on only when `STAGING_PASSWORD`
   is set — so production, which never has it, is untouched. Plus a
   `noindex` header so search engines never list staging. Tested.
2. **A "STAGING" band across the top of every screen**, from a build-time
   `VITE_APP_ENV=staging`, so nobody mistakes it for the live site.
3. **The staging database's permissions**, run from the laptop as `doadmin`:
   `bidrender_staging_app` gets `ALL` on `bidrender_staging` and nothing on
   `bidrender` — the same shape as `database-digitalocean.md` § 6. DigitalOcean
   creates users with wider rights, so this step is what stops staging from
   being able to touch production data. Checked by trying, and failing, to
   read `bidrender` as the staging login.
4. **The staging database built from the migrations** (never a copy of
   production — it holds real contractors' bids). Seeded catalog, empty
   otherwise.
5. **Settings file** for step 6, with fresh `JWT_SECRET` and no
   `CRON_SECRET` (no cron on staging), `DISABLE_SCHEDULED_JOBS=true`.
6. **Docs:** `deploying.md` gets the staging step in the deploy sequence, and a
   `.env.staging.local` for running migrations against staging first.

**No migrations.** Staging's database is built from the existing files.

### Questions for the owner — staging

- **S1.** Staging database on the production cluster (free, shares its
  capacity) or its own cluster (about $15/mo more, fully separate)?
  Recommendation: shared, for now.
- **S2.** AI on staging: off (`DISABLE_AI_FEATURES=true`), or on with its own
  Anthropic key so staging spend is visible separately? Recommendation: off
  until something AI needs testing.
- **S3.** App size: $10 (matches production) or $5? Recommendation: $10.

## Questions for the owner

1. **Which email provider?** Recommendation: **Resend** (simple, has a free tier
   big enough for resets and invites — confirm the limit on signup) or
   **Postmark** (best at actually reaching inboxes, small monthly cost). And what
   address should mail come from — `no-reply@bidridge.com`?
2. **Where is bidridge.com's DNS managed** — Cloudflare, or the registrar? Email
   and staging both need records added there.
3. **Staging cost and access.** Is a second small app (a few dollars a month —
   read the price on the create screen) OK? Should staging be hidden behind a
   password so strangers cannot find it?
4. **"Symbol shape" in the AI log** — does that mean the picture of the symbol
   the user boxed on the legend, or just the symbol's label and category? A
   picture is more useful to share later but is a piece of someone's drawing.
5. **Database access from your laptop.** Home internet addresses change. Either
   re-add your address each time a migration fails to connect (simple), or
   migrations run from DigitalOcean's own console instead (no laptop access at
   all, more setup). Which?
6. **Who can bring in a new company** — only you, or should an existing company
   owner be able to invite another contractor? (Company owners inviting their
   own staff already works and stays as it is.)
7. **Sharing the AI log later** — the terms users agree to should say
   corrections may be used, anonymised, to improve the reader. Is there a terms
   page today, and who writes that sentence?
