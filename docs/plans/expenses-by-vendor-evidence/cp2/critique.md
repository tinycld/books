# Gate 2 critique: expenses-by-vendor, checkpoint 2 (Opened vendors, cash rows, live)

Scope judged: the Delivers line (opened vendor lines with the account in each label, cash-basis rows on Method = Cash). Toolbar, params and menu are core or other checkpoints.

Result: 0 INVALID, 0 BLOCKING, 3 NOTE.

## State check

| Shot | State shown | Valid |
|---|---|---|
| opened-1280-light / dark | Accrual, "Harbor Freight Logistics" and "No vendor" opened | yes |
| opened-1024-light / dark | same | yes |
| opened-768-light / dark | same | yes |
| cash-1280-light / dark | Method: Cash, "Cash basis" header, "Harbor Freight Logistics" opened | yes |
| cash-768-light / dark | same | yes |

## Compared with the reference

Kept in all shots: one row for each vendor, the opened lines directly below their vendor in regular weight, the label order "date · type number · account · description", the figure under Total, a blank % of expenses on each opened line, the muted inactive vendor, "No vendor" last, the heavy Total row with 100.00%. On Cash: each ledger line is directly above its take-out row with the opposite figure, then the share rows on the later dates, as the reference `cash` shots show. A label with no description (Write-off 1001 · 6050 Bad debts) has no " · " at its end. No table scrolls sideways at any captured width; all three columns are in view at 768. Light and dark are both legible.

Differences that are not findings: the sort icons in the column headers and the Export button (real core view; the scratch route did not draw them); names and figures (seeded book).

## Findings

### opened-1280-light, opened-1280-dark
- opened-1280-*: "No vendor" lines, row "2026-11-21 · Reversal of JE-12 JE-13 · 6200 Software Subscriptions · …" — two entry numbers side by side with no separator; it is not clear which number is the row's own entry. The spec is met ("a reversal's label holds its number once": JE-13 is there once), and the text comes from the shared `entryTypeNumber()` — NOTE

### opened-1024-light, opened-1024-dark
- opened-1024-*: same reversal row as above — same NOTE (counted once)
- Else nothing found.

### opened-768-light, opened-768-dark
- opened-768-*: page title, top left — "Expenses by …" is cut because the five toolbar buttons take the row; the reference at the paired width (opened-1028) shows the full title, but it has no Export button. The document heading below shows the full title. Core toolbar, not this checkpoint's part — NOTE
- opened-768-*: "No vendor" lines, the block of two-line rows (2026-09-16 to 2026-11-21) — each row keeps the one-line row height, so the space between two rows (about 24 px) is almost the space between the two lines of one row (20 px); the labels read as one paragraph, and three rows start their second line with the " · " separator. The reference (opened-1028) has the same density, so no reference decision is lost; core row — NOTE

### cash-1280-light, cash-1280-dark
- Nothing found.

### cash-768-light, cash-768-dark
- cash-768-*: page title cut to "Expenses by …" — same NOTE as opened-768 (counted once)
- cash-768-*: the seven opened lines of "Harbor Freight Logistics" are all two-line rows with the tight row spacing — same NOTE as opened-768 (counted once)

## For gate 3

Nothing visible.
