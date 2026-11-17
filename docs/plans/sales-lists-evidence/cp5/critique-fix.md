# Design critique: sales-lists checkpoint 5, after fix round 1

Scope: the focused row's look (light fill plus a 4 px primary bar at the left edge) on each Sales tab and in the 320 px column. Each finding applies to the light and the dark shot unless it says otherwise.

## Result of fix item 4

The 13 BLOCKING findings of the first critique are closed in all 12 shots. On the focused row, card and names row, the second text line, the Draft badge label, the amount and the "More actions" icon are legible. The bar does not move the row's content: the tick box and the text keep their columns.

## all-focus-1280 (reference all-1280)

State check: VALID. All sales table, second row focused.

- all-focus-1280 (dark): focused row, Status cell — the Draft badge outline is not visible on the focus fill; the label is legible but floats (the Draft badges of the other rows show their outline) — NOTE

## all-focus-mid-900 (reference all-mid-900)

State check: VALID. Cards, second card focused.

- all-focus-mid-900 (dark): focused card, badge — same lost Draft outline as above — NOTE (counted with the finding above)
- all-focus-mid-900: toolbar — three rows (Void wraps, Sort is alone on the third row); the reference has two. Carried from the first critique, not a part of this checkpoint — NOTE

## all-focus-phone-390 (reference all-phone-390)

State check: VALID. Cards, second card focused.

- all-focus-phone-390: third toolbar row — Sort shows as a cut "S" at the right edge (the gate-2 weak point). The reference shows the same cut. Carried from the first critique — NOTE

## invoices-focus-1280 (reference invoices-1280)

State check: VALID. Second row ticked (accent fill, tick box checked, header box shows the partial mark), third row focused.

- invoices-focus-1280 (dark): rows 2 and 3 — the focus fill and the ticked row's accent fill are almost the same colour; only the bar and the tick box tell the two states apart. In light the two fills are clearly different (mint, grey) — NOTE
- invoices-focus-1280 (dark): ticked row, Status cell — the Draft badge outline is not visible on the accent fill. Carried from the first critique, not caused by the focus look — NOTE (counted with the Draft outline finding)

## invoices-focus-phone-390 (reference invoices-phone-390)

State check: VALID. Cards, second card focused.

Nothing found.

## beside-focus-1440 (reference beside-1440)

State check: VALID. Invoice 1015 open beside the 320 px column (its row has the accent fill), the column's second row focused.

- beside-focus-1440: column, rows 1 and 2 — the focused row has the primary bar and the open row has only a pale fill, so the bar can read as the mark of the open document (the app rail uses the same bar for the active package). In dark the two fills are also almost the same colour. The reference decided only the open row's fill, which the build keeps — NOTE

## For gate 3

Nothing seen.

CRITIQUE: 0 INVALID, 0 BLOCKING, 5 NOTE
