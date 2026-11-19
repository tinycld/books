# Gate 2 critique: refund-receipt-form, checkpoint 5 (Lists, customer page, help)

Result: 4 INVALID, 1 BLOCKING, 1 NOTE.

Scope of the check: the 20 built shots, the brief, the spec, the lessons, `memories-design.md` and `capture.json` were read. The merged reference shots (sales-lists-evidence, credit-memo-form-evidence/cp5, sales-receipt-form-evidence/cp5) were NOT opened: their file names are not given and this agent has no tool to list a folder. The shots were judged on their own and against the spec. The BLOCKING finding below was therefore not compared with the merged credit memo cards.

## sales-lists-refund-receipts

State check:
- 1280 light, 1280 dark: VALID. The Refund receipts tab is active (after Credit memos), with the seeded draft, payout (1002) and posted refund (1001).
- 390 light, 390 dark: VALID. The same three rows as cards.

Findings:
- sales-lists-refund-receipts-390-light, -390-dark: card amount, rows 1 and 3 — the minus sign is alone on one line and the figure is on the next line ("−" / "$118.05", "−" / "$1,346.77"). Row 2 ("−$205.46") stays on one line, so the three cards do not agree. The title already truncates with "…", but the amount still shrinks. A lone "−" reads as a dash, not as a sign. — BLOCKING (spec §3.13: "the amount shows with a minus sign ("−$150.00")"; the figure and its sign are one value). The amount must not shrink or wrap; the title takes the truncation.
- sales-lists-refund-receipts-1280-light, -1280-dark: Customer column, row 1 — "St. Jude Community Hospital…" truncates at 1280 while the row has free width between Memo and Total. — NOTE.
- Not findings: the Memo column and the "TOTAL" header (the plan gives the sales receipts tab's column keys), the status chips (All / Refunded / Draft / Void), the "Refunded" success chip, the "—" number of the draft. Light and dark are both legible. No sideways scroll of the table at either width.

## customer-transactions-refunds

State check:
- 1280 light, 1280 dark, 390 light, 390 dark: VALID. Harborview Hospitality Group, Transactions tab, "Refunds" chip active (after Credit memos), one row: Refund receipt 1001, −$1,346.77, Refunded.

Findings: nothing found. (Type label "Refund receipt", minus-signed total and the success "Refunded" badge agree with spec §3.13. The 390 card keeps the amount on one line.)

## customer-transactions-memo-refunded

State check:
- 1280 light, 1280 dark, 390 light, 390 dark: VALID. Aspen Ridge Dental, "Credit memos" chip active, credit memo 1003 with the "Refunded" badge (success tone) and credit memo 1002 "Unapplied".

Findings: nothing found.

## sales-tax-liability-refund

State check:
- 1280 light, 1280 dark, 390 light, 390 dark: INVALID. The brief asks for "the report on Accrual for November 2026 with the seeded refund's negative row". The shots show the report on Accrual for Nov 1 – Nov 30, 2026 with the rate rows (Denver city, Colorado state, RTD transit) collapsed. No document row is on screen, so the row "Refund receipt 1001" (spec §3.13: "its row reads "Refund receipt 1003" and opens it") is not shown. Only the negative rate totals are visible. Capture again with one rate row expanded (for example Denver city) before the shot.

No critique (invalid).

## help-refund-receipts

State check:
- 1280 light, 1280 dark, 390 light, 390 dark: VALID. The help viewer shows the topic "Refund receipts" with its summary and the sections Refund a sale, Refund from and its balance, Start from a sales receipt, Pay out a credit memo (the shot ends there; later sections are below the captured height).

Findings: nothing found. (Headings, lists and links are legible in light and dark; text wraps cleanly at 390.)

## For gate 3

- None seen.
