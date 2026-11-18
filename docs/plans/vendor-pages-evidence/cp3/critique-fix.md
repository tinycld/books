# Gate 2 re-critique after the fix: vendor-pages, checkpoint 3

Scope: the contacts tab after the Add contact button fix (one button stays mounted from the empty state to the populated state; its variant switches). Compared without the balance block, the New transaction button and the Transactions tab (checkpoint 4).

Read: 10 built screenshots (`contacts-*` at 390, 1280, 1600; `contacts-empty-*` at 390, 1280; light and dark), the 10 matching reference screenshots, the brief, the spec, the lessons, `memories-design.md`, the first critique.

Result: 0 INVALID, 0 BLOCKING, 2 NOTE (both carried from the first critique; the fix added no finding).

## State check

| Shot | Widths / schemes | State shown | Result |
|---|---|---|---|
| contacts | 390, 1280, 1600 / light, dark | Office Supply World, Contacts tab selected, three contacts, Grace Liu with the Primary mark. Cards at 390, table at 1280 and 1600. At 1600 the names column is beside the page and there is no back button. | VALID |
| contacts-empty | 390, 1280 / light, dark | Coastal Coffee Roasters with the Inactive badge, Contacts tab selected, "No contacts yet", Add contact button. | VALID |

## The fixed button

- Populated (`contacts-*`, six shots): Add contact is the outline button, right-aligned above the list, at the same place and size as the reference (1280: right edge 1256, above the table header; 1600: right edge 1576; 390: right edge 374, above the first card). Legible in light and dark.
- Empty (`contacts-empty-*`, four shots): Add contact is the primary (filled) button, centered under "No contacts yet", as the reference shows. No second button shows in the toolbar position, and no empty toolbar row shows above the message: the distance from the tab strip to the message is the same as the reference's.
- The two variants agree with the reference decision (outline in the toolbar, primary in the empty state). No layout shift, clipped label or wrong color is visible in either state.

## Findings

### contacts (390, 1280, 1600; light and dark)
- contacts-390-light, contacts-390-dark: second card ("Accounts receivable", no phone) — the card keeps the height of a card with a phone, so an empty line shows under the email — NOTE (carried; the reference shows the same).
- contacts-1280-light, contacts-1280-dark: nothing found. The table fits its width with no sideways scroll; the long role and email end with an ellipsis; header and row cells align.
- contacts-1600-light, contacts-1600-dark: nothing found. The table fits beside the names column with no sideways scroll.

### contacts-empty (390, 1280; light and dark)
- contacts-empty-390-light, contacts-empty-390-dark: header title — the name is cut to "Coastal Coffee …" on its second line because the icons, the Inactive badge and More share the row — NOTE (carried; the reference shows the same cut).
- contacts-empty-1280-light, contacts-empty-1280-dark: nothing found.

## Differences from the reference that are not findings
- No balance block, no New transaction button (and its inactive hint), no Transactions tab: checkpoint 4.
- More is on the title row: follows from the above.
- contacts-1600: the built names column has the real list header (All lists, Vendors, New vendor, search, Show inactive, NAME, company sub-lines) and no selected-row highlight is in view (Office Supply World is below the fold of the sorted list); the reference draws a bare name list from the scratch route. Real component, real data.

## For gate 3
- Nothing visible. (That one button stays mounted across the two states is not something a screenshot can show; the shots show only that each state draws one button of the right variant.)
