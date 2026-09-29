# Invite gate — only people the owner invites can create an account. PLAN ONLY, 2026-09-29

**Status: nothing here is built.** This is the detailed plan for piece 5 of
`references/stage-4-safety-plan.md`. It builds on that file and does not
restate it. Measured against `local-dev` at `977b789`, and against
`a-email-reset` at `af82b2f` (password reset by email). That branch is finished
but **not merged**, and this plan depends on it (§ 9).

## The owner's answers (2026-09-29) — these override anything below

**Q1–Q7 in § 11 are answered as recommended**, with one addition to Q2:

1. **One invite at a time.** No bulk button.
2. **The account must use the invited email**, for both kinds, except that a
   company code copied by hand works with any email. **Added: resend to a
   DIFFERENT address.** The platform admin (new-company invites), and a company
   owner or admin (staff invites), can resend an invite to another email, so
   someone who signs up with a different address is not stuck. It revokes the
   old code and issues a new one bound to the new address, in one step
   (§ 3, § 8.4, § 8.5).
3. **Reply-To:** staff invites reply to the inviter; new-company invites reply
   to the owner's own address.
4. **Seats on a new-company invite:** 1 / 5 / 15 or typed, default 1.
5. **Reset for someone invited but not signed up sends nothing**, plus the
   one-line pointer to the invite email.
6. **Duplicate emails on live: counted 2026-09-29, read-only. There are none:
   3 users, 0 duplicate addresses ignoring case, 0 with no email.** The column
   is `utf8mb4_unicode_ci`, which ignores case, so a UNIQUE index on
   `users.email` would apply cleanly today. It is still a separate item, not
   part of this migration. Re-count first, because the gate is what starts
   adding users.
7. **Every existing account keeps working**, test accounts included. Nobody is
   removed.

**Read first.** These are the decisions this plan follows. Each is cited, not
re-opened:

- **stage-4 owner answer 6 (2026-09-27).** Only the BidRidge owner can invite a
  new company. Company owners inviting their own staff is unchanged.
- **stage-4 § "Shape of each code piece" 5.** `auth.signup` requires a code and
  refuses without one, **on the server**. A company code creates the account
  and joins that company in one step. A new-company code creates the account as
  the owner of a new company. The waitlist gets an "Invite" button that sends
  the email and stamps `notifiedAt`. Existing accounts are untouched.
- **stage-4 § "Which pieces need migrations" row 5.** The new-company invite is
  either a new table or a nullable `companyId` on `company_invites`. It leaned
  towards a new table as "the safer read". **This plan picks the new table**
  (§ 7).
- **stage-4 owner answers 2026-09-29, 1 and 3.** Mail comes from
  `no-reply@bidridge.com` and "invites will want a real Reply-To". Staging
  delivers only to `STAGING_EMAIL_ALLOWLIST`.
- **`shared/permissions.ts` — `INVITABLE_ROLES` (no owner), `INVITE_TTL_DAYS =
14`, `inviteStatus` / `inviteRejection`.** These are the rules company
  invites already follow. New-company invites reuse them rather than growing a
  second set.
- **`shared/seats.ts`.** A seat is an active member OR a pending invite, and
  `DEFAULT_SEAT_LIMIT = 1`. There is no billing yet.

---

## 1. What exists today (measured)

| Thing                | Where                                                    | What it does                                                                                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signup               | `server/routers/authRouter.ts:27-91`                     | A `publicProcedure`. **Anyone** with an email and a password gets an account.                                                                                                                                                                |
| A new user's company | `server/_core/companyScope.ts:164-202`                   | **Created lazily**: on the first request by a user with no membership, `createPersonalCompany` makes them the owner of a company of one.                                                                                                     |
| Company invites      | `companyRouter.invite` / `acceptInvite` / `revokeInvite` | A 20-character code, stored as a SHA-256 hash and shown once. Expires in 14 days, counts as a seat while pending, checked under a seat lock. **No email is sent.** **The invitee must already be signed in** to accept (`TeamPage.tsx:433`). |
| Waitlist             | `early_access_signups`, `earlyAccessRouter`              | The landing page's form. Email is unique. `notifiedAt` NULL means "not invited yet".                                                                                                                                                         |
| Seat limit           | `companies.seatLimit` (default 1), `SeatLimitsPanel`     | Only a platform admin can change it.                                                                                                                                                                                                         |
| Email + reset        | branch `a-email-reset` only                              | `server/email/` (Resend, stub outside production, daily and monthly caps, staging allow-list). A 1-hour single-use reset link that ends old sessions.                                                                                        |

