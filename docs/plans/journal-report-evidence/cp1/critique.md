# Design critique — journal-report checkpoint 1 (gate 2)

Delivers judged: one open block per posted entry headed "<number> · <type>", lines with date, account, name, description, debit, credit; block and report totals; date/posting/sequence order; foldable and sortable inside blocks; desktop 1280. Column widths (display) are checkpoint 2 and are not judged here (Name/Description against spec §3/§5 and D1 reversed only).

## State check

| Shot | State shown | Verdict |
|---|---|---|
| populated-1280-light / dark | Period "This month to date", header "November 1 – November 9, 2026", every block open (JE-5 … JE-10), lines, block totals | valid |
| folded-1280-light / dark | JE-6 heading folded (chevron right, heading carries 1,250.00 / 1,250.00); every other block open | valid |
| collapsed-1280-light / dark | every block folded with its Debit/Credit on the heading, toolbar reads "Expand all", Total row $5,961.00 / $5,961.00, "End of report" | valid |
| sorted-1280-light / dark | Debit heading shows a single down arrow; inside JE-7 lines read 200.00, 100.00, then the credit line (blank Debit); blocks keep their order | valid |
| all-dates-1280-light / dark | chip "Period: All dates", header "All dates", blocks from Aug 15, 2024 onward in date order (JE-16, JE-8, JE-1, JE-2, JE-3) | valid |
| customize-1280-light / dark | Customize panel open at the right (Number format, Negative numbers, red negatives, Columns collapsed, Reset to defaults); the report refits beside it | valid |

0 INVALID.

## Findings

### populated-1280-light / dark
- populated: whole screen — the built shots show only the app rail and core's report view; the reference shows the Books secondary sidebar (New, Banking, Lists, Reports, Accounting…) beside the report. Spec §2 places the report at core's `/a/reports/<id>` ("Books adds no screen and no route"), and the reference was captured on the scratch route inside Books, so the sidebar is an artefact of where the mockup lived, not a decision; the Trial Balance and General Ledger ship the same way. — NOTE
- populated: document header period — "November 1 – November 9, 2026" repeats the month; spec §3 writes the example as "October 1 – 31, 2026". The words come from core's `periodWords` (D5) and the reference shows the same long form ("October 1 – October 28, 2026"), so it is consistent with the approved direction; recorded so the spec example and core's output are known to differ. — NOTE
- Block headings, line indent, bold total rows with `$`, blank zero sides, long Description ending in an ellipsis, Debit/Credit right-aligned with the sort glyph before the label: all match the reference and spec §3. Dark mode: text, dividers and chevrons legible; block-total top rule visible. Nothing else found.

### folded-1280-light / dark
- nothing found (folded heading carries the entry's Debit and Credit, spec §3 "A folded block's heading shows the entry's Debit and Credit totals"; neighbours stay open).

### collapsed-1280-light / dark
- collapsed: toolbar "Expand all" button — drawn with a teal text and tinted background in light mode (teal text in dark) while the other three buttons are neutral; this is the focus/pressed state left by the Collapse all click at capture, core's button. Reference shows the button at rest. Cosmetic capture artefact; no Books rule behind it. — NOTE

### sorted-1280-light / dark
- nothing found (descending by Debit inside each block, blank Debit last, block order unchanged, one direction glyph on the sorted heading).

### all-dates-1280-light / dark
- nothing found (chip and header read "All dates", spec §3; blocks in entry-date order across years).

### customize-1280-light / dark
- nothing found for this checkpoint. Panel contents match the reference (Number format toggles, Negative numbers segmented control, red negatives toggle, Columns, Reset to defaults).
- Deferred to checkpoint 2 (not a finding here): beside the open panel the table keeps the one-line layout and the Account cell "1100 Accounts receiva…" truncates; spec §3 "Account keeps an ordinary account name of about 20 characters whole" is enforced by `display.columns.account.minWidth: "20ch"` and the tablet wrap, both checkpoint 2 (the reference customize shot shows the wrapped layout). Re-check in the checkpoint 2 customize shots.

## Name / Description (spec §3/§5, D1 reversed)
- With no Name values in the seeded period the Name column takes only its heading width and Description takes the spare room (populated, folded, sorted). In all-dates the spare room is shared among Account, Name and Description with Description widest. Both agree with spec §3 "Description takes the most of the spare room" under D1 reversed (no 16ch cap on Name). Final widths are checkpoint 2.

## For gate 3
- populated / collapsed: two distinct open blocks are both headed "JE-10 · Journal entry" (400.00 "Register void original" and 450.00 "Register corrected") beside "JE-10 · Void reversal of JE-10". Spec §3 says a void gives two blocks with the same number (original + void reversal); a third posted entry with the same number ("corrected") looks like a seed or numbering question, not a rendering one. Verify the seed intends a corrected entry to reuse the voided number.

## Totals
CRITIQUE: 0 INVALID, 0 BLOCKING, 3 NOTE
