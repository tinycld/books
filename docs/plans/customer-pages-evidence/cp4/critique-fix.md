# Gate 2 critique after fix round 1: customer-pages, checkpoint 4 (Customer transactions tab)

Scope: the Transactions tab only (chips, table, phone cards, empty, filter-empty, loading). The header, the balance and the missing Contacts tab are not judged (checkpoints 2, 3, 5). Data differences from the fixture are not findings. All 22 built shots (11 names, light and dark) were read, with the light reference of each name and the dark reference of transactions-1280.

Result: 0 INVALID, 0 BLOCKING, 1 NOTE.

## State check

| Shot (light + dark) | Shows the named state? |
|---|---|
| transactions-390 | Yes. Populated, phone cards (3 rows). |
| transactions-1280 | Yes. Populated, table, page surface. |
| transactions-1600 | Yes. Populated, table, record surface beside the list. |
| filter-empty-1280 | Yes. Sales receipts chip selected, "No sales receipts for this customer", Show all. |
| empty-inactive-sub-390 | Yes. Inactive sub-customer, empty list, disabled buttons, no tooltip. |
| empty-inactive-sub-1280 | Yes. |
| read-only-1280 | Yes. No New transaction, no More; the list shows. |
| long-390 | Yes. Long name and address, cards. |
| long-1600 | Yes. Long name on two lines, table. |
| loading-390 | Yes. Spinner in the tab body, figures "—". |
| loading-1280 | Yes. |

## Fixes from the first critique

- BLOCKING 1 (table columns do not use the tab width): fixed. The columns now sit at the reference positions. 1280: Date 340, Type 504, No. 682, Due date 832, Total right edge 1148, Status 1160. 1600: Date 661, Type 825, No. 1003, Due date 1152, Total right edge 1468, Status 1480. Header and rows are aligned in transactions-1280, transactions-1600, read-only-1280 and long-1600, light and dark.
- NOTE 1 (tooltip over the Overdue figure): fixed. empty-inactive-sub-390 (light, dark) shows no tooltip and agrees with the reference.
- NOTE 2 (a document with no number): not changed. It stays as the NOTE below.

## Findings

### NOTE 1 — a document with no number

- long-1600 (light, dark): table, No. column — the two draft rows have an empty No. cell, while the empty Due date cell in the same rows shows "—". The two empty cells of one row read differently. No rule: the spec gives "—" only for the Due date ("Due date (invoices only; "—" otherwise)"). An "—" in No. is consistent.
- long-390 (light, dark): cards — a draft with no number has the title "Sales receipt" / "Invoice" only. Readable. Two drafts of one type on one date cannot be told apart.

## Clean shots

- transactions-390 (light, dark): nothing found.
- transactions-1280 (light, dark): nothing found.
- transactions-1600 (light, dark): nothing found.
- filter-empty-1280 (light, dark): nothing found.
- empty-inactive-sub-390 (light, dark): nothing found.
- empty-inactive-sub-1280 (light, dark): nothing found.
- read-only-1280 (light, dark): nothing found.
- loading-390, loading-1280 (light, dark): nothing found.

## For gate 3

- From the first critique, not visible in these shots: check that the shortcut tooltip "New transaction ⌥N" shows only on hover or keyboard focus, and not after a tap on the disabled `customer-transactions-empty-new` button on a phone.
