# Design critique — general-ledger checkpoint 3 (Phone, tablet and large books)

Judged against the Delivers line: authored phone and tablet layouts with every column inside the view, paging with the running balance continuing, the 260-line seeded section. Reference: `general-ledger-reference/` (same file names); `populated-900-*` against spec §5; `populated-1024-*` is now the tablet layout; `populated-1280-*` the one line.

## State check

All 26 built shots show the state their name says. None INVALID.

- populated-390 / 900 / 1024 / 1280 (light, dark): This month to date, sections open, line rows. 390 draws the 4-line phone layout; 900 and 1024 draw the 2-line tablet layout; 1280 draws the one line.
- more-390, more-1280: All dates, Accounts = Business Savings, scrolled to the page seam, "Loading more rows…" with spinner, Balance 196.00 → 200.00 continuing.
- collapsed-390: every section folded, "Expand all".
- rows-all-390: "Rows: All".
- filtered-390: "Accounts: Business Checking…" chip.
- sorted-390: "↓ DEBIT", "Sort: De…" chip, lines reordered by debit, Balance keeps its figures.
- all-dates-390: "All dates", Beginning balance 0.00.
- customize-390: Customize sheet.
- empty-filtered-390: "No rows for November 1 – November 8, 2026", Clear filters.

## Findings

### populated-900-light / populated-900-dark
- populated-900: line 2 of each line row (Name · Description · Split) — the authored tablet tracks are not drawn. Name is ~82 px (about 1 of 12 tracks), Description ~590 px (about 8.5 tracks), Split ~100 px (about 1.4 tracks). Split is cut to an ellipsis on nearly every row ("Owner's Equi…", "Accounts rec…") while Description has several hundred pixels of empty room beside "Register month start". — BLOCKING (spec §5: "line 2 name (3) · description (5) · split (4)"; spec §3 F10: text columns "narrow with an ellipsis first" only "When the one line does not fit" — the tablet layout fits with room to spare, so nothing on line 2 should need an ellipsis; checkpoint Delivers: "its authored phone and tablet layouts")
- populated-900: Name column (line 2) at ~82 px — too narrow for any customer or vendor name (a seeded "St. Jude Community…" would show about 8 characters). Same cause as above. — BLOCKING (spec §5 tablet layout: name (3) of 12 tracks)
- populated-900: line 1 (date · type · No. · Debit · Credit · Balance) — every cell whole, "JE-10" whole, No. heading whole, figures inside the right edge. nothing found on line 1.

### populated-1024-light / populated-1024-dark
- populated-1024: line 2 — the same track defect as 900: Name ~82 px, Description ~730 px, Split ~104 px; "Accounts rece…" cut while Description is mostly empty. — BLOCKING (same basis: spec §5 tablet tracks 3 · 5 · 4; F10 narrowing is for a line that does not fit)
- populated-1024: line 1 — every cell whole; "JE-5", "JE-10" whole; "Beginning balance" and section labels whole; figures inside the right edge. nothing found on line 1.

### populated-1280-light / populated-1280-dark
- populated-1280: Split column — cut to about 10 characters on every row ("Owner's E…", "Accounts r…", "Software S…", "Business S…") while Description keeps about 45 characters and Name is an empty ~80 px column. F10 narrows "from the widest" to a floor of 8 characters; here the narrowest text column sits at the floor and the widest is barely narrowed. The spec v4 `description flexGrow: 2` (human, 2026-11-08) explains part of this, so it is not clearly a rule break; but a reader cannot tell "Accounts receivable" from "Accounts payable" at 1280. Consider a `minWidth` for `split` (for example `16ch`). — NOTE
- populated-1280: otherwise clean. Every column inside the view, no sideways scroll, "Void reversal of …" ellipsis is the accepted Type exception, "Reversal of JE-12" whole, Balance heading has no sort control (spec §3), Total labels whole, Beginning balance whole. Dark legible.

