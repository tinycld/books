# Gate 2 critique: vendor-pages, checkpoint 4

Scope: Delivers "the vendor page shows what the business owes the vendor (Open and Overdue), starts a new transaction for the vendor from one menu, lists every purchase document of the vendor on a Transactions tab that is the default, and has its help topic."

Read: 48 built shots (all), 27 reference shots (each shot name, light at each width, plus 4 dark), spec, lessons, memories-design.

Result: 0 INVALID, 0 BLOCKING, 7 NOTE. Three states that the reference shows have no built evidence (see "Not evidenced").

No "Can't reach the server" toast shows in any shot.

## Per screenshot

### transactions (390, 1280, 1600; light, dark)
State check: VALID. Populated Transactions tab, default tab, All chip selected. 390 shows cards; 1280 and 1600 show the table; 1600 shows the record surface with the names column and no back button.
- transactions-1280-*, transactions-1600-*: table header and cell text — start 8 px left of the page gutter (340 against 348 for the title, tabs and chips; 661 against 669 at 1600) — NOTE. The reference has the same offset.
- transactions-*-dark: "Draft" badge — the muted text and border are faint on the dark surface — NOTE. The reference dark shot is the same.
- transactions-390-*: nothing found.

### loading (390, 1280; light, dark)
State check: VALID for the balance only. Both figures show "—" with their labels and markers. The Transactions list is loaded, not loading (the capture holds `books_party_balances` only). See "Not evidenced".
- nothing found.

### error (390, 1280; light, dark)
State check: VALID for the balance only. "Balance unavailable" with a Retry link shows. The Transactions list is loaded; no error banner (the capture fails `books_party_balances` only). See "Not evidenced".
- error-1280-*: header right column — the New transaction / More row is 6 px higher than in the loaded state (y 137 against 143) and the tab strip 2 px higher, so the header moves when the read fails or recovers — NOTE. The reference has the same heights.
- error-390-*: nothing found.

### empty-inactive (390, 1280; light, dark)
State check: VALID. Inactive badge, $0.00 / $0.00, header button disabled with the hint, empty text, empty-state button disabled.
- empty-inactive-1280-*: header actions row — the hint is wider than the button, so More is 87 px from New transaction (8 px on an active vendor) — NOTE. The reference is the same.
- empty-inactive-390-*: title — "Coastal Coffee …" cuts the last word of a 23-character name, because the icons, the badge and More share the row — NOTE. The reference is the same.

### filter-empty (1280; light, dark)
State check: VALID. Vendor refunds chip selected, "No vendor refunds for this vendor", Show all.
- nothing found.

### credit (390, 1280; light, dark)
State check: VALID. Label "Credit", figure "−$120.00", warning marker kept. (Overdue stays $1,759.95 because only the balance row is faked; capture artifact.)
- nothing found.

### long (390, 1600; light, dark)
State check: VALID for the long name, company and address. The vendor has no transactions, so the long amount of the reference ($1,248,000.00 in the figure, the card and the Total column) is not shown. See "Not evidenced".
- nothing found. The title wraps to two lines at 1600 and cuts at two lines at 390; the company and address lines cut with an ellipsis at 390; figures and buttons keep their place. Same as the reference.

### new-menu (1280; light, dark)
State check: VALID. Menu open under the button: Bill, Pay bills, Expense, Vendor credit, Vendor refund.
- new-menu-1280-*, new-menu-phone-390-*: menu items — the labels are indented by an empty icon slot (x 50 against the sheet title at x 20 on the phone) — NOTE. The reference is the same.

### new-menu-phone (390; light, dark)
State check: VALID. Bottom sheet titled "New transaction" with the five items in order; full-width button behind the scrim.
- see the new-menu NOTE. Nothing else found.

### contacts (390, 1280, 1600; light, dark)
State check: VALID. Contacts tab selected; full header with the balance, New transaction and More.
- contacts-1600-*, and every other 1600 shot: header right column — the Open / Overdue markers start 8 px below the top edge of the record surface; the header is tighter than at 1280 — NOTE. The reference is the same.

### details-dirty (390, 1280, 1600; light, dark)
State check: VALID. Details tab, live form, save bar with "Unsaved changes", Cancel, Save; full header.
- nothing found.

### notes-dirty (390, 1280; light, dark)
State check: VALID. Notes tab with typed text, save bar; full header.
- nothing found.

## Not evidenced (no built shot shows it; not a finding on appearance)
- Transactions tab loading (`LoadingState`): the reference `loading-*` shows a spinner under the chips. The built `loading-*` shows the loaded list.
- Transactions tab error banner with Retry: the reference `error-*` shows "Transactions could not load." with Retry. The built `error-*` shows the loaded list.
- Long amounts: the reference `long-*` shows $1,248,000.00 beside Overdue at 390 and in the Total column at 1600. The built `long-*` vendor has no document.
- `read-only`, `details-read-only`: no built shot, as the brief says.

## For gate 3
- None visible.