So today an invite code gates **joining a company**, not **creating an
account**. The gate described here is the missing half.

---

## 2. How invites work after this

**Two kinds of invite, one door.** Both produce a link:

```
https://bidridge.com/#/signup?invite=<code>
```

The code sits in the hash, the same as the reset link. A hash never reaches a
server log or a Referer header. The base URL comes from `APP_BASE_URL`, never
from the request's Host header (the same rule as reset).

| Kind            | Who can issue it                                         | What accepting it does                                                                                              | Stored in                   |
| --------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **Company**     | A company owner or admin (`members.manage`) — unchanged  | Creates the account **and** the membership, with the invited role, in one transaction. No personal company is made. | `company_invites` (exists)  |
| **New company** | **Platform admin only** (`adminProcedure`), per answer 6 | Creates the account **and** a new company with this person as owner, with the seat limit the invite carries.        | `signup_invites` (new, § 7) |

**What changes for company invites:** the inviter can now type an email address
and have the link **sent**, as well as copying the code by hand. Copying stays,
because it works with no email provider and on staging. An invitee who has no
account can now accept from the link. Before this change they had to sign up
first, and that is the path this gate closes.

**The signup page**, reached from the link:

1. It reads the code from the hash and asks the server what it is (a new
   public procedure, `auth.inviteInfo(code)`). The answer is the kind, the
   company name for a company invite, and the email it was sent to, or a
   refusal (§ 4).
2. It shows the email **fixed, not editable** (Q2), plus name and password
   fields. Password rules come from `shared/passwordRules.ts` (on
   `a-email-reset`).
3. `auth.signup({ code, email, password, name })` runs **in one transaction**:
   re-check the code under the lock, create the user, create the membership or
   the company, then stamp `acceptedAt` / `acceptedByUserId`. If any step
   fails, nothing is written and the code is still usable.

**Someone who already has an account and opens a company invite link** is told
"You already have an account — sign in and this invite will be waiting." After
sign-in the app lands on Team with the code filled in. That reuses the existing
`acceptInvite`, so no new accept path is needed for existing users.

**Signing up with an already-used email is refused before the account is made.**
The existing CONFLICT check stays.

---

## 3. Expiry

- **Both kinds last 14 days**, which is `INVITE_TTL_DAYS`, already shared. One
  number is one thing to change.
- **Single use.** `acceptedAt` is set in the same transaction that creates the
  account, through a conditional UPDATE (`acceptedAt IS NULL AND revokedAt IS
NULL AND expiresAt > now`). Two tabs racing on one link produce one account.
  This is the same claim pattern as `completePasswordReset`.
- **"Resend" mints a new code and revokes the old one.** Codes are stored
  hashed, so the old one cannot be sent again. The expiry restarts at 14 days.
- **Resend can change the address (owner answer 2).** Same step: revoke the
  old code, then issue a new one bound to the new email, in one transaction.
  The old link then says "revoked — ask {inviter} for a new one", never
  "invalid". For a staff invite the seat carries over: one invite is revoked
  and one is issued under the same lock, so resending to a new address can
  never fail for lack of a seat, and it can never hold two seats. For a
  new-company invite the seat limit and note carry over too.
- **An expired invite frees its seat by itself.** Checked 2026-09-29:
  `shared/seats.ts:6-10` counts an invite only while it is unaccepted, unrevoked
  and not expired. Nobody has to tidy up.

---

## 4. What a stranger sees

