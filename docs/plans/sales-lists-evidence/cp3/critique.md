# Gate 2 critique: sales-lists, checkpoint 3 (Filters and sort)

Verdict: `CRITIQUE: 0 INVALID, 1 BLOCKING, 2 NOTE`

Counts are distinct findings. B1 shows in 5 shots (10 files). All 24 built files were read, with their 24 reference files.

## Distinct findings

- **B1 (BLOCKING)** — table header: the column labels sit on three different lines. Sortable left-aligned labels (DATE, NO., DUE DATE) are at the top of the header (y about 236), the labels that do not sort (TYPE, CUSTOMER, MEMO, STATUS) are in the middle (y about 250), and sortable right-aligned labels (AMOUNT, BALANCE, TOTAL) are at the bottom (y about 264). The header is also about 56 px tall, not 44. Basis: the reference header has all labels on one line in a 44 px header (`invoices-1280-*`, `all-1280-*`, `invoices-sorted-1280-*`); the brief, Do 2: "`ListSortHeaderCell`: ... the label in the `ListHeaderCell` text classes ... 44 px tall; the same `style` as the row cell". Possible cause, not verified in code: the `align` value is applied on the vertical axis of the Pressable (left = start = top, right = end = bottom).
- **N1 (NOTE)** — phone toolbar, row 3: only the first letter of the Sort menu ("S") shows at the right edge; the user must scroll sideways to find Sort. The reference shows the same, and the brief records it as the kept weak point (core `PickMenu` `touch` minimum width 160 px). No rule is broken. It is the only sort control on a phone, so a narrower range or customer trigger would be better.
- **N2 (NOTE)** — wide toolbar: the chips are wider than the reference chips ("All" about 50 px against 42 px), so the search field is about 50 px narrower at 1280. The brief sets `touch` to `px-4`, so this is the plan's size, not a defect.

## Per screenshot

State check: every built shot shows the state of its name.

- `all-1280-light`, `all-1280-dark`: valid (All sales, table, Date descending).
  - `all-1280`: table header — labels on three lines (DATE, NO. high; AMOUNT low) — BLOCKING (B1: reference one-line header; "44 px tall; the same `style` as the row cell").
  - `all-1280`: toolbar chips wider than the reference — NOTE (N2).
- `all-mid-900-light`, `all-mid-900-dark`: valid (cards, toolbar with Sort menu). Nothing found.
- `all-phone-390-light`, `all-phone-390-dark`: valid (three-row phone toolbar, cards).
  - `all-phone-390`: toolbar row 3, right edge — Sort shows as one letter — NOTE (N1).
- `invoices-1280-light`, `invoices-1280-dark`: valid (Invoices table, Date descending).
  - `invoices-1280`: table header — DATE, NO., DUE DATE high; BALANCE, TOTAL low; CUSTOMER, STATUS middle — BLOCKING (B1).
- `invoices-phone-390-light`, `invoices-phone-390-dark`: valid.
  - `invoices-phone-390`: toolbar row 3 — Sort shows as one letter — NOTE (N1).
- `invoices-sorted-1280-light`, `invoices-sorted-1280-dark`: valid (No. ascending: arrow up on NO., no arrow on DATE, drafts first, then 1001, 1002, ...).
  - `invoices-sorted-1280`: table header — same three lines — BLOCKING (B1).
- `payments-phone-390-light`, `payments-phone-390-dark`: valid (Payments chips All, Applied, Credit left, Draft, Void).
  - `payments-phone-390`: toolbar row 3 — Sort shows as one letter — NOTE (N1).
- `sort-menu-phone-390-light`, `sort-menu-phone-390-dark`: valid (Sort menu open, ten items, tick on "Date, newest first"). Nothing found; it agrees with the reference.
- `range-menu-1280-light`, `range-menu-1280-dark`: valid (range menu open, six items, tick on All dates).
  - `range-menu-1280`: table header behind the menu — same three lines — BLOCKING (B1).
- `customer-picker-1280-light`, `customer-picker-1280-dark`: valid (picker open, search field, "All customers" ticked, customers in name order).
  - `customer-picker-1280`: table header right of the popover — same three lines — BLOCKING (B1).
- `no-match-1280-light`, `no-match-1280-dark`: valid ("No invoices match" with Clear filters; the filter set is search text only, the reference also sets chip, range and customer). Nothing found.
- `no-match-phone-390-light`, `no-match-phone-390-dark`: valid.
  - `no-match-phone-390`: toolbar row 3 — Sort shows as one letter — NOTE (N1).

Light and dark: text, chips, badges, menus and the picker are legible in both schemes.

Not findings (later checkpoint or recorded decision): no tick boxes, row menus or Batch actions; seeded rows differ from the fixture; the customer list is in name order (brief Do 4); the shell FAB covers a card's amount on a phone (also in the reference).

## For gate 3

Nothing seen.
