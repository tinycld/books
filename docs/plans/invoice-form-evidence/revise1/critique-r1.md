# Critique: invoice-form, eval revise 1 (gate 2, fresh, after the fix of B1–B4)

Scope: revise-1 items 1, 2, 4 and the B1–B4 fix (cp/revise1-fix2.md), judged against the spec, the lessons, the reference shots and the human's corrections. Shots: new 1280/911/640/390, filled 1280/911/640, filled-phone 390, posted 1280, posted-phone 390, edit-address 1280/390; light and dark (24).

## State check

All 24 shots show the state their name says. No INVALID.

- new-* (1280, 911, 640, 390; light, dark): a new form, no customer, one empty item line, the Customer picker focused (2 px teal ring, visible in both schemes).
- filled-* (1280, 911, 640) and filled-phone-390: a saved draft ("Draft invoice") with a customer, two lines, message and memo. A "Save draft ⌘S" tooltip is captured over the action bar in every filled shot; a capture artifact, not a state.
- posted-1280, posted-phone-390: the read view of a posted invoice (Invoice 1003).
- edit-address-1280, edit-address-390: the form with the address and email inputs revealed.

## B1–B4 after the fix

**B1/B2, Tax beside the dates.** Fixed.
- 1280 (new, filled, edit-address): Terms · Invoice date · Due date · Tax on one row; Tax is about 200 px, fits "Denver combined 8.71%" with the chevron, no longer half the row.
- 911 and 640 (new, filled): the four fields wrap to two rows (Terms | Invoice date, then Due date | Tax). Tax is at content width (about 200 px), not stretched to Due date's half-row width. This is what the human asked for ("a width that fits its content, not half the row").
- 390 (new, filled-phone, edit-address): Terms | Invoice date on one row, Due date half width on its own row, Tax at content width on its own row, on one line. No two-line trigger, no ragged row.

**B3, stacked footer at 911/640.** Fixed. new-911 and new-640 show the totals block full width, right-aligned (Subtotal, Denver combined (8.71%), rule, Total, Balance due), then the Message label and hint at full width. No 160 px column, no wrapped label.

**B4, footer order.** Fixed. filled-phone-390 reads lines → Add line → totals → Message to customer → Internal memo, as the reference filled-phone-390 and the built read view (posted-phone-390).

**Items 2 and 4** stay well made: the Customer ring shows in every form shot; the labels "Message to customer (prints on invoice)" / "Internal memo (not printed)" with their hints are in the form and the read view, legible in dark mode.

## Findings

### new-1280-light / new-1280-dark
- Totals block, tax line — "Denver combined (8.71%)" wraps to two lines in the totals label column; the read view (posted-1280) and the reference filled-1280 keep it on one line. Widen the label column or let it take the free width to its left. — NOTE (carried from the previous critique; not part of B1–B4)
- Header band, Tax trigger — reads "Denver combined 8.71%" while the totals line, the read view and the reference header all write "Denver combined (8.71%)"; one text for the same rate everywhere. — NOTE
- Header band, "Email" — a bold label with nothing under it on a form with no customer; hide it or draw "—" until a customer is chosen. — NOTE (carried)

### new-911-light / new-911-dark, new-640-light / new-640-dark
nothing found. Tax at content width beside Due date; totals stacked full width above Message.

### new-390-light / new-390-dark
- Header band, Due date — sits half width alone on its own row, with Tax at content width on the row below, so the band shows three field widths in a stair (half, half-alone, content). The reference new-390 draws every phone field full width. Not a loss of structure, and the human's item 1 allowed either layout for the phone; a full-width Due date (or Tax beside it at content width) would read cleaner. — NOTE

### filled-1280-light / filled-1280-dark
- Totals block, tax line — the same two-line wrap of "Denver combined (8.71%)". — NOTE (same item as new-1280)
- Action bar — the "Save draft ⌘S" tooltip is in the shot; move the pointer before capture. — NOTE (capture artifact)

### filled-911-light / filled-911-dark, filled-640-light / filled-640-dark
- Frame — the 1900 px frame ends at "Add line", so these shots do not show the stacked footer; new-911/640 evidence totals → Message, but no 911/640 shot shows Internal memo under Message. The order is proven at 390 (filled-phone) and the code path is the same stacked footer, so this is a coverage gap, not a defect seen. — NOTE (capture: raise the filled height at 911/640 or add a footer-only shot)
- Action bar — tooltip captured, as filled-1280. — NOTE (same artifact)

### filled-phone-390-light / filled-phone-390-dark
- Header band, Due date — half width alone above Tax, as new-390. — NOTE (same item)
- Action bar — tooltip captured (pale mid-fade in both schemes). — NOTE (same artifact)

### posted-1280-light / posted-1280-dark
nothing found.

### posted-phone-390-light / posted-phone-390-dark
nothing found.

### edit-address-1280-light / edit-address-1280-dark
- Totals block, tax line — two-line wrap, as new-1280. — NOTE (same item)
- Header band — no field shows a focus ring after "Edit address". — NOTE (carried; the spec does not say where focus goes)

### edit-address-390-light / edit-address-390-dark
- Header band, Due date — half width alone above Tax, as new-390. — NOTE (same item)
- Header band — no visible focus after Edit address, as 1280. — NOTE (same item)

## Counts

0 INVALID, 0 BLOCKING, 7 NOTE (distinct: totals tax label wraps at 1280; header Tax text lacks the parentheses used everywhere else; empty Email label on a new form; Due date half width alone at 390; captured tooltip; no visible focus after Edit address; Memo not in frame at 911/640).

## For gate 3

- After "Edit address", check where focus goes (no field shows it in the edit-address shots).