### populated-390-light / populated-390-dark
- populated-390: table header and row headings — no sort control on any heading (the reference draws ↕ on Account / Date, Type, No., Name, Description, Split, Debit, Credit). Sort is reachable through the toolbar "Sort" item and a "Sort: …" chip (seen in sorted-390), and the active sort still draws "↓ DEBIT", so the function is present and the choice is core's wrapped-layout header. The reference's heading affordance is lost; the spec's sentence "pressing Date, Type, No., … sorts" has no visible target on a phone or tablet. — NOTE (applies to every -390 shot and to 900 / 1024)
- populated-390: line rows — the four authored lines draw as spec §3: date · Journal entry · JE-5; Description (Name blank); Split; Debit · Credit · Balance right-aligned under their headings. Beginning balance and its figure on one line. Nothing cut, no sideways scroll in the table. nothing found on the layout itself.

### more-390-light / more-390-dark
- more-390: page chrome — the toolbar (Reports back link, title, Collapse all, Period and Rows chips) has scrolled away; only the table header and the sticky section header stay. The reference `more-390` keeps the toolbar and chips fixed above the table while the rows scroll. On a phone this gives more rows per screen, but the reader loses Period / Accounts / Collapse all while deep in a 260-line section and must scroll back to the top to change them. Core's scroller, so flag for a decision rather than a fix in Books. — NOTE
- more-390: Balance continues 196.00 → 200.00 across the seam; "Loading more rows…" with spinner sits centered below the last row. nothing found.

### more-1280-light / more-1280-dark
- more-1280: nothing found. One line, "Daily sweep", "-Split-", 1.00 and the running balance 182.00 → 200.00 all whole; the sticky section header clips the row beneath it as a sticky header should; loading row centered.

### collapsed-390-light / collapsed-390-dark
- collapsed-390: section rows for accounts with no lines in the period (1500 Office Equipment, 2100 Company Card) print "0.00 0.00" in Debit and Credit; the reference prints blank for a section with no lines (Office Equipment) and 0.00 only where lines exist. Plan P10 puts `rollup: sum` on group rows, so 0.00 on a section with lines is by design; the empty-section case is a small inconsistency with the reference. — NOTE
- collapsed-390: label on one line, figures on the line below, right-aligned under their headings; labels whole where the reference truncated them ("1000 Busi…"). nothing else found.

### rows-all-390-light / rows-all-390-dark
- nothing found (chip "Rows: All"; the chip row is the one sideways scroller, decision D11).

### filtered-390-light / filtered-390-dark
- nothing found (the Accounts chip runs off the right edge inside the chip row, D11; table unchanged).

### sorted-390-light / sorted-390-dark
- nothing found. "↓ DEBIT" marks the active sort, "Sort: De…" chip in the row, lines reorder (1,250.00 → 800.00 → 450.00) and each keeps its Balance.

### all-dates-390-light / all-dates-390-dark
- nothing found. Header "All dates", Beginning balance 0.00, "Jan 1, 2026 · Journal entry · JE-8" on one line.

### customize-390-light / customize-390-dark
- nothing found. Matches the reference sheet.

### empty-filtered-390-light / empty-filtered-390-dark
- nothing found. Matches the reference; the chip row auto-scrolled to show the new Accounts chip.

## Outside this checkpoint (not counted)
- Every built shot's Period chip reads "Period: This month to date" without the "· Nov 1 – Nov 8, 2026" suffix the reference chip shows. Core's `ParamPeriodControl`; a checkpoint 2 / core matter, recorded here only so it is not lost.

## For gate 3
- Phone and tablet widths draw no sort control on the headings. Verify that a press on a heading still cycles the sort there (spec §3 F8) or that the toolbar "Sort" item covers every sortable column, and that Balance is not offered.
- Tablet line 2 widths (Name / Description / Split) do not follow the authored 3 · 5 · 4 tracks. Check whether `GENERAL_LEDGER_TABLET_LAYOUT`'s line-2 spans reach core's placement, or whether core's column-fit (`description flexGrow: 2`, default ellipsis) overrides the authored tracks for that line; the e2e 8 geometry assertions (Debit on the date's line, Name/Description/Split below) pass either way, so they would not catch this.

## Totals
INVALID 0 · BLOCKING 3 (900 split/tracks, 900 name width, 1024 split/tracks — one root cause) · NOTE 5
