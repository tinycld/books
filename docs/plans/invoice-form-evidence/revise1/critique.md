# Critique: invoice-form, eval revise 1 (gate 2, fresh)

Scope: the three corrections that show in these shots (revise-1 items 1, 2, 4), judged against the spec, the lessons, the reference shots and the earlier cp3 shots. Shots: new 1280/911/640/390, filled 1280/911/640, filled-phone 390, posted 1280, posted-phone 390, edit-address 1280/390; light and dark.

## State check

All 28 shots show the state their name says. No INVALID.

- new-* (1280, 911, 640, 390; light, dark): a new form, empty customer, one empty item line, Customer picker focused.
- filled-* (1280, 911, 640) and filled-phone-390: a saved draft with a customer, two lines, message and memo. A hover tooltip "Save draft ⌘S" is captured over the action bar in every filled shot (the pointer rests on Save draft); it does not change the state.
- posted-1280, posted-phone-390: the read view of a posted invoice.
- edit-address-1280, edit-address-390: the form with the address and email inputs revealed.

## The three corrections

**Item 1, Tax beside the date fields.** At 1280 it is well made: Terms, Invoice date, Due date and Tax sit on one row, each about 210 px; Tax fits "Denver combined 8.71%" with room for the chevron and is no longer half the row (cp3 drew it alone on a second row at half width). At 911 and 640 the row wraps to a 2 x 2 grid (Terms | Invoice date, Due date | Tax) and Tax is again half the row. At 390 the same 2 x 2 grid replaces the cp3 phone layout (Due date half, Tax full width) and the Tax trigger now wraps to two lines. See B1 and B2.

**Item 2, focus ring on Customer.** Well made. new-1280/911/640/390 light and dark all show a 2 px teal ring on the Customer picker, clearly visible in both schemes. The filled shots also show it (spec §3.1: "On open (new, draft, correction, copy) the Customer picker has focus").

**Item 4, Message / Memo labels and hints.** Well made at 1280 and on the phone. The form reads "Message to customer (prints on invoice)" with the hint "Shown on the invoice and PDF." and "Internal memo (not printed)" with "Only your team sees this. Saved as the journal entry memo."; the read view (posted-1280, posted-phone-390) uses the same two labels. Hints are legible in dark mode. At 911 and 640 the longer label and the hint wrap inside a ~160 px column; see B3.

## Findings

### new-1280-light / new-1280-dark
- Header band, "Email" — a bold "Email" label with nothing under it (no value, no input, no dash) on a form that has no customer yet; it reads as an orphan label. The brief's decision ("until then both draw text only") explains it, but with no customer there is no text to draw; hide the label or draw "—" until a customer is chosen. — NOTE
- Totals block, tax line — "Denver combined (8.71%)" wraps to two lines in the totals label column while the same text sits on one line in the read view (posted-1280) and in the reference filled-1280; widen the label column or let it shrink the amount gap. — NOTE

### new-911-light / new-911-dark, new-640-light / new-640-dark
- Header band, Due date | Tax row — Tax is stretched to half the row (about 255 px for a 160 px value). — BLOCKING (revise-1 item 1: "with a width that fits its content, not half the row"; helix-lessons 42: "Give a short header field (Tax) a width that fits its content beside its row neighbours; never half the row."). The four fields cannot share one row at these widths, so the wrap itself is right; size Tax (and Due date) to content on the second row instead of a half-row grid.
- Footer, Message to customer / totals — the lines draw as cards (the narrow layout) but the footer keeps the wide two-column layout, which leaves the Message textarea about 160 px wide; the new label wraps to two lines at 911 and "Message to customer (prints on / invoice)" at 640, and the hint wraps too. The totals have no Amount column to sit under here. — BLOCKING (spec §3.4: totals go "Right, under the Amount column" — there is no Amount column at these widths; reference filled-phone-390 is the approved narrow footer: stacked, full width). Stack the footer when the lines are cards.

### new-390-light / new-390-dark
- Header band, Tax — the Tax trigger wraps "Denver / combined 8.71%" to two lines, so the Tax control is taller than Due date beside it and the row is ragged. cp3's phone layout drew Tax full width on one line. — BLOCKING (revise-1 item 1: "Keep the phone (390) layout correct"; reference new-390: every header field full width, Tax on one line). Keep Tax full width on the phone, or let it size to content.

### filled-1280-light / filled-1280-dark
- Totals block, tax line — same two-line wrap of "Denver combined (8.71%)" as new-1280. — NOTE
- Action bar — the hover tooltip "Save draft ⌘S" is in the shot; a capture artifact, not a defect. — NOTE (no action needed beyond moving the pointer before capture)

### filled-911-light / filled-911-dark, filled-640-light / filled-640-dark
- Header band, Due date | Tax row — Tax half the row, as new-911/640. — BLOCKING (same basis as above)
- Footer — not in the frame at these heights, but the same two-column footer as new-911/640 applies. — BLOCKING (same basis as above; one fix)

### filled-phone-390-light / filled-phone-390-dark
- Header band, Tax — the trigger wraps to two lines, as new-390. — BLOCKING (same basis as above)
- Footer order — the form puts Message and Internal memo before the totals, so Subtotal / tax / Total / Balance due sit below two tall textareas. The reference filled-phone-390 puts the totals right after "Add line" and the two textareas after them, and the built read view (posted-phone-390) also puts totals first. The form loses where the reference put the totals. — BLOCKING (reference filled-phone-390: totals directly under the lines, message and memo after; reference posted-phone-390 and the built read view agree)
- Action bar (light only) — the "Save draft ⌘S" tooltip is captured mid-fade as a pale grey box with white text; a capture artifact. — NOTE

### posted-1280-light / posted-1280-dark
nothing found. The labels "Message to customer (prints on invoice)" and "Internal memo (not printed)" read correctly as muted captions in both schemes.

### posted-phone-390-light / posted-phone-390-dark
nothing found.

### edit-address-1280-light / edit-address-1280-dark
- Header band — after "Edit address" no field shows a focus ring (the Customer ring is gone, the first address line has none), so the keyboard user has no visible focus. — NOTE (the spec does not say where focus goes after Edit address; a visible focus on the first address line would complete the correction of item 2)

### edit-address-390-light / edit-address-390-dark
- Header band, Tax — the trigger wraps to two lines, as new-390. — BLOCKING (same basis as above)
- Header band — no visible focus after Edit address, as 1280. — NOTE

## Counts

Distinct findings: 4 BLOCKING (B1 Tax wraps at 390; B2 Tax half the row at 911/640; B3 two-column footer with a ~160 px Message column at 911/640; B4 phone form puts message/memo before the totals), 4 NOTE (empty Email label on a new form; totals tax label wraps at 1280; captured tooltip; no visible focus after Edit address). 0 INVALID.

## For gate 3

- A new form with no customer opens with Tax prefilled "Denver combined 8.71%". Spec §3.2 fills Tax when a customer is picked; the reference new-1280 and new-390 show "None". Check which default is intended.
- After "Edit address", check where focus goes (no field shows it in the edit-address shots).
