# Gate 2 critique: sales-lists checkpoint 3, no-match shots (recapture)

Scope: the look of a chosen chip, a chosen range label, a customer name in the picker trigger, and the no-match state. Widths are read by eye from the shots, not measured in the DOM.

Not findings (later checkpoints or capture data): no Batch actions button or icon (checkpoint 4); the search field is empty where the reference holds "1050"; the sidebar has the Sales entry. Not repeated: the phone Sort trigger at the edge of row 3; `px-4` chips and the customer picker's wrap at 1280.

## State check

- no-match-1280-light: VALID. Invoices tab, chip Overdue chosen, "This quarter", "Northwind Traders", no rows, "No invoices match" with Clear filters.
- no-match-1280-dark: VALID. Same state.
- no-match-phone-390-light: VALID. Same state, three-row toolbar.
- no-match-phone-390-dark: VALID. Same state.

## Findings

### F1 (all four shots): search field height — BLOCKING

- no-match-1280-light, no-match-1280-dark: toolbar row 1 — the search field is about 40 px tall (about y 122 to 162) beside 44 px chips and a 44 px range trigger (y 120 to 164). Its top and bottom edges do not line up with its neighbours. The reference draws it 44 px (y 120 to 164), flush with the chips.
- no-match-phone-390-light, no-match-phone-390-dark: toolbar row 1 — the search field is about 40 px tall (y 120 to 160; reference y 120 to 164). All content below sits 4 px higher than in the reference (chips at 168, not 172; "No invoices match" at 320, not 324), which agrees with a 40 px field.
- Basis: brief, Reference choices confirmed: "toolbar controls 44 px tall". Also a touch target below 44 px on the phone.
- To confirm: read the height of `sales-search` at 1280 and at 390.

### F2 (1280 shots only): focus ring on the customer trigger — NOTE

- no-match-1280-light, no-match-1280-dark: toolbar row 2 — the customer trigger has a 2 px teal ring (focus kept after the pick). The reference and the phone shots show the trigger at rest. The ring is correct focus behavior, but the shot does not show the resting look of a trigger with a chosen customer. The phone shots show it: same border and text weight as the range trigger. No defect seen.

## Per item asked

- Chosen chip (Overdue): solid primary fill, white label, clear against the outlined chips in light and dark. Same as the reference. Nothing found.
- Chosen range label ("This quarter"): fits its trigger with room, `text-foreground`, chevron at the right. Same as the reference. Nothing found.
- Customer name in the trigger ("Northwind Traders"): fits at 1280 and at 390, no truncation, same text style as the range label. Nothing found except F2.
- No-match state: "No invoices match" centred, "Clear filters" as a core outline Button below it, same position and weight as the reference in light and dark. Not faint in light mode. Nothing found.

## For gate 3

Nothing.

CRITIQUE: 0 INVALID, 1 BLOCKING, 1 NOTE
