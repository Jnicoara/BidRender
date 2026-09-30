# Your hand count for the reader accuracy test — step by step

**For the owner.** What this is for: `references/reader-accuracy-test-plan.md`.
In one line: you count the symbols on 4 sheets by hand, once, and the AI's
readings are scored against your count.

**Time: about 2½ to 3½ hours**, plus about an hour if you add a sheet from your
own job. It does not have to be one sitting. Everything saves as you go.

**Everything happens on your own computer**, in the local copy of the app, in
a test account made just for this. Nothing goes near the live site, staging,
or your real account.

---

## Two rules before you start

1. **Do not press "Read sheet" in the test account.** Seeing the AI's answer
   before you count makes your count lean towards it, and then the test
   measures nothing. It also spends money.
2. **Name each count exactly like its legend symbol.** The test matches your
   count "Duplex receptacle" to the legend's "Duplex receptacle" by name
   (capitals and spaces do not matter, spelling does). The script warns you
   about any name that does not match, but it is quicker to get it right once.

---

## Step 1 — Start the app (2 minutes)

In a terminal:

```bash
cd C:\dev\BidPhase-C
pnpm dev
```

Open **http://localhost:3004** in your browser. (This is the Track C copy,
which uses its own local database. Port 3004, not 3000.)

## Step 2 — Make the test account (2 minutes)

1. On the sign-in screen, choose **Create account**.
2. Email: **`reader-test@local.test`**. Any password you will remember. This
   account exists only in the local database on this machine.
3. A welcome screen asks for a labour rate. Type anything; it does not matter
   for this test.

## Step 3 — Make the answer-key bid and add the plans (5 minutes)

1. On the Dashboard, **New bid**. Name it **Reader accuracy — answer key**.
2. On the bid, **Add plans**, and add all three files from
   **`C:\dev\BidPhase-C\reader-accuracy\plans\`**:
   - `Old Blueridge school.pdf`
   - `UNCC.pdf`
   - `Weld 1.pdf`
3. **Your own job (optional, the most useful one):** add the PDF of one of your
   retail jobs to the same bid. Pick a set with a symbol legend and one busy
   power or lighting sheet. It stays on this computer.

## Step 4 — Capture each set's legend (about 15 minutes a set)

For each plan set, open its **legend sheet**:

| Set                  | Legend sheet                    |
| -------------------- | ------------------------------- |
| Old Blueridge school | page 1, E0.01 (right-hand side) |
| UNCC                 | page 1, E001                    |
| Weld 1               | page 1, E-001                   |
| Yours                | wherever its legend is          |

Then, in the **Legend** panel:

1. Press **+ Capture** and drag a box tightly around ONE symbol on the legend.
2. **Name this symbol**: type the legend's own words, shortened if you like
   (for example `Duplex receptacle`, `GFCI receptacle`, `Single pole switch`,
   `2x4 troffer`). Save.
3. Repeat for **every symbol you will actually count** on the sheets below.
   You do not need the telecom, fire alarm or abbreviation entries unless they
   appear on your sheet.

These captured pictures ARE the "legend" the AI is shown in methods (b) and
(d). Box the symbol only, not its label text.

## Step 5 — Count the four sheets (20 to 40 minutes each)

| #   | Set                  | Page | Sheet                                  | What is on it                                          |
| --- | -------------------- | ---- | -------------------------------------- | ------------------------------------------------------ |
| 1   | Old Blueridge school | 4    | E1.02 Main floor power plans           | A scan. Power plan on top, demolition plan below.      |
| 2   | Old Blueridge school | 3    | E1.01 Main floor lighting plans        | A scan. Lighting plan on top, demolition plan below.   |
| 3   | UNCC                 | 5    | E111 Level 2 power and special systems | Clean drawing. The densest sheet in the set.           |
| 4   | Weld 1               | 5    | E-200 Power plan                       | Clean drawing. Power plan, plus a small security plan. |
| 5   | **Yours**            | —    | one busy power or lighting sheet       | Optional.                                              |

**On each sheet:**

1. Press **Count**. In **What are you counting?**, type the symbol's name
   exactly as you captured it, then pick **Count "…"** with that name.
2. **Click the centre of every one of that symbol on the sheet.** Each click
   drops one mark. Zoom in as far as you like.
3. Press **Count** again for the next symbol type, and so on until every
   symbol on the sheet has a mark.

**What to count:**

- **Every device and fixture symbol drawn on a floor plan** — on the new-work
  plan AND the demolition plan. (The AI is asked to report every device on
  the sheet; it has no way to tell new from demolished either. That is a
  separate question.)
- **Not** the legend itself, title blocks, schedules, keynote bubbles, north
  arrows, or symbols inside a one-line or riser DIAGRAM or a detail. Only
  floor plans.
- **Lighting:** name a fixture by its legend symbol. Do not split by type tag
  (A2, A3 …) unless the legend draws them as different symbols.
- **Not sure what one is?** Mark it anyway with your best guess. A missing mark
  in the answer key makes the AI look wrong when it was right.

**Click the middle of the symbol.** The test counts an AI suggestion as "on"
your mark if it is within a third of an inch of paper of it.

## Step 6 — Tell me it is done

Say "hand count done" and I will run the test, or run it yourself:

```bash
cd C:\dev\BidPhase-C
pnpm tsx scripts/readerAccuracy.mts --bid <the bid number> --runs 2
```

The bid number is in the address bar when the bid is open (`#/bids/<number>/…`).
It reads every sheet you put marks on, all four ways, twice, and prints one
table. About $3.60 for the four sheets, a little more with yours. Nothing on
the bid is changed.

---

## If something goes wrong

- **"pnpm dev" says the port is in use:** another copy of the app is running.
  Close it, or ask me.
- **A count name has a typo:** carry on counting. There is no rename button
  for a count on screen yet, so tell me the wrong and right names and I will
  correct it in the local test database; the marks keep their places. The
  script's warning will also name it.
- **You marked something by mistake:** remove that mark as usual. Only what is
  on the sheet when the test runs counts.
- **You want to stop halfway:** just stop. Marks are saved as you place them.
