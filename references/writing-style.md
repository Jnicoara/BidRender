# How BidRidge is written

The app already has a voice, and a good one. This file writes it down so it
survives the next hundred strings.

It is short on purpose. If it grows past two screens nobody will read it, and a
style guide nobody reads is worse than none — it becomes something to cite in an
argument rather than something that shapes the work.

**The test for every line:** an electrician reads it once, on a laptop, in a
truck, against a deadline. Would they know what to do next?

---

## 1. Case

**Sentence case everywhere.** Page titles, buttons, section headings, column
labels, tabs, tooltips. Capitalise the first word and proper nouns, nothing
else.

> Winning work · What the work earned · Getting started · Upload a plan ·
> Empty bid · Start my first bid · No bids in this period

The only capitalised words are the product name, a person's name, a company
name, and a place. `BidRidge`, not `bidridge`. A screen name inside a sentence
is sentence case too: "set it in Settings" is a place, "your labor rates" is not.

**The exception, and it is narrow:** the landing page's `<title>` tag stays
title case, because that is the convention in a search result and it is read by
strangers, not users.

---

## 2. Periods

**A full sentence gets a period. A fragment does not.**

> `Archive — out of the working list, restorable any time` ← fragment, no period
> `Bids that already priced it keep the costs they were quoted at.` ← sentence

This covers almost everything. Tooltips and one-line hints are usually
fragments; help text under a heading is usually sentences. When a fragment and a
sentence sit together, the sentence wins and both get punctuated properly.

**Never a period on a button or a heading**, however long.

---

## 3. Length

| Kind of text         | Aim for                              | Hard stop |
| -------------------- | ------------------------------------ | --------- |
| Button               | 1–3 words                            | 4         |
| Page subtitle        | 10–20 words                          | 25        |
| Field hint / tooltip | up to 15 words                       | 20        |
| Empty state          | 1 short sentence + 1 explaining line | 45 words  |
| Warning or error     | 1–2 sentences                        | 40 words  |

**A second sentence has to earn its place.** If the first sentence already told
them what to do, delete the second. Most overlong help text in this app is one
good sentence with an apology attached to it.

---

## 4. Warnings and errors

**Two parts, in this order: what happened, then what to do about it.** The
second part is the one that gets left off, and it is the one that matters.

> **Good:** `The PDF could not be built. The CSV is unaffected.`
> **Good:** `PLAN_STORAGE=r2 but the plan bucket is not configured. Missing: R2_PLANS_BUCKET.`
> **Not finished:** `That plan could not be opened.`

If there is genuinely nothing to do, say what is **unaffected** instead — that
is the reassurance the reader is actually looking for.

Rules that are not negotiable:

- **Never blame the reader.** Not "you entered an invalid value" but "a rate
  cannot be negative".
- **Never say "Something went wrong"** or "An error occurred". They are the same
  as saying nothing, and they read as a page that does not know what it is doing.
- **Name the thing.** Which file, which field, which bid.
- **Say what survived.** A contractor's first thought on any error is "did I
  just lose my work?" Answer it before they have to ask.

---

## 5. Empty states

**Name what is empty, then say in one line what puts something here.**

> `No kits yet. Build one to bundle the assemblies you repeat.`
> `Nothing archived. Removing a kit from the working list puts it here.`

Not just `No clients yet.` — that tells them what they can already see.

**The exception:** a narrow column in a board may carry a bare two-word label
(`Nothing here`), because there is no room and the column heading has already
said what would go there.

**Never sell in an empty state.** No "Get started by…", no exclamation marks, no
encouragement. State the fact and the next move.

---

## 6. Who is speaking

**The reader is "you".** Their things are "your labor rates", "your own copy".

**There is no "we" and no "I" inside the app.** The only place "we" is allowed
is the landing page and the early-access messages, where a real person is
promising to get in touch.

**Name the product sparingly.** Default to saying the thing, not "BidRidge does
the thing":

> **Yes:** `Plans up to 2GB.`
> **No:** `BidRidge supports plans up to 2GB.`

Name it only when the product is genuinely the actor and that fact is the point
— it refuses something, it does not know something, it is greeting a new user:

> `BidRidge does not know your tax rates — you do.`
> `Welcome to BidRidge`

---

## 7. Contractions

**Spell them out inside the app.** `cannot`, `does not`, `is not`, `could not`.
The app already does this 250-odd times against a handful of exceptions, and the
full form reads steadier next to numbers someone is about to bet a job on.

