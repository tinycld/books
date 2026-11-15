# Gate 2 critique, customer-pages checkpoint 5, after the fix round

Scope: the Contacts tab, the contact dialog, the four-tab strip. Light and dark were read for each shot; a finding applies to both schemes unless it says otherwise.

Fix-round check:
- Wide table Email/Phone overlap (earlier BLOCKING): fixed. At 1280 and 1600, Email truncates with an ellipsis before the Phone column; Role truncates before Email. No cell draws over another.
- Header "Add contact": same look and position as the reference (outline button, right-aligned above the table / cards). No visual regression.

## contacts-390 (light, dark)
State check: VALID. Populated Contacts tab, phone cards, three contacts, primary first with the "Primary" badge.
- contacts-390: Kim Tran card — the card has a fixed height, so the contact with no phone shows one empty line under the email; the reference cards take the height of their content — NOTE
- contacts-390: card menu icon — the row menu is a vertical 3-dot icon and the header More is a horizontal 3-dot icon on the same screen (the reference uses horizontal for both) — NOTE

## contacts-1280 (light, dark)
State check: VALID. Populated table: Name + Primary badge, Role, Email link, Phone link, row menu.
- nothing found

## contacts-1600 (light, dark)
State check: VALID. Record surface beside the Customers list, populated table, no back button on the page.
- nothing found

## contacts-empty-390 (light, dark)
State check: VALID. "No contacts yet" with an Add contact button (inactive customer "Northwind Boise (closed)").
- nothing found (the filled Add contact button differs from the reference's outline button; it is a core Button, as the lesson "Empty-state actions use a core Button" requires)

## contacts-empty-1280 (light, dark)
State check: VALID. Same empty state, wide.
- nothing found

## contact-dialog-390 (light, dark)
State check: VALID. Edit contact sheet, the primary contact's values, Name focused, Primary contact on.
- nothing found (button label "Save" follows the plan; the reference has "Save contact")

## contact-dialog-1280 (light, dark)
State check: VALID. Edit contact dialog, same values, Name focused.
- nothing found

## read-only-1280 (light, dark)
State check: VALID. Reader view on the Contacts tab: no New transaction, no More, no Add contact, no row menu. Tab strip and header compared with the reference: four tabs in the same order, same header layout.
- nothing found

## For gate 3
- none

CRITIQUE: 0 INVALID, 0 BLOCKING, 2 NOTE
