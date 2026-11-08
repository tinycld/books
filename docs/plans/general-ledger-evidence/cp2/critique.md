# Critique — general-ledger checkpoint 2, gate 2 (real report on the seeded e2e book, 1280, light and dark)

Scope: checkpoint 2 Delivers (the shipped `books.general_ledger` as a v3 report: sections in chart order, beginning, running and ending balances by the normal side, every line column, Rows, Accounts, Period with All dates, totals, viewer sort). Reference: `general-ledger-reference/<same name>` (phase-3 fixture, re-captured on core 0cdbe24d; a loose anchor). Not findings, by the human decisions of 2026-11-07: the F10 8-character floor on text columns ("Total 1000 Business C…", "Reversal of JE…", "Register mont…"); the core view (chips, toolbar, period words, currency sign on totals, Customize panel). The cp0 NOTEs (`cp0/critique-2.md`) are re-raised only where the real report shows them differently.

Verdict: CRITIQUE: 0 INVALID, 0 BLOCKING, 2 NOTE

## State check

| shot | state shown | verdict |
|---|---|---|
| populated-1280-light / -dark | report open, chips Period "This month to date · Nov 1 – Nov 7, 2026" · Rows "With activity", header Test Organization / General Ledger / November 1 – November 7, 2026, sections 1000 and 1010 open with Beginning balance, lines, section totals; 1100 begins at the bottom | valid |
| collapsed-1280-light / -dark | every section folded (1000 … 6200 in chart order), "Expand all" in the toolbar, Total row $5,961.00 / $5,961.00, Balance blank | valid |
| rows-all-1280-light / -dark | chip "Rows: All"; section 1000 and 1010 as populated | valid |
| filtered-1280-light / -dark | chip "Accounts: Business Checking, Company Card ×"; sections 1000 and 2100 only (2100: Beginning balance 2,220.00, no line, Total $0.00 / $0.00 / $2,220.00); Total $3,041.00 / $2,620.00 | valid |
| sorted-1280-light / -dark | "↓ DEBIT" glyph; lines inside 1000 ordered by Debit descending (1,250 · 800 · 450 · 400 · 120 · 20 · 1, then the credit-only lines in report order); each line keeps its Balance | valid |
| all-dates-1280-light / -dark | chip "Period: All dates", header "All dates", every Beginning balance 0.00, Jan 1 / Jan 2 / Jan 5 seeded lines first, Total 1000 $28,541.00 / $4,420.00 / $24,121.00 | valid |
| customize-1280-light / -dark | Customize panel open (Number format, Negative numbers −100 / (100), red negatives, Columns, Reset to defaults); table narrowed and wrapped | valid |
| empty-filtered-1280-light / -dark | chip "Accounts: Sales tax payable ×", "No rows for November 1 – November 7, 2026", Clear filters; no Collapse all | valid |

## Findings

### populated, rows-all, filtered, sorted, all-dates (light and dark)

1. Name column — blank in every visible line row of every shot (sections 1000 Business Checking and 1010 Business Savings, including the Jan 1 / Jan 2 / Jan 5 seeded lines under All dates), so at 1280 the column reads as dead space between No. and Description. Spec §6 names `seed.ts` as changed so that "a customer and a vendor on seeded lines" make "the Name column show in the seeded book". The seeded party lines may sit on accounts below the fold (1100 Accounts receivable, 2100 Company Card, 4000, 6200); check one of those sections in the real book. If no seeded line carries a party, that is a gap of the checkpoint that owns `seed.ts` (not listed in checkpoint 2's Files). — NOTE

2. Line rows, Type and Description — the five text columns get equal widths (about 128 px each) while the table has 1,216 px, so Type cuts "Reversal of JE…" and "Void reversal …" (the entry it reverses is lost) and Description cuts nearly every memo ("Register mont…", "Entries seed p…"), while Name is empty and No. has slack. The cut itself is accepted (F10 floor); this is the distribution of the slack across text columns, which is core's `tableLines` / `ReportTable`, not Books'. — NOTE

## Clean

- Structure of the reference holds: section heading (chevron, bold "<number> <full name>"), Beginning balance first in the muted token at detail depth, lines in date order, "Total <number> <name>" bold with the ending balance, report Total with a blank Balance.
- Figures reconcile on screen: 1000 opens at 23,700.00 (= the All dates run's balance after Jan 5), each line's Balance moves by its own side, Total 1000 Debit 3,041.00 = the sum of the debit cells, Credit 2,620.00, ending 24,121.00 = beginning + net; 2100 Company Card (credit-normal) shows a positive beginning balance; sorted view keeps each line's Balance; the Total row's Debit equals its Credit with no Accounts filter and adds only the two sections when filtered.
- Zero sides: blank on line rows; "0.00" / "$0.00" on every folded group row and section total, with lines or without (1010 Credit, 1500, 2100, 3900, 4000 both sides). That resolves cp0 NOTE 2: the real report is consistent where the fixture mixed "0.00" and blank.
- cp0 NOTE 1 (the squeezed glyph after "ACCOU…"): with the core route's wider table the label column prints "ACCOUNT / DATE ⇅" in full and the glyph matches the others. Not seen in the built shots.
- Sort control on Account / Date, Type, No., Name, Description, Split, Debit, Credit; none on Balance. "↓ DEBIT" for the descending state.
- All dates: chip, header words and 0.00 openings.
- Empty filtered state: the message names the period; Clear filters is a core Button (not the faint text-accent action); the toolbar drops Collapse all.
- Light and dark: headings, muted opening rows, hairlines, bold totals and the Customize controls are legible in both; no raw-colour oddity.
- No column cut at the right edge; no sideways scroll in any shot.

## Not findings (context for the driver)

- The built shots have no Books sidebar (icon rail only); the reference shows Banking / Lists / Reports / Accounting. The built report lives at core's `/a/reports/<id>` as spec §2 decides ("Books adds no screen and no route"), the Trial Balance's model; the reference's sidebar is the scratch route's frame. The extra 260 px is why the built label column and "Beginning balance" print in full where the reference cut them.
- customize-1280: the narrowed table wraps with core's automatic lines (the date alone on line 1, every other cell on line 2, rows about 88 px tall) where the reference wraps with the authored tablet layout (date · type · no. · debit · credit · balance / name · description · split). Checkpoint 2 ships no `display` ("No `display` yet (checkpoint 3)"); the authored layout is checkpoint 3's. The left-edge offset between line 1 and line 2 is cp0 NOTE 3, unchanged.
- collapsed-1280: "Expand all" is tinted (teal text on a pale fill in light) — the pointer rests on the button after the capture's click; core's hover state, not a folded-state style.

## For gate 3

Nothing visible.
