# Gate 2 critique — checkpoint 4, opened shots after the line-order fix (2026-11-05)

Scope: the four re-captured opened PNGs under `trial-balance-evidence/cp4/` (opened-390-light, opened-390-dark, opened-1280-light, opened-1280-dark) against the reference PNGs of the same names under `trial-balance-reference/`, the spec (`docs/specs/trial-balance-design.md` §3, §5), `docs/helix-lessons.md`, and the second critique (`cp4/critique-2.md`, context only). The picker, customize and the other states were not re-shot and are not re-critiqued.

## 1. State check

| Shot | Shows its state? |
|---|---|
| opened-1280-light | Yes. Business Checking open with three lines labelled "<date> · JE-n · <memo>", amounts by sign, No. blank on the lines, toolbar shows Collapse all, Total row equal on both sides. |
| opened-1280-dark | Yes. Same content in the dark theme. |
| opened-390-light | Yes. Same account open, phone two-line rows, No. blank on the lines, tab bar at rest. |
| opened-390-dark | Yes. Same content in the dark theme. |

No shot is INVALID.

## 2. Critique

Resolved since the second critique:

- **B2 (opened lines in storage order)** — fixed. All four opened shots list Business Checking's lines 2026-01-01 (JE-8), 2026-01-02 (JE-1), 2026-01-05 (JE-2): date order, as spec §3 now states ("The lines read in date order, then entry number"). The reference opened shots run their dates the same way (2026-01-02 → 2026-04-30). The entry-number tie-break is not exercised by this data (no two lines share a date), so the shots prove the date key only; see §4.

Reference decisions the build keeps: the document header block (business name line, "Trial Balance", "As of <day in words>"); Account · No. · Debit · Credit; chart order; a bold account row with a chevron and its number; indented regular-weight lines with No. blank and the amount by sign in Debit or Credit; the heavy rule above Total with the currency symbol on totals only; the phone two-line wrap for the account rows; the chip strip and the Collapse all / Customize / Save as… / Copy link toolbar (1280) and Collapse all + overflow (390). The reference's Books sidebar panel (1280) and green New button (390) are absent in the build because the report lives at core's `/a/reports/<id>` (spec §2 "Books adds no screen and no route"), as the first critique already accepted; not a loss.

Light and dark: the line labels, amounts, chevrons and the Total rule are legible in both themes; no text truncates or wraps badly at either width.

### BLOCKING

None.

### NOTE

**N5 (carried) — opened-390-light, opened-390-dark: each opened line wraps onto two rows where the second row holds only the amount (No. is blank), so the label and its amount sit a row apart with nothing on the second row's left — NOTE.**
Unchanged from the second critique; the reference 390 opened shot does the same, so nothing the reference decided is lost. A one-line detail row when No. is blank (label left, amount right) would read tighter. Cause: core's phone row wrap (E14) wraps every row the same way; not a Books change.

### Per screenshot

- opened-1280-light: nothing found.
- opened-1280-dark: nothing found.
- opened-390-light: second row of each opened line holds only the amount — NOTE (N5).
- opened-390-dark: same — NOTE (N5).

## 3. Reported claims, checked

- Opened lines in date order: **confirmed** in all four shots (2026-01-01, 2026-01-02, 2026-01-05).
- No. blank on opened lines: **still confirmed** in all four shots.
- Amounts by the line's own sign: **confirmed** (500.00 and 25,000.00 in Debit, 1,800.00 in Credit; the account's 23,700.00 net = 25,500 − 1,800).

## 4. For gate 3 (behavior, not appearance)

- The entry-number tie-break (spec §5 `sort` key `[entry, sequence]`) is not visible in these shots because no two lines of Business Checking share a date. The e2e drill-down test (§7 test 5) or the Go `Run` test should post two lines on one day in one account and assert the sequence order, and assert that "JE-10" sorts after "JE-9".
- Every header still reads "Test Organization" (the organization-name fallback); e2e test 1 (§7) must prove the business-name path (carried from critique-2 §4).
