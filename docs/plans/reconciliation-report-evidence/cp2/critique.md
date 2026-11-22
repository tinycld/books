# Gate 2 critique: reconciliation-report, checkpoint 2

Scope: the Reconciliation Report in core's report view (the finished summary's buttons are compared at checkpoint 3).
Compared with the reference by the width map of settled difference 5. Settled differences 4, 5 and 6 are not findings. Seed figures, no Books sidebar, core's Export button, core's sort arrows and the Sort chip are not findings.

Result: 0 INVALID, 1 BLOCKING, 5 NOTE.

## State check

| Shot (light and dark) | State shown | Result |
|---|---|---|
| report-1440 | One statement (chip "Statement: Aug 31, 2026"), one line for each row | valid |
| report-1280, report-1024, report-768 | One statement, two-line tablet arrangement | valid |
| report-390, report-375 | One statement, phone arrangement | valid |
| report-all-1440, -1280, -768, -390, -375 | No filter chip; the list starts with 1010 Business Savings | valid (see NOTE 5: only one section is in the frame) |
| report-account-1440 | Chip "Account: Company Card"; two sections of 2100 Company Card | valid |
| report-empty-1440, report-empty-390 | Chip "Statement: 1 selected"; "No rows" with Clear filters | valid |

## Findings

### report-1440 (light, dark) against report-1700
Nothing found. Column order is that of settled difference 4. The section row fills Statement ending and Reconciled on only; the subtotal row shows Debit, Credit and Balance; the grand total has no Balance. Dark is legible.

### report-1280 (light, dark) against report-1540
Nothing found. Two-line arrangement agrees with the reference (date, transaction, figures on line one; payee, memo on line two).

### report-1024 (light, dark) against report-1284
Nothing found.

### report-768 (light, dark) against report-1028
- report-768: toolbar, top left: the screen title is cut to "Reconciliatio…" because the five buttons take the row (the reference at the same content width shows the full title; it had no Export button) — NOTE. Core's toolbar; the document title below shows the full name.
- The cut subtotal label ("Total 2100 Company Card · reconciled by Test …") is settled difference 6: not a finding.

### report-390, report-375 (light, dark) against report-390, report-375
- report-390: filter row, right edge: the Sort chip is cut at the window edge (only its icon shows) — NOTE. Core's chip row; the reference has no Sort chip. Not visible at 375.
- report-390, report-375: each transaction row: the payee line is empty (the seed's entries have no payee), so a blank line of about 28 px stands between "Journal entry JE-31" and its memo — NOTE. The reference has the same gap on its "Transfer" rows; core does not close an empty line.

### report-all-1440, -1280, -768, -390, -375 (light, dark) against report-all-1700, -1540, -1028, -390
Nothing found in what the frame shows (header, section row, opening row, rows, running balance).
- NOTE 5 (coverage, all five widths): the 2400 px frame holds only the first section (1010 Business Savings, 46 or more "Daily sweep" rows). No second section, no subtotal row and no grand total are in any report-all shot. The reference decisions "a subtotal closes each section", "the next section follows" and "no grand total in Balance" are shown only by report-account-1440 (one line) and report-1280/1024/768 (tablet). On the phone arrangement no built shot shows a subtotal row or the grand total (report-390 and report-375 end before them). A phone shot with the statement filter and a taller frame (about 1400 px) would show them.

### report-account-1440 (light, dark) against report-account-1700
- report-account-1440: filter chip, top left: the chip reads "Account: Company Card", with no account number; the reference chip reads "Account: 1000 Business Checking" — BLOCKING (spec: "**Account** — many of the bank and credit card accounts, by account number."; reference decision: the chip names the account as number and name, as the section rows do: "2100 Company Card"). Two accounts with one name in different parents cannot be told apart in the chip or the option list.
- The rest agrees with the reference: two sections, newest statement first, a subtotal for each, the section with no cleared row (Jul 31, 2026) shows its opening row and a $0.00 subtotal, the grand total has no Balance.

### report-empty-1440, report-empty-390 (light, dark) against report-empty-1700, report-empty-390
- report-empty-*: filter chip: "Statement: 1 selected" in place of a statement date, because the id in the URL is not an option of the filter — NOTE. A user gets this text from a saved link to a reconciliation that was undone later. Core's chip text.
- report-empty-390: the cut Sort chip, as report-390 — same NOTE, not counted again.
- The empty state itself ("No rows", Clear filters, no Collapse all) agrees with the reference.

## For gate 3
- Nothing visible.
