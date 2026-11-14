# Gate 2 critique: customer-pages, checkpoint 2

Scope: header (left side), More menu, Details and Notes tabs, save bar, record width at 1600. The header right-hand slot (balance, New transaction) and the Transactions / Contacts tabs are not built in this checkpoint and are not compared.

Result: 0 INVALID, 2 BLOCKING, 5 NOTE.

## State check

| Shot | Widths / schemes | Shows the named state? |
|---|---|---|
| details-dirty | 390, 1280, 1600 · light, dark | Yes. Details tab, Phone changed to (206) 555-0199, save bar visible. |
| details-read-only | 1280 · light, dark | Yes. No More menu, no save bar, no sidebar "New", toggles dimmed. |
| notes-dirty | 390, 1280, 1600 · light, dark | Yes. Notes tab, typed note, save bar visible. |
| discard | 1280 · light, dark | Yes. "Discard changes?" dialog over the Notes tab. |
| more-menu | 1280, 1600 · light, dark | Yes. Menu open with Add sub-customer, Make inactive, Delete customer. |
| long | 390, 1600 · light, dark | Yes. St. Jude long name and long address in the header. |
| loading | 390, 1280, 1600 · light, dark | Yes, a loading state: the record loading body of `RecordByIdScreen` ("Customer" + spinner). The reference `loading-*` shows a different loading state (customer loaded, Transactions tab and balance loading), which later checkpoints build. The two are not comparable; the built shots are judged on their own. |

## Findings

### details-dirty

- details-dirty-390 (light, dark): tab strip, under "Details / Notes" — the bottom rule of the strip stops at about x=158 (the width of the two tabs). It does not reach the right edge of the screen, so the header/body divider looks cut off. At 1280 and 1600 the rule spans the full width. — BLOCKING (reference decision: `details-dirty-390-*` and `notes-dirty-390-*` draw the tab strip rule across the full page width; design memory p1-account-register: "Horizontal `ScrollView` content is sized by its content ... Use `contentContainerStyle={{ width: '100%', minWidth }}`"). The same defect shows in notes-dirty-390 and long-390; it is one finding.
- details-dirty-1280, -1600 (light, dark): header, between the company line and the first address line — the gap is about 24 px, the address lines are 20 px apart; the reference has a uniform 20 px. — NOTE
- details-dirty-1280 (light, dark): nothing else found. Save bar text aligns with the header (x=348); structure matches the reference.
- details-dirty-1600 (light, dark): nothing else found. List column is 320 px with name-only rows, search and "Name" header as the plan says; page fills the rest; no back button.

### details-read-only

- details-read-only-1280 (light, dark): Details form — the text inputs and the "Default sales tax" select look the same as the writer's form (full-contrast text, normal border). Only the two toggles are dimmed. The dimmed "Parent customer" select is not a read-only cue: it is dimmed in the writer shots too (customer has sub-customers). The form looks editable. This matches the approved reference of this unit (`details-read-only-1280-*` has the same treatment), so no reference decision is lost. — NOTE
  - Ledger request (compare with p2-customers' read-only form): not possible. `customer-form-reference` has no read-only shot (its manifest `docs/plans/customer-form-capture.json` lists list, list-empty, list-no-match, panel, page, new, new-sub, delete only). The human must decide if the editable look is acceptable.

### notes-dirty

- notes-dirty-390 (light, dark): tab strip rule cut off at about x=158 — same BLOCKING finding as details-dirty-390.
- notes-dirty-1280 (light, dark): nothing found.
- notes-dirty-1600 (light, dark; no reference): nothing found.

### discard

- discard-1280 (light, dark): nothing found. The body text ("This customer has changes that are not saved.") differs from the reference text; the spec names the existing `DiscardDialog`, so this is not a finding.

### more-menu

- more-menu-1280 (light, dark): nothing found. Menu opens directly under the More button, as in the reference.
- more-menu-1600 (light, dark; no reference): menu, top right — the menu opens at y=105, about 53 px below the More button (button bottom at y=52). At 1280 the gap is 5 px. The menu y is the same at both widths, although the header at 1600 has no back row and sits 48 px higher. The menu looks detached from its trigger. The More button also has no open (tinted) state at 1600; at 1280 it has. — BLOCKING (reference decision: `more-menu-1280-*` shows the menu attached directly under its More trigger, with the trigger in its open state)

### long (header only)

- long-390 (light, dark): header — nothing found (title truncates on line 2 and the address line truncates, as in the reference). Tab strip rule cut off: same BLOCKING finding as details-dirty-390.
- long-1600 (light, dark): header — the Email and Call icons sit at x=1410 / 1458, about 140 px after the end of the wrapped title line and next to the More button. They read as a group with More, not as actions "beside" the name. The reference also puts them after the title block, but about 65 px from the text. This can change when checkpoint 3 fills the right slot. — NOTE

### loading

- loading-390 (light, dark): nothing found.
- loading-1280 (light, dark): header — "‹ Customers" and "Customer" are at x=466 (centered form column). The loaded page header is at x=348. The header moves left by about 118 px when the record arrives. Spec §3.10 says the loading body is unchanged from p2-customers. — NOTE
- loading-1600 (light, dark; no reference): panel header — the loading panel shows a close "X" at the top right. The loaded record surface has no close or back control ("Record surface (very wide): no back button"), so the X disappears when the record arrives. Spec §3.10 keeps the p2-customers loading body. — NOTE

## For gate 3

- more-menu-1600: the menu y position does not follow the More button when the header has no back row (same y at 1280 and 1600). The anchor measurement is possibly stale or taken from the page-surface layout. Check the menu position after a route or surface change at 1360 px or more.