| They do                                                | They see                                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open bidridge.com                                      | The landing page, as today. Its form joins the waitlist.                                                                                                                                                                                                            |
| Open the login page                                    | **Sign in only.** The "Create account" toggle becomes one line: "BidRidge is invite-only for now. Join the early-access list" (a link to the landing form).                                                                                                         |
| Open `#/signup` with no code                           | The same line, with nothing to fill in.                                                                                                                                                                                                                             |
| Open a link with a wrong code                          | "This invite link isn't valid. Check you used the whole link, or ask whoever invited you for a new one."                                                                                                                                                            |
| Open an expired, revoked or used link                  | The reason, with what to do: "This invite has expired — ask {inviter} for a new one." A used one says "This invite has already been used. Sign in instead." These reasons come from the existing `inviteRejection`.                                                 |
| Call `auth.signup` directly, with no code or a bad one | FORBIDDEN, with the same text as above. **The server is the gate.** Hiding the form stops nobody.                                                                                                                                                                   |
| Guess codes                                            | A 20-character code is about 100 bits, so guessing is not a real attack. `auth.signup` and `auth.inviteInfo` still get a per-IP rate limit through the shared `server/rateLimit.ts`, because an open unauthenticated endpoint with none is a finding in any review. |

Wording follows `references/writing-style.md` (§ 4 warnings, § 6 who is
speaking). Check the final strings against it when building.

---

## 5. Seat limits

- **A company invite is a seat from the moment it is issued.** That is the
  existing rule and it does not change. An account created from one fills the
  seat the invite already held, so accepting cannot push a company over its
  limit. It is still re-checked under the lock, as `acceptInviteWithinSeats`
  does today.
- **A new-company invite carries the new company's `seatLimit`**, which the
  platform admin picks when issuing it. The default is 1. The admin screen
  offers **1 / 5 / 15**, the tiers in `references/audit-2026-09-21.md:57`, plus
  a typed number (Q4). It is written onto `companies.seatLimit` in the signup
  transaction.
- **A new-company invite does not use a seat anywhere.** No company exists yet.
- **Still open, and unchanged by this plan:** "Nobody but a platform admin can
  add a seat" (`todo.md`). A company that fills its seats emails the owner.
  That is fine for the first dozen companies and is the first thing billing
  replaces.

---

## 6. What the reset flow does for an invited person

The reset code is on `a-email-reset`. Nothing below changes it, except the
optional line in Q5.

| The person                                                                 | Reset does                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Invited, not yet accepted** (no account)                                 | The same answer as any unknown address: "If that address has an account, a link is on its way." **Nothing is sent.** Reset cannot create an account, so **it cannot get round the gate.** Recommendation: leave it that way (Q5).                                          |
| **Accepted** (has an account)                                              | Exactly what it does for everyone: a 1-hour single-use link, and every old session ends. Their membership, role and company are untouched. **A reset never touches `company_members`.**                                                                                    |
| **Suspended member**                                                       | The password resets, and they are still suspended. Suspension lives on the membership, not on the login. Worth one test, so nobody later "fixes" reset into an un-suspend.                                                                                                 |
| **Old account with no password** (`passwordHash` NULL, from the OAuth era) | The same answer, nothing sent (existing behaviour). With open signup gone, they cannot make a new account either. **Check the live `users` table for any before go-live.** Live was last noted as users 1, 5 and the smoke-test account 1421; count it, do not trust that. |

---

## 7. Migration

**One file, additive, step 1 (before the push). Step 3 is empty.** Its number is
whatever is next when it is written. Today `local-dev` ends at 0095 and
`a-email-reset` holds 0096 and 0097, so it would be **0098 if reset lands first**.
If the directory does not show that when you write it, stop and find out
which branch moved before picking a number. **Hand-write it.** `drizzle-kit
generate` re-emits old columns (CLAUDE.md § migrations).

```sql
CREATE TABLE signup_invites (
  id               int AUTO_INCREMENT PRIMARY KEY,
  codeHash         char(64)     NOT NULL UNIQUE,   -- SHA-256, as company_invites
  email            varchar(320) NOT NULL,          -- the account must use this address (Q2)
  seatLimit        int          NOT NULL,          -- written onto the new company
  earlyAccessId    int          NULL,              -- FK early_access_signups, ON DELETE SET NULL
  note             varchar(255) NULL,              -- "met at supply house", for the admin list
  expiresAt        timestamp    NOT NULL,
  acceptedAt       timestamp    NULL,
  acceptedByUserId int          NULL,              -- FK users, ON DELETE SET NULL
  revokedAt        timestamp    NULL,
  createdByUserId  int          NOT NULL,          -- FK users; the platform admin
  createdAt        timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (email)
);
```

