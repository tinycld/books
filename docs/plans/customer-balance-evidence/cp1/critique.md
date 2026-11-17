# Gate 2 design critique: customer-balance, checkpoint 1

Scope: the Delivers line of checkpoint 1 (plain rows, family header + rows + total, No customer row, Total, As of and Rows params, inactive mark, empty state). All 16 built shots were read. Reference shots read: populated (390 light, 390 dark, 1280 light, 1280 dark), collapsed, with-activity and empty (390 light, 1280 light).

Not findings (later checkpoints or plan D9/D4): no Order chip and no Add filter chip (checkpoint 2), no Share button (the e2e user is a reader), no Books sidebar, different names and figures.

Result: 0 INVALID, 0 BLOCKING, 5 NOTE.

## State check

| shot | state shown | valid |
|---|---|---|
| populated-390-light / dark | As of Today, Rows Non-zero, families open, muted inactive row, No customer, Total | yes |
| populated-1280-light / dark | same | yes |
| collapsed-390-light / dark | all families folded to one row with their total, button reads "Expand all" | yes |
| collapsed-1280-light / dark | same | yes |
| with-activity-390-light / dark | chip "Rows: With activity", a 0.00 row (Cedar & Pine Landscaping) | yes |
| with-activity-1280-light / dark | same | yes |
| empty-390-light / dark | As of Jan 1, 2020, "No rows as of January 1, 2020", no table | yes |
| empty-1280-light / dark | same | yes |

The reference `collapsed` folds two of four families; the built shot uses Collapse all, as the checkpoint's Gates line tells. The state is the same kind (a folded family shows its total on its header row).

## Findings

### populated-390-light, populated-390-dark
- Column header row — sort arrows show beside CUSTOMER and BALANCE; the reference header has no arrows — NOTE (core's view; see "For gate 3").
- St. Jude family rows — the two-line and three-line rows have less space above and below than the one-line rows, so the family looks tighter than the rows around it; the reference has the same rhythm — NOTE.
- populated-390-dark: "Old Mill Bakery (inactive)" row — the muted label and figure have low contrast on the dark background; the reference dark shot is the same (core R2 tone) — NOTE.
- Tab bar — no tab is marked active (the reference marks Books); the report is on core's `/a/reports/<id>` route (plan D9) — NOTE.

Checked and correct: plain customer at depth 0 with no total; family header with no figure, parent's own row first, sub-customer rows indented, "Total <parent>" with a rule above and a currency sign; muted row label ends "(inactive)" and its figure is muted too; "No customer" is last before Total; Total has the heaviest rule; long names wrap to at most 3 lines; Balance is never cut; "End of report" shows.

### populated-1280-light, populated-1280-dark
- Column header row — sort arrows, as above (same NOTE, not counted again).
- Left rail — no item is marked active, as above (same NOTE, not counted again).

Otherwise nothing found. Structure, indent, rules and weights agree with the reference.

### collapsed-390-light, collapsed-390-dark
- Title row, "Expand all" button — drawn with an accent tint (green fill in light, green text in dark); the same button at 1280 is plain. It looks like a hover or pressed state left by the capture's tap — NOTE (capture again with the pointer away, or confirm that the tint is intended).

Otherwise nothing found. A folded family shows its total on the header row; the three-line St. Jude name keeps its figure aligned.

### collapsed-1280-light, collapsed-1280-dark
Nothing found.

### with-activity-390-light, with-activity-390-dark
Nothing found beyond the populated notes. The 0.00 row is drawn as a normal row, in name order.

### with-activity-1280-light, with-activity-1280-dark
Nothing found beyond the populated notes.

### empty-390-light, empty-390-dark
Nothing found. Agrees with the reference (heading, day in words, core's action button).

### empty-1280-light, empty-1280-dark
Nothing found.

## For gate 3

- Column headers have sort controls on Customer and Balance. Checkpoint 2 adds an Order param (Name / Largest balance). Check that a header sort does not break the family order (parent's own row first, No customer last) or conflict with Order.
- Each customer row shows an open chevron, but this checkpoint has no `Detail` (checkpoint 2). Check what a press on a customer row shows now.
- collapsed-390: confirm that the tinted "Expand all" is a transient pointer state and not a stuck state.
