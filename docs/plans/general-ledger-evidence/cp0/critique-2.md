# Critique 2 — general-ledger checkpoint 0, gate 2 (re-capture on core main 0cdbe24d, PR #445)

Scope: checkpoint 0 Delivers (engine v3 F1–F11; client view: opening rows, rollup, viewer sort control, All dates, fit-never-clip, paged grouped reports), judged against spec §3 / §4 and the first critique (`critique.md`). The reference set was re-captured at the same moment from the same route, so it is not compared. Human decisions of 2026-11-07 are not findings: F10's 8-character floor on text columns at 1280 ("Total 10…", "Beginn…", "ACCOU…", "Oct 2, …"); the tablet layout at 1024; the "JE-…" / "N…" cut in the tablet No. column (checkpoint 3).

Verdict: CRITIQUE: 0 INVALID, 0 BLOCKING, 5 NOTE

## Follow-up on critique 1

- **BLOCKING 1 (open section heading cut to "1000 …") — gone.** Every 1280 shot (populated, collapsed, rows-all, filtered, sorted, all-dates, more) shows the open heading in full: "1000 Business Checking", "1010 Business Savings", "1100 Accounts receivable", "1500 Office Equipment", "2100 Company Card"; collapsed-1280 shows every folded heading in full down to "6210 Software Subscriptions:Design Tools". Light and dark alike.
- **BLOCKING 2 and 3 — closed by the human decision** (F10 floor accepted; tablet layout at 1024 accepted).
- **The 6 INVALID 390 shots now show their state:**
  - rows-all-390 light/dark: the chip strip is scrolled; "Rows: All" chip is in view (with "+ Add filter" after it).
  - filtered-390 light/dark: the chip strip is scrolled; "Accounts: Business Checking, Company Card ×" chip is in view.
  - more-390 light/dark: the list is scrolled to the page end; section 1010 Business Savings, its Oct 5 line, then the next-page spinner whole above the tab bar.

## State check

| shot | state shown | verdict |
|---|---|---|
| populated-1280-light / -dark | populated, every section open, chips Period This month to date · Rows With activity, full headings | valid |
| populated-1024-light / -dark | populated at 1024, tablet two-line layout (accepted) | valid |
| populated-390-light / -dark | populated, phone wrap layout | valid |
| collapsed-1280-light / -dark | every section folded, Expand all, Total row | valid |
| collapsed-390-light / -dark | folded sections, Expand all | valid |
| rows-all-1280-light / -dark | chip "Rows: All" | valid |
| rows-all-390-light / -dark | chip "Rows: All" in the scrolled strip | valid |
| filtered-1280-light / -dark | chip "Accounts: Business Checking, Company Card ×", sections 1000 and 2100, Total row | valid |
| filtered-390-light / -dark | the Accounts chip with × in the scrolled strip, section 1000 | valid |
| sorted-1280-light / -dark | "↓ DEBIT" glyph, lines inside each section reordered by debit descending, Balance stays with its line | valid |
| sorted-390-light / -dark | "↓ DEBIT", lines reordered | valid |
| all-dates-1280-light / -dark | chip "Period: All dates", header "All dates", every Beginning balance 0.00, Jan 1 Opening balances lines | valid |
| all-dates-390-light / -dark | same at 390 | valid |
| more-1280-light / -dark | first page ends after section 1010; next-page spinner at the bottom edge of the 800 px viewport | valid |
| more-390-light / -dark | scrolled to the page end; spinner whole | valid |

## Findings

### populated-1280, collapsed-1280, rows-all-1280, filtered-1280, sorted-1280, all-dates-1280, more-1280 (light and dark)

1. Heading row — the sort glyph after "ACCOU…" draws smaller and fainter than the glyphs after TYPE, NO., NAME, DESCRI…, SPLIT, DEBIT, CREDIT; it reads as squeezed by the label column at its floor. Carried from critique 1 (NOTE 6). — NOTE

### collapsed-1280, populated-1280, rows-all-1280, sorted-1280 (light and dark)

2. Section total / folded group rows, Debit and Credit — a section with lines in the period prints a zero side as "0.00" / "$0.00" (1010 Credit, 2100 Debit, 6100/6200/6210 Credit) while a section with no line in the period (1500, 3000, 3900) leaves both blank; the same column mixes "0.00" and blank for "nothing" on adjacent rows. Fixture data decides this on the scratch route; check the real run in checkpoint 2 (P10's `rollup: sum([debit])` gives 0.00 over lines and blank over none). — NOTE

### populated-390, collapsed-390, rows-all-390, filtered-390, sorted-390, all-dates-390, more-390, populated-1024 (light and dark)

3. Wrapped detail rows — lines 2–3 (Name, Description, Split) sit flush with the table's left edge (x = 12 on 390, 336 on 1024), left of the row's own date (32 / 356) and, on 390, left of the section chevron (22); the lines of one row do not share a left edge. Carried from critique 1 (NOTE 4). — NOTE

### populated-390, rows-all-390, filtered-390, sorted-390, all-dates-390, more-390, collapsed-390 (light and dark)

4. Figure-only rows on the phone — "Beginning …" (opening row) and the folded section "1000 Busi…" / "1010 Busi…" / "2100 Com…" (collapsed-390) are cut to the label track although nothing else is on that line, while the open heading on the same screen spans the row. PR #445 spans a group label over the empty cells in the one-line layout only; the wrap layout's folded group row and opening row still cut. Carried from critique 1 (NOTE 5). — NOTE

### more-1280-light / -dark

5. Bottom of the list — the next-page spinner is half outside the 800 px viewport (more-390 shows it whole with room under it, so the row itself has bottom padding; this is capture framing at 1280). Carried from critique 1 (NOTE 7). — NOTE

## Clean

Open section headings in full at 1280 (the fix under test); All dates chip and header; sort control (direction glyph on Debit, no control on Balance, control on every other heading); opening rows in the muted token; Total row with Debit and Credit and a blank Balance; filtered Total adds only the two sections ($3,650.00 / $4,462.30); light and dark contrast. No column is cut at the view's right edge at any width; no shot shows a sideways scroller.

## For gate 3

Nothing visible.