**Why a new table rather than `company_invites.companyId` becoming nullable.**
Every existing reader of `company_invites` assumes a company: the seat count,
the Team screen's list and `acceptInvite`. A NULL there would be counted
towards no company, or towards whichever one the join happened to produce, and
it would compile. A separate table cannot be misread by code that has never
heard of it.

**`company_invites` needs no change** if email stays advisory. If Q2 is
answered "must match" for company invites too, the column already exists. That
is a code change, not a migration.

**Not in this migration, but worth deciding: `users.email` has no UNIQUE
index.** Uniqueness is only a pre-check in `signup`, so two simultaneous
signups can race. The gate narrows the window a lot, because an invite is
claimed first. A UNIQUE index would close it, but **it fails outright if live
already holds a duplicate** (in any case, since the column is not lowercased by
the database). Count duplicates on live first, as a separate item (Q6).

---

## 8. What is needed (build list)

1. **Migration** (§ 7).
2. **`auth.signup` requires `code`.** It resolves the code against both tables
   (the hash is unique across both in practice; check `signup_invites` first),
   then runs the one transaction in § 2. **The membership or company must exist
   before the first `resolveScope`**, or `createPersonalCompany` fires too and
   the invitee ends up owning an empty company of one as well (§ 10).
3. **`auth.inviteInfo(code)`** — public and rate-limited. It returns the kind,
   the company name, the email and the inviter's name, or the rejection reason.
4. **Admin: new-company invites.** A panel beside `SeatLimitsPanel`. It needs
   email, seat limit and note. It lists invites with status, plus revoke,
   resend, and **resend to a different email** (owner answer 2).
   **The waitlist rows get "Invite"**, which fills the email, links
   `earlyAccessId` and stamps `notifiedAt` **only when the send reports
   success**. A stamp for a mail that did not go is the same lie as a save
   flash for a save that did not happen.
5. **Team screen: company invites get an email field and "Send".** Copying the
   code stays. A pending invite gets **"Send to a different email"** for an
   owner or admin (`members.manage`), which is the same revoke-and-reissue as
   the admin's (owner answer 2).
6. **Two email templates in `server/email/`**, one per kind. They name the
   inviter, say when the invite expires and carry a Reply-To (Q3).
7. **Login page:** remove "Create account" and add the invite-only line. Add a
   `#/signup` route. Add `#/signup` to `appRoutes.ts` and its test.
8. **Go-live list.** The owner sends the people who must be able to get in on
   day one (stage-4 § F). Existing accounts are untouched, so this list is only
   for people who **do not have an account yet**.
