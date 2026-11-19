# write-off — helix run ledger

- mode: unattended
- unit: p2-write-off
- started: 2026-11-18
- package branch: books/p2-write-off   core checkout: main (470a6f7b)
- spec: docs/specs/write-off-design.md
- checkpoints: docs/plans/write-off-checkpoints.md
- reference: docs/plans/write-off-reference/
- evidence: docs/plans/write-off-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/write-off-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - The amount given up is the most prominent figure of the action → expressible (`text-2xl font-semibold text-foreground tabular-nums` under a `text-xs text-muted-foreground` label, the classes of `DocumentHeader`'s big figure)

## Deferrals
(none yet)

## Rebuttals
(none yet)

## Design notes
(none yet)

## Out-of-plan changes
(none yet)

## Phase notes
- phase 1: none (unattended; look-ahead packet built against books p2-refund-receipt@59910ea4, core 470a6f7b; still valid at the gate)
- phase 3: design gate 2026-11-18 — the human picked direction A (dialog on the invoice) and accepted every recommended answer (Q1–Q18). On Q1 the human asked about a partial write-off and decided: no partial write-off; a partial reduction waits for credit memos applied to an invoice (p2-apply-credit). Q17: the unit that merges second adds `write_off` to p5-ar-aging's `books_receivable_lines` view. Q18: p3-purchase-lists merges first; keep both sides in shared files.
- phase 3 pass 2: reference captured 2026-11-18 (72 files, 24 states; fixture `tinycld/books/lib/write-off-fixture.ts`). No spark dropped. Notes for phase 4:
  - The fixture uses local interfaces (`WriteOffRecord`, `WriteOffInvoiceRecord` = `BooksInvoices & { written_off }`), because `books_write_offs` and `books_invoices.written_off` do not exist yet. The migration checkpoint replaces them with the generated types.
  - `WRITE_OFF_SEED` (invoice + write-off pair) is a candidate for the seed; the plan picks the customer and the dates.
  - The notice in the dialog is `DocumentInlineNotice` (bordered muted box). The spec names `DocumentNotice`, which is the full-screen notice with a back link.
  - The read bars in the reference are drawn in the scratch route (ShortcutButtons + `DocumentMoreMenu`), because `DocumentReadActions` is typed to `DocumentReadAction` and has no `write_off`. The build adds the action to the shared bar (key `W`, after Create credit memo, only while a balance is open). At 1280 the bar of an open invoice has 8 buttons and wraps to 2 rows.
  - A written-off invoice keeps Edit and Void in its bar (spec §3.4: their dialogs refuse); the artboard does not show them.
  - The write-off page has no document kind: the reference uses `DocumentChromeContext` (`testId: 'write-off'`, figure label "Amount written off", lifecycle `posting`) for `DocumentHeader`, and its own load-error view (`DocumentLoadError` reads a document kind).
  - Not in the reference (they need types the checkpoints add): the invoice lines table in the invoice backdrop (unchanged view), the row menu's "Write off" row (`RowMenuAction`), the customer Transactions "Write-off" row kind (`TransactionKind`). The back link shows the `EntryBackLink` default label ("Journal entries"); the build uses the real return route.
  - An invoice with nothing written off lists only void write-offs in its Write-offs section (state `invoice-reopened`); with none, the section is absent.
- phase 4: plan written 2026-11-18, 4 checkpoints (1 data and posting; 2 dialog on the invoice; 3 write-off page and void; 4 lists, customer page, help). plan-check: 0 errors. 10 new e2e tests.
  - Plan decisions the human did not see: (a) the customer Transactions tab has no row menu today, so spec §3.1 bullet 3 is delivered there by a new one-row menu ("Write off") on invoice rows (`PartyTransactionsList` `rowMenu` prop; the vendor tab does not change); (b) a written-off invoice keeps Edit and Void in its bar, and only the server refuses (void dialog, list banner, correction form's error summary); (c) `TransactionKind` gains `write_off` for the customer tab only (`SalesKind` excludes it from the Sales tabs and New actions); (d) a `write_off` journal entry offers Open and Void (Void opens the write-off page), no Edit and no Reverse; (e) seed: Delta Freight Partners, invoice 2026-10-03 $215.50, write-off 2026-11-10 to 6050, days to be confirmed against the report specs in checkpoint 1.
  - States with no e2e test (dialog loading, load error, no account, offline; section load error; page loading, error, not found, offline; the server's amount refusal): pure helpers with unit tests and gate 2.
  - Plan review (one subagent; report in the unit's staging folder, `plan-review.md`): 27 findings, all fixed in the plan except N7 (`openCustomer` exists in `tests/e2e/customer-form-helpers.ts`). Fixed: test ids with dashes (`sales-row-action-write-off`, `customer-transactions-filter-write-off`); `ReadBalanceBadge` already has `refunded` as 4th argument (wrapper for the invoice); `readTotals` amount is a text read from `kindFields`; `invoiceBalanceKind.Collection`; generic row type and wider `TABLE_MIN_WIDTH` for the customer row menu; `owner` as an argument of `useDocumentReadActions`; `entryActions` hides Edit for `write_off` (checkpoint 1, with `tests/entry-actions.test.ts`); pure state helpers for untested states; the held-write and Cancel assertions; Files and Gates gained `server/search_index_test.go`, `tests/back-to-entries.test.ts`, `tests/e2e/sales-lists-helpers.ts`, `tests/e2e/sales-lists-filters.spec.ts`; `invoiceToWriteOff` in place of `postedInvoiceFor` ($150.00); `page.goBack()` to the customer page; the seeded pair named by customer; the `written_off` repair has its own save.
- review mode switches: none

## Final review
- eval:
- native: not executed in this run
