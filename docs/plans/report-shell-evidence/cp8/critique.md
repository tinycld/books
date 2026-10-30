# Checkpoint 8 — Report table renderer — gate 2 critique

Scope judged: the Trial Balance table only (column-label row, detail rows, total row, money cells, label truncation, phone and wide layouts). Sections, folding, filters, Customize and the business-name line are not judged (not reachable or later checkpoints).

## State check

| Shot | Expected | Shows | Verdict |
|---|---|---|---|
| tb-1280-light | populated, Today | 8 detail rows + Total, "As of October 26, 2026" | VALID |
| tb-1280-dark | populated, Today | same as light, dark theme | VALID |
| tb-390-light | populated, Today | same rows, phone layout | VALID |
| tb-390-dark | populated, Today | same rows, phone layout, dark theme | VALID |

## Measurements (from the pixels)

- Wide: rows 44pt apart; amount right edges 1138 (Debit) and 1266 (Credit) on every detail row, on the Total row and on the heading row; label starts at 341 on heading, detail and Total. Heading rule 1px; Total rule 2px dark (foreground). Table spans 324–1280, the same as the document header (full width, no card).
- Phone: amount right edges 268 and 376 on every row and on the heading; columns 108pt each; label column takes the rest (0–162) and cuts at ~157 with an ellipsis; rows 44pt; Total rule 2px. No sideways scroll.
- Tabular figures: decimal points stack in one column across rows of different magnitudes.
- Symbol: detail rows bare numbers; Total row "$32,901.00" in both columns, semibold. Debit equals Credit.

## Findings

**tb-1280-light:** nothing found.

**tb-1280-dark:** nothing found. Heading row (`bg-background`) sits visibly below the `bg-card` document header; Total rule reads as a light foreground line; muted column labels stay legible.

**tb-390-light:**
- tb-390-light: amount cells — a 108pt column with `px-3` leaves 84pt of text room; a semibold total such as "$32,901.00" already uses ~80pt, so a seven-digit total ("$132,901.00") on a phone would be cut by `numberOfLines={1}`. Not visible in this capture; the spec sets the 108pt rule, so this is a watch item for `p5-trial-balance`, not a defect of this build — NOTE.

**tb-390-dark:** nothing found beyond the same NOTE as tb-390-light.

## Against the reference

The build keeps every decision the reference made for this slice: full-width table flush with the document header, uppercase muted column labels with a 1px rule, 44pt rows, right-aligned tabular money with bare numbers on detail rows and the currency symbol on the semibold Total under a 2px foreground rule, 128pt amount columns wide and 108pt amount columns on phone with the label truncating on one line. Differences (no Customize / Add filter, no business name, Today instead of End of last month, fewer rows) are data or later checkpoints.

## Verdict

No BLOCKING findings. One NOTE. Gate 2 passes for checkpoint 8.
