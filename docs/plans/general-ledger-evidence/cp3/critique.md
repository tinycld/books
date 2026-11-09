# Design critique — general-ledger checkpoint 3 (Phone, tablet and large books), re-capture after fix round 1

Judged against the Delivers line: the authored phone and tablet layouts with every column inside the view, paging with the running balance continuing, the 260-line seeded section. Reference: `general-ledger-reference/` (same file names); `populated-900-*` against spec §5; `populated-1024-*` is now the tablet layout; `populated-1280-*` the one line. The first critique (critique-1.md) had 3 BLOCKING on tablet line 2 (Split cut, Name too narrow); this round re-judges the whole set.

## State check

All 26 built shots show the state their name says. None INVALID.

- populated-390 / 900 / 1024 / 1280 (light, dark): This month to date, sections open, line rows. 390 draws the 4-line phone layout; 900 and 1024 draw the 2-line tablet layout; 1280 draws the one line.
- more-390, more-1280: All dates, Accounts = Business Savings, scrolled to the page seam, "Loading more rows…" with spinner, Balance 196.00 → 200.00 (390) and 182.00 → 200.00 (1280) continuing.
- collapsed-390: every section folded, "Expand all".
- rows-all-390: "Rows: All" chip.
- filtered-390: "Accounts: Business Checking…" chip.
- sorted-390: "↓ DEBIT" heading, "Sort: De…" chip, lines reordered by debit (1,250.00 → 800.00 → 450.00), Balance keeps its figures.
- all-dates-390: header "All dates", Beginning balance 0.00.
- customize-390: Customize sheet.
- empty-filtered-390: "No rows for November 1 – November 8, 2026", Clear filters.

## Round-1 BLOCKING, re-checked

- 900 line 2 Split cut: **resolved.** Split is ~180 px at 900 and 1024; "Owner's Equity", "Accounts receivable", "-Split-" are whole on every visible row.
- 900 line 2 Name too narrow: **resolved.** Name is ~168 px (about 16 characters) at 900 and 1024.
- 1024 line 2 Split cut: **resolved** (same as above).

## Findings

### populated-900-light / populated-900-dark
- populated-900: line 2 (Name · Description · Split) — the column widths are not the authored 3 · 5 · 4 tracks: Name ~168 px (2.5 tracks), Description ~444 px (6.6 tracks), Split ~180 px (2.7 tracks). Nothing the reader needs is cut; the only ellipsis is the deliberately long "Register long memo Register long memo …" memo. Spec §5's fit paragraph says core shares a line's spare room by natural width and that `description flexGrow: 2` takes most of it, so the authored tracks place the cells on their lines but do not set the widths. Recorded so the deviation from the §5 sentence is known; the human's column-fit decisions cover it. — NOTE
- populated-900: line 1 — every cell whole ("Journal entry", "JE-10", every figure), "Beginning balance" whole, every right edge inside the table; the opening row's label and figure on one line. nothing found on line 1.
- populated-900-dark: legible; header, section rule and figures read well. nothing found.

### populated-1024-light / populated-1024-dark
- populated-1024: line 2 — same width shape as 900 (Name ~168, Description ~568, Split ~180). Same basis, same classification. — NOTE
- populated-1024: line 1 — every cell whole, "JE-5" / "JE-10" whole, No. heading whole, figures inside the right edge. nothing found on line 1.

### populated-1280-light / populated-1280-dark
- populated-1280: header, label column — "ACCOUNT / DATE" wraps onto two lines ("ACCOUNT /" over "DATE") with its sort icon, so the header row is taller than every other row's heading. The reference drew "ACCOU…" (cut); core now wraps between words (PR #451), so this is core's rule, not a defect, but the label column is the first one F10 narrows, and at 1280 it sits at ~140 px while "Nov 8, 2026" needs about 80. A slightly wider floor on the label column would keep the heading on one line. — NOTE
- populated-1280: Description — about 22 characters at this width ("Seed transfer to savin…", "Entries seed auto reve…", "Reversal of Entries se…", "Register long memo R…") while the Name column holds ~167 px of blank on every seeded row (no seeded line in this period has a party). The Name 16ch floor (spec §5) costs Description that room when no row has a Name. Allowed by F10 ("long text columns (Description, Split, Name) narrow with an ellipsis first") and the reference cut Description too, so not a rule break. — NOTE
- populated-1280: otherwise clean. Every column inside the view, no sideways scroll; Split whole on every row ("Software Subscriptions", "Accounts receivable", "Business Savings"); "Void reversal o…" and "Reversal of JE-…" are the accepted Type exception; "Journal entry" and "Transfer" whole; Balance heading has no sort control (spec §3 F8); "Total 1000 Business Checking" whole; "Beginning balance" whole. Dark legible.