**Contractions are allowed on the landing page**, where the voice is a person
talking rather than a tool reporting. `We'll be in touch.`

---

## 8. Money, numbers and units

**Money.** US dollars, grouped with commas.

| Where                                           | Decimals    | Why                                 |
| ----------------------------------------------- | ----------- | ----------------------------------- |
| Bid totals, dashboard figures                   | **0**       | Read at a glance; cents are noise   |
| Line items, labor rates, kit and assembly costs | **2**       | The working numbers                 |
| Material unit cost                              | **up to 4** | A wire nut really does cost $0.0432 |

**Hours:** the number, then a space, then `h` — `72.98 h`. Two decimals at most.
Never `hrs`, never `hours` beside a figure.

**Percentages:** whole numbers with `%` and no space — `18%`. Signed when it is
a change — `+12%`. An em dash `—` when there is nothing to show.

**Counts:** always pluralise properly — `1 bid`, `2 bids`. Never `1 bid(s)`.

**Dates:** the reader's locale. Never a bare numeric date that could be read two
ways.

**Zero is not blank.** A price nobody has set shows `$0` and is flagged, because
a blank reads as "not applicable" and a zero reads as "wrong, fix me". That is a
product rule as much as a writing one — see `CLAUDE.md` § Starter content.

---

## 9. Words — pick one and keep it

| Use                | Not                             | Why                                                                             |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------------- |
| **takeoff**        | take-off, take off (noun)       | One word, the way the trade writes it                                           |
| **bid**            | job, project, estimate (noun)   | The thing you build and the number you send                                     |
| **proposal**       | quote, quotation                | The document the customer receives                                              |
| **quote**          | —                               | Reserved for what a **supplier** gives **you**. Never the customer's document   |
| **estimated**      | quoted (of your own hours)      | `estimated hours`; "quoted" belongs to suppliers                                |
| **labor**          | labour                          | US spelling throughout                                                          |
| **cable**          | wire (for a self-contained run) | A run that **is its own raceway** — MC, Romex. No pipe around it                |
| **wire**           | cable (for conductors in pipe)  | The **conductors pulled through** a conduit. Counted per conductor, per circuit |
| **material**       | item, product, part             | The catalog row                                                                 |
| **assembly**       | recipe, template                | Materials plus hours for one installed thing                                    |
| **kit**            | bundle, package                 | A group of assemblies                                                           |
| **modifier**       | adjustment, factor              | A job condition that changes hours                                              |
| **crew**           | team, staff, users              | The people in your company                                                      |
| **archive** (verb) | hide, remove, disable           | Reversible. **delete** is forever, and says so                                  |

> **"Quote" is a labelling rule, not a comprehension rule.** Contractors say
> "I quoted that job at $13k" and always will. So the word is kept off buttons,
> headings and help text — but anywhere the app has to UNDERSTAND the word
> rather than display it, "quote" must still find proposal things. That means
> search, the navigation helper's vocabulary, and any future help lookup. A
> vocabulary that only accepts the house term is a vocabulary that fails the
> people it was written for. Same principle as trade slang on materials: the
> label is what it is, the slang is how it is found.

> **Cable and wire are two different things, and the app means both.** A
> **cable** run is self-contained — MC or Romex, its own raceway, one line on the
> bid. A **wire** run is the conductors pulled through a conduit, counted per
> conductor per circuit, with the pipe counted separately. The totals panel
> shows Conduit / Cable / Wire for exactly this reason and the three are not
> interchangeable.
>
> On its own, the word "cable" on a button is ambiguous enough to be worth
> disambiguating — hence `Trace cable (MC/Romex)` rather than `Trace cable`. The
> fix was the ambiguity, not the word.

**Trade slang belongs in search, not in labels.** A material is found by "1900"
and "gem box"; it is _labelled_ `4" square box`. The label is what it is, the
slang is how it is found.

---

## 10. Things to just not do

- **Exclamation marks.** None, anywhere.
- **"Please".** It is padding. `Enter an hourly rate`, not `Please enter…`.
- **"Simply", "just", "easily".** If it were easy they would not be reading the
  hint.
- **"Oops", "Uh oh", "Whoops".** See § 4.
- **Em dash pile-ups.** One per sentence. The `thing — consequence` pattern is
  the house style and it stops working when there are two.
- **Restating the label.** A field called "Hourly rate" does not need a hint
  reading "the hourly rate".
- **Tooltips that repeat the visible text.** If the label is complete, no tooltip.