9. **Before the first OUTSIDE invite goes out, two things must be true**
   (owner, 2026-09-29): the owner's terms sentence exists
   (`ai-correction-log-plan.md` Q5), and the AI correction log is live
   (that plan's "Why now"). Neither blocks building the gate. Both block
   using it on a stranger.

**Tests** (server suite, `appRouter.createCaller`):

- signup is refused with no code, a wrong code, an expired code, a revoked code
  and a used code, **and in each case no user row is written**;
- one code, two concurrent signups, one account;
- a company invite creates exactly one membership, with the invited role, and
  **no personal company** (count `companies` before and after);
- a new-company invite creates one company with the invite's `seatLimit`;
- the email must match the invite (a sent code), and any email works for a
  staff code copied by hand;
- resending to a different email revokes the old code (its link now says
  revoked), binds the new one to the new address, and leaves the company's
  seat count unchanged, **including when the company is at its limit**;
- only `members.manage` can resend a staff invite, and only a platform admin
  can resend a new-company one;
- reset for an invited-but-not-accepted address sends nothing (stub mode
  records the send, so assert that none was recorded);
- the existing `acceptInvite` path for signed-in users still works.

---

## 9. Risks, and what could break elsewhere

- **Depends on `a-email-reset` being merged.** Without it there is no email
  door. The gate _could_ ship first with copy-the-link only, which works for
  three people and not thirty (stage-4 build order). **Recommendation: merge
  reset first.**
- **The lazy personal company (the sharpest one).** `resolveScope` makes a
  company of one for any user with no membership. If the membership is written
  _after_ the session cookie's first request, the invitee owns two companies,
  and the one they land in is empty. It fails silently: they see an empty
  library and think the invite did not work. The transaction order in § 8.2 is
  what prevents it, and the "no personal company" test is what proves it.
- **Every test and script that calls `auth.signup` breaks**, deliberately.
  Searched 2026-09-29 for `auth.signup(` across `server/`, `scripts/` and
  `.claude/skills/`. The only hits are `server/auth.email.test.ts:125` and
  `:160`. That search catches only that call shape, so re-run it wider when
  building (for example `"signup"` in any client or HTTP call).
  `devsession.mjs` mints a session directly and is unaffected. A test helper
  `inviteAndSignUp()` keeps each fixture to one line.
- **The live smoke check (account 1421)** signs in and never signs up, per
  memory. Confirm it does not create accounts before the gate ships.
- **Onboarding (`shared/onboarding.ts`)** keys on `onboardingCompletedAt` NULL.
  An invited _employee_ joins a company whose library already exists. Check the
  welcome flow does not walk them through "set your labor rate" for a company
  they do not own. That is not caused by the gate, but the gate is what first
  creates employees who never had a company of their own.
- **Staging.** With `STAGING_EMAIL_ALLOWLIST`, an invite to anyone not on the
  list is logged as not sent. The admin screen must **say** "not sent — not on
  the staging allow-list", not show a success tick.
- **Email caps.** Resend's free tier is 100 a day and 3,000 a month, per
  `af82b2f`. Invites and resets share it. That is fine for now. A bulk "invite
  the whole waitlist" button is exactly what would hit the cap, so do not build
  one.
- **The landing page's promise.** Its copy says "join the early-access list".
  Once the gate is live, that list is the real way in, so `notifiedAt` has to
  mean "invited", which is why it is stamped only on a real send.
- **Nothing here touches pricing, bids, the takeoff or migrations already on
  live.**

---

## 10. Before the priced starter spreadsheet loads

**The gate itself does not block the spreadsheet, and the spreadsheet does not
block the gate.** They meet in one place: the first outsider through the gate
sees whatever the catalog says that day.

- If invites go out **before** the sheet lands, outsiders see $0 and "Not
  priced" everywhere. The $0 rule is designed for exactly that, and it is
  honest.
- If the sheet lands **first**, the `todo.md` item "give 'nobody has priced
  this' its own signal" **must already be built**, or every outsider's catalog
  reads as fully priced with numbers they never checked. That item already says
  it blocks the upload, so it is not new here. The gate is what puts strangers
  in front of it.

---

## 11. Questions for the owner — ANSWERED 2026-09-29

All seven answered as recommended; see "The owner's answers" at the top, which
also adds resend-to-a-different-email to Q2. Kept below as asked.

1. **Q1. The waitlist "Invite" button — invite one at a time only?**
   Recommendation: yes. There should be no bulk button, because of the email cap
   and because each new company is a support relationship at this stage.
2. **Q2. Must the account use the invited email?** Recommendation: **yes for
   new-company invites** (a forwarded link cannot hand a company to a stranger).
   For **company invites, also yes** now that the link is emailed. Today the
   email is advisory because the code was read out by hand. If a company owner
   copies the code instead of sending it, allow any email, as today.
3. **Q3. Reply-To on invite emails.** bidridge.com has no MX, so no address
   there receives mail. Use the owner's own address, or set up a real inbox
   (for example `hello@bidridge.com` through Google Workspace or a forwarder)?
   Company invites could reply to the inviting company owner. Recommendation:
   **company invites reply to the inviter; new-company invites reply to your
   address.**
4. **Q4. Seat choices on a new-company invite:** 1 / 5 / 15 plus typed?
   Recommendation: yes, default 1.
5. **Q5. Reset for someone invited but not signed up:** send nothing (as
   now), or quietly re-send their invite? Re-sending lets anyone who knows the
   address revoke the old link, although the new one lands in the same inbox.
   Recommendation: **send nothing.** The reset page can add one line: "Invited
   but haven't set up yet? Use the link in your invite email."
6. **Q6. Duplicate emails in `users` on live.** OK for me to count them
   (read-only) so we know whether a UNIQUE index is possible later?
7. **Q7. Existing accounts:** stage-4 says "untouched". Confirm that means
   **every** existing account keeps working, including test accounts on live,
   and that nobody is removed as part of this.