### populated-390-light / populated-390-dark
- populated-390: table headings — no sort control on any heading (the reference draws ↕ on Account / Date, Type, No., Name, Description, Split, Debit, Credit). Sort is reachable through the toolbar Sort item and a "Sort: …" chip (sorted-390), and the active sort draws "↓ DEBIT" on the heading, so the function exists; the reference's heading affordance is not drawn in the wrapped layouts. Core's wrapped header; applies to every -390 shot and to 900 / 1024. — NOTE (carried from round 1)
- populated-390: line 2 (Name · Description) — Name takes ~168 px and Description ~178 px, about half each; the authored phone layout (`GENERAL_LEDGER_PHONE_LAYOUT`: name 1 track, description span 2) and the reference give Description about two thirds of the line. The Name 16ch floor from spec §5 ("a customer name of about 16 characters whole in Name at every width") decides this, so it is not a rule break, but on a phone a memo longer than about 20 characters will end in an ellipsis next to a blank Name on most rows. — NOTE
- populated-390: the four authored lines draw as spec §3: date · Journal entry · JE-5; Description (Name blank); Split; Debit · Credit · Balance right-aligned under their headings. Beginning balance and its figure on one line. Nothing cut, no sideways scroll in the table. nothing else found.

### more-390-light / more-390-dark
- more-390: page chrome — the toolbar (Reports back link, title, Collapse all, Period / Rows / Accounts chips) has scrolled away; only the table header and the sticky section header stay. The reference `more-390` keeps the toolbar fixed above the scrolling rows. Core's scroller; flagged for a decision, not a Books fix. — NOTE (carried from round 1)
- more-390: Balance 196.00 → 200.00 across the seam; "Loading more rows…" with spinner centered below the last row; the sticky section header clips the row beneath it as it should. nothing else found.

### more-1280-light / more-1280-dark
- nothing found. One line; "Daily sweep", "-Split-", 1.00 and the running balance 182.00 → 200.00 all whole; loading row centered; dark legible.

### collapsed-390-light / collapsed-390-dark
- collapsed-390: section rows for accounts with no lines in the period (1500 Office Equipment, 2100 Company Card) print "0.00 0.00" in Debit and Credit; the reference prints blank for Office Equipment. Plan P10 puts `rollup: sum` on group rows, so 0.00 on a section with lines is by design; the empty-section case is a small inconsistency with the reference. — NOTE (carried from round 1)
- collapsed-390: label on one line, figures on the line below, right-aligned under their headings; labels whole where the reference truncated them. nothing else found.

### rows-all-390-light / rows-all-390-dark
- nothing found ("Rows: All" chip; the chip row is the one sideways scroller, decision D11).

### filtered-390-light / filtered-390-dark
- nothing found (the Accounts chip runs off the right edge inside the chip row, D11; the table is unchanged and whole).

### sorted-390-light / sorted-390-dark
- nothing found. "↓ DEBIT" marks the active sort, "Sort: De…" chip in the scrolling chip row, lines reorder and each keeps its Balance.

### all-dates-390-light / all-dates-390-dark
- nothing found. Header "All dates", Beginning balance 0.00, "Jan 1, 2026 · Journal entry · JE-8" on one line, 25,000.00 whole.

### customize-390-light / customize-390-dark
- nothing found. Matches the reference sheet in both schemes.

### empty-filtered-390-light / empty-filtered-390-dark
- nothing found. Matches the reference; the chip row auto-scrolled to show the new Accounts chip.

## Outside this checkpoint (not counted)
- Every built shot's Period chip reads "Period: This month to date" without the "· Nov 1 – Nov 8, 2026" suffix the reference chip shows. Core's `ParamPeriodControl`; recorded so it is not lost.

## For gate 3
- Phone and tablet widths draw no sort control on the headings. Verify that a press on a heading still cycles the sort there (spec §3 F8), or that the toolbar Sort item offers every sortable column and not Balance.
- more-390: the toolbar scrolls away with the rows on a phone (reference keeps it fixed). Confirm this is core's intended scroller, since the reader loses Period / Accounts / Collapse all deep in a 260-line section.

## Totals
INVALID 0 · BLOCKING 0 · NOTE 8 (900 line-2 widths; 1024 line-2 widths — same cause; 1280 label heading wrap; 1280 Description vs blank Name; 390 heading sort control, covering every -390 shot and 900 / 1024; 390 line-2 Name/Description share; more-390 toolbar scroll; collapsed-390 0.00 on empty sections). Four of the eight are carried from round 1 or core-owned; none breaks a quoted spec sentence.
