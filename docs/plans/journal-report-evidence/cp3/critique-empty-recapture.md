# Gate 2 critique — journal-report checkpoint 3, empty state (re-capture)

Scope: the four re-captured `empty-*` shots only. Delivers line judged: "shows core's empty state for a period with no posted line". Reference: `docs/plans/journal-report-reference/empty-{1280,390}-{light,dark}.png`.

## State check

- empty-1280-light: VALID. Custom period Jul 2, 2026; document header (business name, "Journal", "July 2, 2026"); "No rows for July 2, 2026" with the "Show this fiscal year" action; no table.
- empty-1280-dark: VALID. Same state in dark.
- empty-390-light: VALID. Same state at phone width; toolbar has measured the width (Period chip and Customize fit one line, no cut element).
- empty-390-dark: VALID. Same state in dark.

## Findings

### empty-1280-light
- Left of the report — the Books package sidebar (New, Banking, Lists, Reports, Accounting) of the reference is absent; only the app rail shows, and no rail icon is marked active (neither Books nor Reports). The built URL is core's `/a/reports/<id>` (spec §2 "Books adds no screen and no route"; D5: the view is core's), so this is the shell's choice for a core route, not a Books decision — NOTE
- Empty text and action — matches spec §3 "empty 'No rows for <period>' with 'Show this fiscal year'"; the action is a bordered core Button, legible in light (lesson 14). Nothing found.

### empty-1280-dark
- Same sidebar / active-marker note as light — NOTE
- Text, chip, document header and button are legible on the dark surface; divider lines visible. Nothing else found.

### empty-390-light
- Toolbar — a "Sort" chip sits beside Period although the run has no rows to sort; the reference shows Period alone in the empty state. The chip is core's phone sort control (D5), so no Books rule is broken — NOTE
- Bottom tab bar — no tab is marked active (reference marks Books). Same cause as the 1280 sidebar note: core route — NOTE
- Period chip, document header, empty text and action all fit inside 390 px with no wrap or cut. Nothing else found.

### empty-390-dark
- Same Sort-chip and tab-bar notes as 390-light — NOTE
- Legible in dark. Nothing else found.

## For gate 3

Nothing visible.

## Verdict

CRITIQUE: 0 INVALID, 0 BLOCKING, 3 NOTE (sidebar/active marker on a core route; Sort chip in the empty phone toolbar; inactive phone tab bar — all core-owned per D5)
