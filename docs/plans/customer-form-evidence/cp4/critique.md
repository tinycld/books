# Checkpoint 4 design critique — Customer page and form fields (re-capture)

Scope: `customers/<id>` and `customers/new` (with `?parent`) on the page surface, chrome (back link, title, Cancel), the `books:customer` forms host default layout, the Contact, Address and Parent customer host components. Save / Save and new (checkpoint 5) and the side panel (later checkpoint) are not judged. The not-found state and the New menu entry have no screenshot in this set, so they are not judged here.

Method: every built screenshot read in full beside its reference; vertical rhythm and column widths measured by pixel scan (input borders at the form's left edge; input top border across the width).

## State check

| Shot | Named state | Shows it? |
|---|---|---|
| page-1280-light | Edit customer, Harborview Hospitality Group, populated | Yes. Title "Edit customer", every field populated, Parent customer picker disabled with the sub-customer help text (Harborview has sub-customers), shipping toggle on, footer Cancel only. |
| page-1280-dark | same, dark | Yes. |
| page-390-light | same, phone | Yes. One column; Books New FAB hidden (spec `hidesNewFab`; the reference still shows a FAB, the build is correct). |
| page-390-dark | same, phone, dark | Yes. |
| new-1280-light | New customer, empty | Yes. Title "New customer", empty inputs, address placeholders, Parent "None (top level)" enabled, toggle on, Cancel only. |
| new-1280-dark | same, dark | Yes. |
| new-390-light | same, phone | Yes. FAB hidden (correct). |
| new-390-dark | same, phone, dark | Yes. |
| new-sub-1280-light | New sub-customer of Harborview | Yes. Title "New sub-customer", picker shows "Harborview Hospitality Group" (reference uses mockup data "Northwind Traders"). |
| new-sub-1280-dark | same, dark | Yes. |
| new-sub-390-light | same, phone | Yes. FAB hidden (correct). |
| new-sub-390-dark | same, phone, dark | Yes. |

No INVALID screenshots.

## Verified fix: Parent customer cell spacing

Measured gap from the bottom of each field to the next label (1280 and 390 are identical):

- Display name → Company name: 39 px; Company → First name: 38; Website → Parent customer: 38.
- Create shots: picker bottom (y 664) → "Billing address" label (y 702): 38 px.
- Edit shots: help text bottom (y 686) → "Billing address" label (y 724): 38 px.
- Billing address last input → "Shipping address": 38 px. Address inputs inside the block: 21 px apart (grouped, as the reference decided).

The previous NOTE (27 px / 35 px under the picker) is resolved. The form now has one vertical rhythm from top to bottom.

## Findings

Reference decisions the build keeps on every shot: back link above a bold title with a divider under the header; a centered form column at 1280; half-width pairs (First/Last, Email/Phone, Mobile/Website) at 1280 and one column at 390; City / State or region / Postal code on one line at 1280 and stacked at 390; Shipping address folded to one "Same as billing address" toggle line; Notes as a tall textarea; sticky footer with Cancel at the right, aligned to the column edge (Cancel right edge x 1137, column right edge x 1134). Semantic tokens hold in dark mode (background, border, muted placeholder and help text, teal toggle, red required mark); no raw-color drift is visible.

### page-1280-light
- Form column — inputs span x 469 to 1134, a 666 px column, centered in the content area. The reference shows the same 666 px. — BLOCKING (spec, Surfaces: "page → a header with a "‹ Customers" back button and the title, and the form in a centered column of at most 640 px"). Because the approved reference has the same width, the resolution may be a spec correction (state the real column width) rather than a layout change; the gate owner decides. Not a visual defect.
- Header — the back-link chevron is a small typographic "‹" (3 px wide at the cap line, label starts at x 476); the reference draws a larger chevron icon (label starts at x 484). The link reads lighter than the reference's. — NOTE
- Billing address, filled state — the six address inputs show no label once filled; "WA" and "98101" are told apart only by position. The reference made the same choice (placeholder-only labels), so this is not a reference loss. — NOTE

### page-1280-dark
- Same column-width BLOCKING as page-1280-light (same measurement).
- Same back-link chevron NOTE.
- Otherwise nothing found. The disabled picker's dimmed text and the help text in `muted-foreground` stay legible on the dark background.

### page-390-light
- Header — same small back-link chevron. — NOTE
- Otherwise nothing found. Inputs span x 27 to 362 (26 px gutters). The help text "A customer with sub-customers cannot be a sub-customer." ends at x 356 inside the 362 column edge: one line, no clipping. The long email value scrolls inside its input as any text input does (same in the reference).

### page-390-dark
- Same back-link chevron NOTE. Otherwise nothing found.

### new-1280-light
- Same column-width BLOCKING (inputs x 469 to 1134).
- Same back-link chevron NOTE.
- Otherwise nothing found. The address placeholders (Street, Street line 2, City, State or region, Postal code, Country) match the spec's field list.

### new-1280-dark
- Same column-width BLOCKING. Same back-link chevron NOTE. Otherwise nothing found.

### new-390-light
- Same back-link chevron NOTE. Otherwise nothing found.

### new-390-dark
- Same back-link chevron NOTE. Otherwise nothing found.

### new-sub-1280-light
- Same column-width BLOCKING. Same back-link chevron NOTE.
- Otherwise nothing found. The preselected parent renders in the enabled picker as the reference decided; the title follows the parent ("New sub-customer").

### new-sub-1280-dark
- Same column-width BLOCKING. Same back-link chevron NOTE. Otherwise nothing found.

### new-sub-390-light
- Same back-link chevron NOTE. Otherwise nothing found.

### new-sub-390-dark
- Same back-link chevron NOTE. Otherwise nothing found.

## Summary

- BLOCKING: one, on the six 1280 shots. The form column is 666 px wide; the spec says "a centered column of at most 640 px". The approved reference has the same 666 px, so either the column shrinks to 640 or the spec text changes to the real width. Fix it in one of the two places before the gate.
- NOTE: the back-link chevron is a small text glyph where the reference draws a chevron icon (all 12 shots); placeholder-only labels on filled address inputs (edit shots; reference-consistent).
- Resolved since the last critique: the Parent customer cell now has the same 38 px bottom spacing as every other field on all 12 shots.
- Not findings (build is right, reference is not): the phone shots hide the Books New FAB (spec, Surfaces: "The Books New FAB is hidden on a customer page (`hidesNewFab`)"); the edit page disables the Parent customer picker with help text for Harborview (spec, Form: "When the customer being edited has sub-customers, the picker is disabled with the help text ..."); the new-sub parent shows the real seeded Harborview rather than the mockup's Northwind Traders.
- Not judged here: Save / Save and new (checkpoint 5), the panel surface (later checkpoint), the not-found state and the New menu entry (no screenshot supplied).
