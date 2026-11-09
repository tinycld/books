# Critique — general-ledger checkpoint 0, gate 2 (re-capture on merged core)

Scope: checkpoint 0 Delivers (engine v3 F1–F11, client view: opening rows, rollup, viewer sort control, All dates, fit-never-clip, paged grouped reports), judged on the re-captured states against spec §3 / §4 / §5 and plan Do step 5. Reference shots are the pre-core stand-ins (loose anchor). Known approved change: populated-1024 draws one narrowed line, not the tablet layout (Q2).

Verdict: CRITIQUE: 6 INVALID, 3 BLOCKING, 4 NOTE

## State check

| shot | state shown | verdict |
|---|---|---|
| populated-1280-light / -dark | populated, every section open, chips Period This month to date · Rows With activity | valid |
| populated-1024-light / -dark | populated at 1024 — drawn as the two-line tablet layout | valid as a state (see BLOCKING 3) |
| populated-390-light / -dark | populated, phone wrap layout | valid |
| collapsed-1280-light / -dark | every section folded, Expand all in the toolbar, Total row | valid |
| collapsed-390-light / -dark | folded sections, Expand all | valid |
| rows-all-1280-light / -dark | chip "Rows: All" | valid |
| rows-all-390-light / -dark | INVALID — shows the same screen as populated-390: the Rows chip is off-screen to the right of the chip strip (only the Period chip is in view) and the visible rows are section 1000, which every state shows. The state cannot be told from the shot; scroll the chip strip (or capture a section only Rows All adds). | INVALID |
| filtered-1280-light / -dark | chip "Accounts: Business Checking, Company Card" with ×, sections 1000 and 2100, Total row | valid |
| filtered-390-light / -dark | INVALID — same screen as populated-390: the Accounts chip is off-screen in the chip strip and the only visible section is 1000. | INVALID |
| sorted-1280-light / -dark | Debit heading shows the descending glyph, lines reordered by debit inside each section, Balance values stay with their lines | valid |
| sorted-390-light / -dark | "↓ DEBIT", lines reordered | valid |
| all-dates-1280-light / -dark | chip "Period: All dates", header "All dates", every Beginning balance 0.00, Jan 1 Opening balances lines | valid |
| all-dates-390-light / -dark | chip "Period: All dates", header "All dates", Beginning 0.00 | valid |
| more-1280-light / -dark | first page ends after section 1010; a next-page spinner is at the bottom edge of the 800 px viewport (half visible) | valid |
| more-390-light / -dark | INVALID — shows the top of populated-390 (844 px tall); the next-page spinner is below the fold, so the shot is indistinguishable from populated-390. Capture after scrolling to the page end. | INVALID |

Resolved from the carried finding (phase 3 pass 2): on 390 and 1024 the figure-only rows (Beginning balance, section Total, Total, folded section) no longer carry empty text lines — the opening row is label then figures (two lines on 390, one on 1024). Nothing to flag there.

## Findings

### populated-1280, collapsed-1280, rows-all-1280, filtered-1280, sorted-1280, all-dates-1280, more-1280 (light and dark alike)

1. **Section heading, label column — the open section heading is cut to "1000 …", "1010 …", "1100 …", "2100 …" — BLOCKING** (spec §3: "One section per account … labelled "<number> <full name>" ("1000 Cash and bank:Business checking")"; reference populated-1280 shows "1000 Business Checking" in full; the build's own phone layout (populated-390) lets the open heading span the row). The heading row has no other cell on its line, yet F10's narrowing confines it to the label column's floor, so the account name — the one thing a section heading carries — is gone at desktop width. Core defect (F10 narrowing applied to a group-heading row with nothing else on its line); flag per plan Do 5.

2. **Label column at the 8-character floor while the figure columns carry spare width — BLOCKING** (spec §4 F10: "first narrows its text columns (the label first … each to a floor of 8 average characters …; figure columns keep their full width)"; plan Do 5: "core F10 fits the one line at 1280"; spec §3: the label heading "reads "Account / Date"", the first row is ""Beginning balance"", the subtotal is ""Total <number> <full name>""). At 1280 the view is about 956 px wide and the one line does fit, but the fit measure reserves about 105–125 px for each of Debit, Credit and Balance (widest value, bold "$11,880.00", needs about 70 px plus the sort glyph), and pays for it by cutting the label to its floor: heading "ACCOU…", "Beginn…", dates "Oct 2, …" / "Oct 23…" / "Oct 14,…" (the year lost, the cut falling differently per row), subtotals "Total 10…" / "Total 101…" / "Total 110…" / "Total 15…" / "Total 210…" (cut inside the number, so 1000 and 1010 read "Total 10…" and "Total 101…"), and "DESCRI…". "Full width" of a figure column is its widest figure, not an average-character estimate; the text columns should narrow only as far as the line needs. Core defect in `tableLines` / the one-line width measure; flag per plan Do 5. (Same root cause as 3.)

### populated-1024-light / -dark

3. **Whole table — drawn as the two-line tablet layout, not one narrowed line — BLOCKING** (plan Do 5, Q2 human 2026-11-06: "at a 1024 window the GL draws one narrowed line (Name, Description and Split cut to about 10 characters), never its tablet layout, so populated-1024 is re-captured here as that one narrowed line"; spec §3: "When the one line does not fit, text columns … narrow with an ellipsis first … If it still does not fit, the row wraps"). The build wraps at 1024 because its fit measure already puts the label at the floor at 1280 (finding 2), so at 1024 it reports "does not fit" and falls to the authored tablet layout. Secondary, visible only while the tablet layout is drawn: the No. column at one track cuts "JE-41" to "JE-…" and its heading to "N…" — the column's whole content is lost; "TR-3" fits. Core defect; re-capture after the fix.

### populated-390, collapsed-390, sorted-390, all-dates-390, populated-1024 (light and dark)

4. **Wrapped detail rows — lines 2–3 (Name, Description, Split) sit flush with the table's left edge** (x = 12 on 390, 336 on 1024), to the left of the row's own date (indented at 32 / 356) and, on 390, left of the section chevron (22): the lines of one row do not share a left edge, and a row's Split line sits further left than its section heading. The reference did the same. — NOTE

5. **Figure-only rows' label on the phone — "Beginning …" (populated-390 and siblings) and the folded section "1000 Busi…" / "1010 Busi…" / "2100 Com…" (collapsed-390)** are cut to the label track although nothing else is on that line (an open section's heading spans the row on the same screen). The reference did the same. — NOTE

### populated-1280 … all 1280 shots (light and dark)

6. **Heading row — the sort glyph after "ACCOU…" draws smaller and fainter than the glyphs after TYPE, NO., NAME, DESCRI…, SPLIT**; it looks squeezed by the narrowed label column. Would go away with finding 2, so check it then. — NOTE

### more-1280-light / -dark

7. **Bottom of the list — the next-page spinner is half outside the 800 px viewport** (the reference showed it whole under the first page's last row). If the row that holds the spinner has no bottom padding it will always sit on the edge; otherwise this is capture framing. — NOTE

## Clean

all-dates-1280 chip and header ("Period: All dates", "All dates"; the reference's "Period: Any" is gone), sorted-1280 / sorted-390 sort control (direction glyph on Debit, no control on Balance, control on every other heading), opening rows in the muted token, Total row with Debit and Credit and a blank Balance, light and dark contrast: nothing found beyond the items above. No column is cut off at the view's right edge at any width and no shot shows a sideways scroller.

## For gate 3

Nothing visible.
