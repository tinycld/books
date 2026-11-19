# Gate 2 design critique: vendor-pages, checkpoint 3

Scope: the Delivers line of checkpoint 3 (header with identity, contact icons and More; Contacts, Details and Notes tabs; save bar; leave question). Compared without the balance block, the New transaction button and the Transactions tab (checkpoint 4).

Read: 28 built screenshots, 28 reference screenshots (all shots, all widths, light and dark), the spec, the lessons, `memories-design.md`.

Result: 0 INVALID, 0 BLOCKING, 3 NOTE.

## State check

| Shot | Widths / schemes | State shown | Result |
|---|---|---|---|
| contacts | 390, 1280, 1600 / light, dark | Office Supply World, Contacts tab, three contacts, Grace Liu primary. Cards at 390, table at 1280 and 1600. Names column beside the page at 1600, no back button. | VALID |
| contacts-empty | 390, 1280 / light, dark | Coastal Coffee Roasters with the Inactive badge, "No contacts yet", Add contact button. | VALID |
| contact-dialog | 390, 1280 / light, dark | "Add contact" open over Office Supply World (sheet at 390, dialog at 1280), Name focused, Primary contact switch, Cancel / Save. | VALID |
| details-dirty | 390, 1280, 1600 / light, dark | Details tab with live inputs and the save bar ("Unsaved changes", Cancel, Save). The dirty state comes from typed notes, as the prompt says. | VALID |
| notes-dirty | 390, 1280 / light, dark | Notes tab with typed text, hint line, save bar. | VALID |
| discard | 1280 / light, dark | "Discard changes?" with "This vendor has changes that are not saved.", Keep editing / Discard. | VALID |
| more-menu | 1280 / light, dark | More open: Make inactive, Delete vendor (destructive color), Audit history. | VALID |

## Findings

### contacts (390, 1280, 1600; light and dark)
- contacts-390-light, contacts-390-dark: second card ("Accounts receivable", no phone) — the card keeps the height of a card with a phone, so an empty line shows under the email and the card looks unevenly padded — NOTE (the reference shows the same).
- contacts-1280-*, contacts-1600-*: nothing found. The table fits its width with no sideways scroll; the long role and email truncate with an ellipsis; header and row cells align; the structure matches the reference.

### contacts-empty (390, 1280; light and dark)
- contacts-empty-390-light, contacts-empty-390-dark: header title — the name is cut to "Coastal Coffee …" on its second line (the word "Roasters" is lost) because the icons, the Inactive badge and More share the row — NOTE (the reference shows the same cut; a third title line or the badge under the name would keep the full name).
- contacts-empty-1280-*: nothing found.

### contact-dialog (390, 1280; light and dark)
- nothing found. Same structure as the reference in the four shots.

### details-dirty (390, 1280, 1600; light and dark)
- details-dirty-1280-*, details-dirty-1600-*: Details form, left edge — the form labels and inputs start 2 px to the right of the header title, the tab strip and the Notes field (350 against 348 at 1280; 671 against 669 at 1600) — NOTE (the reference shows the same offset).
- details-dirty-390-*: nothing found. The save bar stays above the phone tab bar and the buttons do not wrap.

### notes-dirty (390, 1280; light and dark)
- nothing found.

### discard (1280; light and dark)
- nothing found.

### more-menu (1280; light and dark)
- nothing found. The menu hangs from More, does not cover the Add contact button, and matches the reference's three items and order.

## Differences from the reference that are not findings
- No balance block, no New transaction button, no Transactions tab: checkpoint 4.
- More sits on the title row (no action row under the figures yet): follows from the above.
- contacts-1600 and details-dirty-1600: the built names column has the real list header (All lists, Vendors, New vendor, search, Show inactive, NAME, company sub-lines); the reference draws a bare name list from the scratch route. Real component.
- details-dirty: "Default expense account" shows "6210 Design Tools" (seeded value) against "None" in the reference. Real data.
- notes-dirty and discard: the typed note text differs from the fixture's text. Real input.
- `read-only` and `details-read-only`: no built shot (no read-only member in the e2e seed, per the brief); not judged here.

## For gate 3
- Nothing visible.
