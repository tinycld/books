# Gate 2 critique: customer-pages, checkpoint 4 (Customer transactions tab)

Scope: the Transactions tab only (chips, table, phone cards, empty, filter-empty, loading). The header, balance and the missing Contacts tab are not judged (checkpoints 2, 3, 5). Data differences from the fixture are not findings.

Result: 0 INVALID, 1 BLOCKING, 2 NOTE.

## State check

| Shot (light + dark) | Shows the named state? |
|---|---|
| transactions-390 | Yes. Populated, phone cards (3 rows). |
| transactions-1280 | Yes. Populated, table, page surface. |
| transactions-1600 | Yes. Populated, table, record surface beside the list. |
| filter-empty-1280 | Yes. Sales receipts chip selected, "No sales receipts for this customer", Show all. |
| empty-inactive-sub-390 | Yes. Inactive sub-customer, empty list, disabled buttons. A tooltip is also on screen (see NOTE 1). |
| empty-inactive-sub-1280 | Yes. |
| read-only-1280 | Yes. No New transaction, no More; the list shows. |
| long-390 | Yes. Long name and address, cards. |
| long-1600 | Yes. Long name wraps to two lines, table. |
| loading-390 | Yes. Spinner in the tab body, figures "—". |
| loading-1280 | Yes. |

## Findings

### BLOCKING 1 — table columns do not use the tab width

- transactions-1280 (light, dark): table — the six columns end at x≈990 of 1280; the right 290 px of every row is blank, and Total and Status sit in the middle of the page.
- transactions-1600 (light, dark): table — columns end at x≈1305 of 1600; about 295 px blank at the right.
- read-only-1280 (light, dark): table — same.
- long-1600 (light, dark): table — same.

Basis (reference decision): in `transactions-1280-*`, `transactions-1600-*`, `read-only-1280-*` and `long-1600-*` of the reference, the data columns share the full tab width and Status is a narrow last column at the right edge (1280: Date 340, Type 504, No. 682, Due date 832, Total right edge 1148, Status 1160–1280; 1600: Total right edge 1468, Status 1480–1600). The build has fixed data columns and a flexible Status column (1280: Date 340, Type 450, No. 570, Due date 680, Total right edge 908, Status 920), so the structure of the table row is different: the reference puts Total and Status at the right edge, the build puts them mid-row with blank space after.

Conflict to resolve: the checkpoint's Do step 3 gives the fixed widths ("Date (110), Type (120), No. (110), Due date (110), Total (130, right-aligned), Status (flex 1)"), and the build follows it. The brief also says the scratch route "is the visual reference for every rendering checkpoint. Copy its class names". The two disagree; the approved reference is the one the human saw. Fix: give Date, Type, No. and Due date flex widths (the reference proportions are about 164 : 178 : 150 : 190 at 956 px) with Status a fixed last column, the same constants in header and rows.

### NOTE 1 — tooltip over the Overdue figure

- empty-inactive-sub-390 (light, dark): header, above the New transaction button — a tooltip "New transaction ⌥N" covers most of the Overdue figure "$0.00". The reference shot has no tooltip. Probably the pointer or the focus was left on the button at capture. Capture the shot again with no hover or focus on the button. If the tooltip shows without hover on a phone, see "For gate 3".

### NOTE 2 — a document with no number

- long-1600 (light, dark): table, No. column — the two draft rows have an empty No. cell, while the empty Due date cell in the same rows shows "—". The two empty cells of one row read differently. An "—" in No. is consistent.
- long-390 (light, dark): cards — a draft with no number has the title "Sales receipt" / "Invoice" only. Readable; no change necessary, but two drafts of one type on one date cannot be told apart.

## Clean shots

- transactions-390 (light, dark): nothing found. Cards match the reference (type and number, date, total, status badge).
- filter-empty-1280 (light, dark): nothing found.
- empty-inactive-sub-1280 (light, dark): nothing found.
- loading-390, loading-1280 (light, dark): nothing found.

## For gate 3

- empty-inactive-sub-390: the shortcut tooltip "New transaction ⌥N" is visible on the phone layout over a disabled button. Check that it shows only on hover or keyboard focus, and not after the page opens or after a tap on the disabled `customer-transactions-empty-new` button.
