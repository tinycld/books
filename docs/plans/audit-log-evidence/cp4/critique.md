# cp4 gate 2 critique — Audit history menus and help

Verdict: `CRITIQUE: 0 INVALID, 0 BLOCKING, 6 NOTE`

Scope judged: the Delivers line (Audit history as the last More item for every reader; the history screen each item opens). The history screen itself is checkpoint 2's work; differences there are recorded as NOTE for the driver, not as findings against checkpoint 4. Light and dark were both read for every shot; a finding applies to both unless it says otherwise.

## invoice-more-1280 (light, dark)

State check: VALID. Invoice 1013 read view, More open, Audit history is its one item; Edit, Void, Copy, View journal entry, Download PDF stay buttons.

- invoice-more-1280: More menu, the Audit history row — the label starts about 36 px from the menu's left edge and about 75 px from the right edge (an empty icon slot), so a one-item menu looks off-centre and wider than its text needs — NOTE

Dark: menu border, row tint and label are legible. Nothing more found.

## invoice-history-1280 (light, dark)

State check: VALID. History screen "Invoice 1013" with Posted (Field | Before | After), Added, Line 1 — Added.

Against the reference (`history-1280-*`): event cards, the Field | Before | After table, the date · user meta on the right, the Open invoice button and the back row are all kept. The back link reads "Back" instead of "Audit Log": correct for a screen opened from a More menu, not a finding.

- invoice-history-1280: header — the record type "Invoice" is drawn above the title; the reference draws the title first and the type below it. The hierarchy is still clear (the title is the largest text). Checkpoint 2's screen — NOTE
- invoice-history-1280: Posted card, rows "Sequence 0 → 1013" and "Revision 1 → 2" — these read as internal counters to a bookkeeper (Sequence repeats Number). The spec's hidden list names only "sort and name keys, custom field JSON, search vectors", so no rule is broken. Checkpoint 2's field map — NOTE

## entry-more-390 (light, dark)

State check: VALID. Journal entry JE-22 at 390, phone More sheet: Reverse, Void, Audit history (last).

- entry-more-390: bottom of the sheet — the last row (Audit history) ends about 8 px above the tab bar, with no bottom padding to match the 20 px above the first row — NOTE

Dark: Void (destructive red) and the selected row tint are legible. Nothing more found.

## entry-history-390 (light, dark)

State check: VALID. History screen "Journal entry JE-22", Posted event in the phone field layout (label, Before, After), as the spec's Phone line says.

- entry-history-390: bottom right — the New (+) floating button lies over the event card (beside "Posted by"). It covers no text here, but a longer After value on that row would run under it; the entry read view behind the menu shows no such button. Checkpoint 2's screen — NOTE

## customer-more-1280 (light, dark)

State check: VALID. Customer page as the Read-only collaborator (no New button in the sidebar), More open, Audit history is its only item.

- customer-more-1280: More menu, the Audit history row — the same empty icon slot as in invoice-more: the label is indented about 36 px in a one-item menu — NOTE

The More button alone under the Open / Overdue figures is aligned to the right edge and reads correctly. Nothing more found.

## customer-history-1280 (light, dark)

State check: VALID. History screen of the customer: one Added event, Open customer button.

Nothing found (the header order note of invoice-history applies here too; not counted again).

## For gate 3

- customer-more-1280: as the Read-only collaborator, the Details tab inputs (Display name with its required mark, Company name, …) look editable. Check that a read-only reader cannot edit or save them. Not in this checkpoint's Delivers line.
