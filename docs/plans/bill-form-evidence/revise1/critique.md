# Gate 2 design critique — bill-form revise 1 (core: report labels may break after ':')

Scope: the Delivers of this revise only — a wrapping report label may break after ':', words do not split, Debit stays on line 1 and Credit on line 2 on a phone, at 375 and 390; no change at 1280.

Result: 0 INVALID, 0 BLOCKING, 3 NOTE.

## State check

| Shot | Named state | Shows | Result |
|---|---|---|---|
| trial-balance-375-light | populated trial balance, 375 | populated, 13 account rows, last row cut by the tab bar | VALID |
| trial-balance-375-dark | same | same | VALID |
| trial-balance-390-light | populated trial balance, 390 | populated, 13 account rows | VALID |
| trial-balance-390-dark | same | same | VALID |
| trial-balance-1280-light | populated trial balance, 1280 | populated, 13 rows, Total, "End of report" | VALID |
| trial-balance-1280-dark | same | same | VALID |

## Findings

### trial-balance-375-light
- Decision check: Account, No. and Debit are on line 1 in every row (6200: 1,801.40; 6210: 508.55); Credit is on line 2. No word is split. This agrees with "Keep every other check: names wrap only between words, debit on line 1, credit on line 2".
- trial-balance-375-light: row 6210, account label — the label wraps to 3 lines: "Software" / "Subscriptions:Design" / "Tools". The break after ':' is not used here, because "Subscriptions:Design" fits the column and "Software Subscriptions:" does not. This is permitted by the decision (a break is allowed after ':', not forced). The third line ("Tools") is behind the tab bar in the shot, so the shot does not show that the row grows to hold 3 lines and that the row has a bottom edge. A shot scrolled to the end of the list would prove it — NOTE
- trial-balance-375-light: rows 6200 and 6210 — two wrapped rows one after the other have about 2 px between the last label line of 6200 ("Subscriptions") and the first label line of 6210 ("Software"); single-line rows have about 24 px. The two labels read as one 4-line block. More vertical padding on a wrapped row would separate them — NOTE
- trial-balance-375-light: row 6200, account label — "Software Subscriptions" (no ':') wraps to 2 lines although there is about 20 px of clear space between the label edge and the No. column. Not caused by this revise; the label column is tight at 375 — NOTE

### trial-balance-375-dark
- Same three notes as 375-light (not counted again). Contrast and legibility are correct in dark.

### trial-balance-390-light
- Decision check: row 6210 shows "Software Subscriptions:" on line 1 and "Design Tools" on line 2. The ':' stays on line 1, as "The break is only AFTER ':' (':' stays on line 1)" requires. Debit 508.55 is on line 1. No word is split.
- nothing found

### trial-balance-390-dark
- nothing found

### trial-balance-1280-light
- "Software Subscriptions:Design Tools" is on one line with no visible gap or mark after ':'. Structure agrees with the reference (Account, No., Debit, Credit, Total).
- nothing found

### trial-balance-1280-dark
- nothing found

## Comparison with the reference and the cp5 set
- The reference and the cp5 phone shots put the account name on its own line and No./Debit/Credit below it. The revise1 phone shots put Account, No. and Debit on line 1 and Credit on line 2. The human's correction names this layout as the required one ("debit on line 1, credit on line 2"), so it is not a finding.

## For gate 3
- None visible.
