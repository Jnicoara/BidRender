# Stage 4 — make it safe before outsiders log in

**Status: PLAN ONLY, 2026-09-27. Nothing here is built.** Five pieces: email,
staging, AI correction logging, security basics, invite gate. Each section
starts with what already exists, measured against the code on `local-dev` at
`d2928ba`, because two of the five turned out to be partly done.

---

## What already exists

| Piece | Exists today | Missing |
| --- | --- | --- |
| 1. Email | Nothing. No mail library, no provider, no sender anywhere in `server/`. `authRouter` has signup, login, logout and change-password only. `todo.md` line 155 has "Password reset via email" open. | Everything. |
| 2. Staging | Nothing. One App Platform app, one database, `main` deploys straight to users. `references/deploying.md` mentions a staging site once, hypothetically. | Everything. |
| 3. AI correction log | **Half.** `plan_copilot_findings` keeps what the AI proposed and whether it ended `confirmed` / `dismissed`, and `stampId` links a confirmed finding to the mark it became. `plan_copilot_corrections` remembers "this label is really that symbol" per plan set. | A **log**. The corrections table is a lookup that overwrites itself (`timesApplied` goes up, the history does not), and nothing records a confirmed AI mark being deleted or re-tagged afterwards. No anonymised fields anywhere. |
| 4. Security basics | `app-platform-settings.txt` is gitignored, **not on disk** in either `C:\dev\BidPhase` or the old OneDrive folder, and **never committed** (checked every commit on every branch by filename). A history scan for real-looking secrets (`sk-ant-`, database URLs, `JWT_SECRET=`, R2 secrets) found only test placeholders. The two R2 read-only keys were already confirmed Run-time scope on 2026-09-16 (`todo.md`). | Database network lockdown is undocumented, so assume it is not done. Scope of the other settings is unchecked. |
| 5. Invite gate | **Half.** Company invitations are built and solid: `company_invites`, a hashed code shown once, expiry, seat limits, revoke (`companyRouter.invite` / `acceptInvite`). The early-access waitlist is stored and has `notifiedAt`. | `auth.signup` is a `publicProcedure` that lets **anyone** create an account. An invite code is accepted only by someone already signed in, so it gates joining a company, not creating an account. |

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

| Piece | Migration | What |
| --- | --- | --- |
| 1. Email | Yes | `password_reset_tokens` (hashed token, userId, expiresAt, usedAt). `users.sessionsValidAfter` timestamp, NULL = no reset yet — a session issued before it is refused. |
| 2. Staging | No new file | Staging's database is built by running every existing migration from zero (the same rule as `database-digitalocean.md` § 2). |
| 3. AI log | Yes | One new table, `ai_correction_log`. See below. |
| 4. Security | No | |
| 5. Invite gate | Yes | Signup invitations for a **new company** (issued by the admin, e.g. from the waitlist), separate from company invitations. Either a new table or a nullable `companyId` on `company_invites` — decide when building; a new table is the safer read because every existing reader of `company_invites` assumes a company. |

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

### A. Lock down the database (piece 4) — about 15 minutes

1. Log in to **cloud.digitalocean.com**.
2. Left menu: **Databases** → click the MySQL cluster.
3. Open the **Settings** tab. Find **Trusted Sources**.
4. If it says anything like "all IPv4" or is empty, click **Edit**, and add the
   app: start typing the app's name and pick it from the list.
5. Also add **your own computer's internet address** — the page offers "add my
   current IP". This is what lets migrations run from your laptop. (See
   question 5: this address can change.)
6. Save. **Done looks like:** Trusted Sources lists exactly the app and your
   address, and bidridge.com still loads and shows your bids afterwards. If
   the site stops loading, remove the change you just made and tell me.

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
