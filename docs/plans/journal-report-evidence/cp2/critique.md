# Gate 2 critique — journal-report checkpoint 2 (Journal fit at every width)

Judged: the Delivers line only (authored column fit, phone and tablet layouts, no cut column, Description takes the most of the spare room, phone row wraps onto three lines). Reference = `docs/plans/journal-report-reference/`; 900 judged against spec §5 tablet layout; Name/Description widths judged against spec §3/§5 (D1 reversed), not the reference.

## State check

| Shot | State shown | Verdict |
|---|---|---|
| populated-390-light / -dark | Populated, mobile 3-line layout, This month to date | valid |
| populated-900-light / -dark | Populated, tablet 2-line layout (date · account · debit · credit / name · description) | valid |
| populated-1024-light / -dark | Populated, one line | valid |
| populated-1280-light / -dark | Populated, one line | valid |
| folded-390-light / -dark | One block (JE-6) folded, heading carries its Debit/Credit; others open | valid |
| collapsed-390-light / -dark | Every block folded, button reads "Expand all" | valid |
| sorted-390-light / -dark | Debit sorted descending (chip "Sort: Debit ↓", ↓ on DEBIT heading), lines reordered inside blocks | valid |
| all-dates-390-light / -dark | Period: All dates, header "All dates", JE-16 (Aug 2024) first | valid |
| customize-390-light / -dark | Customize sheet open (Number format, Columns, Reset to defaults) | valid |

0 INVALID.

## Findings

### populated-390-light, populated-390-dark
- Line rows, second wrap line — Description's left edge (~113 px) does not share the Account's left edge (~161 px) on the line above, although spec §5 puts both at track 2 ("line 1 entry/date (1) · account (2); line 2 name (1) · description (2)"). The row reads as ragged. The approved reference shows the same class of offset (Account 154, Description 236), so the reference did not decide alignment; core's wrap sizes each line's tracks by content (blank Name collapses). — NOTE. Possible core gap for the driver to weigh (D5: the wrap is core's view), not a Books authoring error.
- Otherwise clean: three lines per row as specified; dates, Debit, Credit, headings and "Total …" labels whole; Credit ends at the table's right edge (378); no sideways scroll visible; dark legible.

### populated-900-light, populated-900-dark
- Line rows, second wrap line — Name's track collapses to ~97 px (its header's width) and Description starts at ~177 px, under the Date column and left of Account (~264 px). Spec §5 tablet is "12 tracks: … line 2 name (4) · description (8)": a Name spanning 4 tracks should be wider than Entry/Date spanning 2, and the 4:8 split is not what is drawn. Same cause as the 390 note (per-line content sizing, blank Name). — NOTE.
- Line 1 is as specified (date · account · debit · credit on one line; Debit/Credit inside the right edge; account whole). Toolbar buttons fit. Nothing else found.

### populated-1024-light, populated-1024-dark
- Whole table — no row in any built shot carries a Name (the seeded period has no customer/vendor lines), so "Description takes the most of the spare room" and "nothing the reader needs is cut" for Name cannot be judged visually: Name draws at ~80 px (header width) at 1024 and 1280, Description ~315 px / ~565 px. Description is wider than Name as D1 reversed asks; what a 30-character name does is unseen. — NOTE (evidence gap: a shot with the e2e-8 data — a named line and a 70-character memo — would close it).
- Otherwise clean: one line, Account ≥ 20ch (~235 px), Debit/Credit right edges inside the table, sort arrows on every heading.

### populated-1280-light, populated-1280-dark
- Same evidence gap as 1024 (no Name populated). Description takes all the extra width from 1024 → 1280 (~315 → ~565 px); Date, Account, Name hold their widths; nothing cut. Nothing else found.

### folded-390-light, folded-390-dark
nothing found (folded heading with figures on the line below, as the reference).

### collapsed-390-light, collapsed-390-dark
nothing found (matches reference; "Expand all" tinted as the reference).

### sorted-390-light, sorted-390-dark
nothing found. The phone Sort chip ("Sort: Debit ↓") is a core component the reference did not have; it adds the sort state the reference showed only with the heading arrow, and both chips fit at 390.

### all-dates-390-light, all-dates-390-dark
nothing found.

### customize-390-light, customize-390-dark
nothing found (matches reference pixel-for-pixel in structure).

## For gate 3
Nothing visible. (The Books-menu path to the Journal on a phone is not in any shot; e2e 7 covers it.)

## Totals
CRITIQUE: 0 INVALID, 0 BLOCKING, 3 NOTE
