# Checkpoint 3 critique — Customers list and list-detail layout (re-capture)

Scope: the `/a/books/customers` list (header, search, Show inactive, table or cards, windowing, both empty states). The row menu, the open-row highlight and the customer surface are later checkpoints; the empty trailing menu cell is expected and is not a finding. No loading or error screenshot is in this shot set, and the new "No active customers" state is not in it either, so those three states are not reviewed here.

## State check

| Shot | Shows the named state? |
|---|---|
| list-390-light | Yes. Populated card list at phone width, light. Ten cards visible, Harborview Hospitality Group cut by the tab bar (scroll). |
| list-390-dark | Yes. Same, dark. |
| list-1280-light | Yes. Populated table at desktop width, light. Name / Email / Phone columns, Harborview Events and Harborview Kitchen indented under Harborview Hospitality Group. |
| list-1280-dark | Yes. Same, dark. |
| list-empty-390-light | Yes. "No customers yet", "Add the people and companies you sell to.", New customer button; no toolbar. |
| list-empty-390-dark | Yes. Same, dark. |
| list-empty-1280-light | Yes. Same at desktop, light. |
| list-empty-1280-dark | Yes. Same at desktop, dark. |
| list-no-match-390-light | Yes. Search field holds "Zephyr Logistics", toolbar shown, "No customers match" with Clear search. |
| list-no-match-390-dark | Yes. Same, dark. |
| list-no-match-1280-light | Yes. Same at desktop, light. |
| list-no-match-1280-dark | Yes. Same at desktop, dark. |

All 12 screenshots are valid. None is INVALID.

## Against the spec and the reference

Kept in every shot: back link "All lists"; title "Customers"; header "New customer" for writers; the phone FAB on the list; toolbar of search field plus Show inactive chip, hidden while no customer exists and shown in the no-match state; Name / Email / Phone columns with the company in muted text under a display name that differs; sub-customers indented one level; Email cell truncated with an ellipsis ("accounts.payable@harborviewhospitality....", "business.office@evergreenmontessori.exa..."); phone cards of display name then muted company, email and phone; "No customers yet" with a New customer button; "No customers match" with Clear search. Column headers, title and header button align with the reference within a few pixels. Light and dark both read correctly: muted text stays legible, row dividers show in dark.

Fixed since the first capture: the search placeholder is now "Search customers" and fits the field at 390 px in both themes.

Differences from the reference that are not findings: the menu button is absent from rows and cards (a later checkpoint), so the phone card text runs the full card width and the desktop table ends at the Phone column with an empty trailing cell.

## Findings

list-390-light: nothing found.

list-390-dark: nothing found.

list-1280-light: nothing found.

list-1280-dark: nothing found.

list-empty-390-light: body, New customer button — the body button is about 44 px tall (y 208–252) while the header New customer button above it is 36 px (y 52–88); the same primary action shows in two sizes on one screen. The reference draws the body button at the header's size or smaller (y 205–235). No spec text or token rule fixes a button height, so this stays a polish item. Use one size step for both. — NOTE

list-empty-390-dark: body, New customer button — same two-size primary button as list-empty-390-light. — NOTE

list-empty-1280-light: body, New customer button — same two-size primary button. — NOTE

list-empty-1280-dark: body, New customer button — same two-size primary button. — NOTE

list-no-match-390-light: body, Clear search button — about 44 px tall (y 224–268) against the 36 px header button and the 40 px toolbar controls; three control heights in one column. The reference draws it at 32 px (y 220–252). — NOTE

list-no-match-390-dark: body, Clear search button — same height mix as list-no-match-390-light. — NOTE

list-no-match-1280-light: body, Clear search button — same height mix. — NOTE

list-no-match-1280-dark: body, Clear search button — same height mix. — NOTE

## Summary

BLOCKING: none.
NOTE: one item, repeated across 8 shots — the body button in the empty and no-match states is taller than the header button and the toolbar controls. The clipped-placeholder note from the first capture is resolved.
