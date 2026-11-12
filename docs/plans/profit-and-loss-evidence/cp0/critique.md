# Design critique — checkpoint 0 (Core percent and period pivot extensions), gate 2 re-capture of `month-*`

Judged against: Delivers line (P1–P4; `month-*` reference re-captured with the typed month headings), Do step 5 (each month heading in words from core, months before Total, `month-capped-*` with 36 month columns and the `pivotCap` notice), spec §3 "Profit and Loss by Month", §4 P2–P4.

Built shots are pixel-equivalent to the matching reference shots at every width and theme (the re-capture is the reference). No INVALID shots.

## Checks common to every shot

- Month headings are core's typed words ("Jan 2026", "Feb 2026", …; "Jan 2023" … "Dec 2025" on capped). Core's column-heading style draws every heading uppercase ("ACCOUNT", "TOTAL", "% OF INCOME"), so they read "JAN 2026"; the text is the P4 word form, not a raw key. Pass.
- Column order: Account, the months in calendar order, then TOTAL, then % OF INCOME (P3). Pass.
- Every month of the period is a column, including months with 0.00 (6200 Insurance reads 0.00 in Feb, Mar, May, Jun; 4900 Interest earned 0.00 in Apr) (P2). Pass.
- % of income: 100.0% on Total Income, 88.1% / 13.1% / −1.2% on accounts, each computed row its own share; blank on every row of `no-lines` (Total Income 0) (P1). Pass.
- Light and dark: headings, muted month captions, rules, negative figures all legible in both themes. Pass.

## month-populated-1280-light / -dark

State: VALID — populated by-month statement, 11 month columns (Jan–Nov 2026), Total, % of income; five sections open; four computed rows; "End of report".

- month-populated-1280: every row — the row wraps into two automatic lines with the label sharing line 1 with the first seven months (Jan–Jul) and line 2 carrying Aug–Nov, Total, % of income. The header wraps the same way, so the tracks line up. Spec §3 says "core's automatic lines apply: the label on its own line, then the figures in column order, wrapping, each figure whole"; the capture shows the label on the figures' first line. The reference shows the same, this is core's existing fit (not a part this checkpoint delivers), and D5 leaves the by-month geometry to checkpoint 3's gate 2 and checkpoint 4's e2e 10–11. — NOTE (for the driver: reconcile the §3 wording with core's automatic lines before checkpoint 3, or it becomes a BLOCKING there)

## month-populated-1024-light / -dark

State: VALID — same populated statement at 1024; header wraps into four lines (Jan–May / Jun–Nov / TOTAL / % OF INCOME).

- month-populated-1024: every row — the Total figure sits alone on line 3, centered under the row (x≈530 of 1024) with % of income alone on line 4. The header's TOTAL sits in the same track so it is consistent, but a reader scanning down the statement has no column edge to tie "84,250.00" to "Total"; only the track position carries it. Core's automatic lines; reference-identical. — NOTE
- Same label-on-line-1 observation as 1280 (one finding, counted once above).

## month-populated-390-light / -dark

State: VALID — same populated statement at phone width; header wraps into five lines, rows into five lines; no sideways scroll visible; labels keep ≥12 characters ("4000 Service inco...", "4200 Discounts a...").

- month-populated-390: param chip strip — the "Rows: Non-zero" chip is clipped at the right viewport edge ("Rows: Non-zerc" light, "Rows: Non-z" dark on capped). It is core's horizontally scrolling chip strip and the reference shows the same; nothing in this checkpoint changes it. — NOTE
- Same label-on-line-1 observation (counted once).

## month-no-lines-1280-light / -dark

State: VALID — no posted P&L line: the five sections at $0.00 in every month, Total $0.00, the four computed rows $0.00, % of income blank throughout (spec §3 "A period with no posted P&L line shows the five sections at 0.00 and the four computed rows at 0.00, % of income blank"). Pass.

- nothing found

## month-no-lines-390-light / -dark

State: VALID — same empty statement at phone width; Total Income on line 1 with Jan, then 3 per line, Total on the last line, % blank.

- nothing found (the chip clipping is the one NOTE above)

## month-capped-1280-light / -dark

State: VALID — Period "Jan 1, 2023 – Nov 9, 2026"; notice "The pivot shows its first 36 columns; 11 more are left out." (47 months − 36 = 11, correct); header carries exactly 36 month columns (Jan 2023 … Dec 2025: 7 + 8 + 8 + 8 + 5), then TOTAL and % OF INCOME; Total still covers the whole period (84,250.00 / 95,580.00, as in the 11-month state). Pass.

- Same label-on-line-1 observation (counted once).

## month-capped-390-light / -dark

State: VALID — same notice (wraps to two lines, intact), 36 month headings over 13 header lines, Total and % last.

- month-capped-390: every row — a row is 13 lines of figures (2, then 11 × 3, then Total and %); a figure's month is known only by counting positions against the 13-line header. It fits with no sideways scroll, which §3 asks for, and it is the inherent shape of a 36-month pivot on a phone; core's automatic lines, reference-identical. — NOTE

## For gate 3

Nothing visible. (The Collapse all / Customize / Save as… / Copy link buttons are core's and are not exercised in a static capture.)

## Totals

CRITIQUE: 0 INVALID, 0 BLOCKING, 4 NOTE
