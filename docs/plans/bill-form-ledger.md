# bill-form — helix run ledger

- started: 2026-11-13
- mode: unattended
- unit: p3-bill
- package branch: books/p3-bill   core checkout: tinycld main at 7545389
- spec: docs/specs/bill-form-design.md
- checkpoints: docs/plans/bill-form-checkpoints.md
- reference: docs/plans/bill-form-reference/
- evidence: docs/plans/bill-form-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/bill-form-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - The amount owed is the largest figure → expressible (`DocumentHeader` big figure, `text-2xl font-semibold text-foreground tabular-nums`, label "Balance due")
  - Account lines and product lines read as two separate groups, each with its own headers → expressible (two core table built-ins in one host, each under a Books section heading `text-sm font-semibold text-foreground`; the Amount column shares one width constant so totals align)

## Deferrals
(none yet)

## Rebuttals
(none yet — every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)

## Design notes
(none yet — gate-2 NOTEs the loop did not act on, as
`cp N · <shot>: <where> — <what>`; shown to the human at each checkpoint
and again at the end)

## Out-of-plan changes
(none yet — every file touched that no checkpoint's Files block named, with why)

## Phase notes
- phase 1 / design gate (human, 2026-11-13):
  - Direction A picked: two tables, Account details then Product and service details.
  - NEW setting "Bill lines" (Settings → Purchases → Bills card; Accounts and products / Accounts only / Products only; default both; field `books_settings.purchase_lines`). Only Books admins edit it (the Settings `isAdmin` gate and the existing `books_settings` update rule), confirmed by the human 2026-11-13. It decides which line tables the bill form shows; a hidden table still shows on a bill that already has lines in it. p3-expense and p3-vendor-credit read it later; only the bill uses it now. zod form; in help topic `books:bills`.
  - Q5 narrowed: Account picker lists only active `expense`, `other_expense` and `cost_of_goods_sold` accounts; the server refuses any other type on an account line at every save. Amount rules kept (typed, may be negative, not 0; total ≥ 0 to save, > 0 to post).
  - Q8: the vendor's default expense account fills the first account line only when the Account details table shows and the account is one the picker lists.
  - Q1–Q3, Q6, Q7, Q9–Q20: accepted as recommended in the packet.
- phase 3 (2026-11-13, unattended, pass 2): Direction A + the Bill lines setting captured. Fixture `tinycld/books/lib/bill-form-fixture.ts`: LOCAL `BillRecord` / `BillLineRecord` mirroring spec §4 (the migration checkpoint, 2100000013, must replace them with the generated `BooksBills` / `BooksBillLines` through `satisfies`); lines name their account by seed number (`BillLineFixtureRecord.account_number`, the seed maps it, as the vendor fixture); `BILL_TODAY` 2026-11-13; bills: draft Pacific Power (6900 Old Petty Cash, due on receipt, ref 88412), posted 1002 Office Supply World (2 account lines on 6210, one −$38.90; 3 product lines, one long description; total $909.95), posted 1003 Summit IT (6200, $1,280.00), void 1001 Metro Commercial Properties (6100, $3,250.00); `BILL_SEED_IDS` (void, 1002, 1003, then the draft), `NEW_BILL_LINES`, `PURCHASE_LINES_LABELS`, `BILL_ACCOUNT_TYPES`, `BILL_REFUSALS`. The fixture checks its own totals, products and account types at load. Scratch route `tinycld/books/screens/helix-mockup.tsx`, states: new, new-accounts, new-products, draft, correction (Accounts only setting, still shows the product table because the bill has product lines), errors, no-lines, delete, posted, void, reader, settings, settings-readonly, loading, error, not-found, no-access, cannot-edit (phone-more = draft + a click on More). Manifest `docs/plans/bill-form-capture.json`; reference `docs/plans/bill-form-reference/` (60 files). Sparks: both kept (Balance due big figure via `DocumentHeader`; two tables under `text-sm font-semibold` headings with the Amount column at `AMOUNT_COLUMN_WIDTH` and a 44 px row-menu column in both, so totals end under Amount). No spark dropped. No human corrections (unattended).
  - for phase 4: the seeded book has no 2000 Accounts payable (the first seeded post creates it through `ensurePayables`) and no 6400; bill accounts in the seed chart are 6100, 6200, 6210 (expense) and 6900 (other_expense, INACTIVE). The spec's seeded draft names 6900, so the Account picker must show a stored inactive account on a draft line (it lists active accounts only) and Post refuses it; the posted seed bills move 6100/6200/6210 balances and create 2000: grep the report and register specs for those accounts.
  - The route draws the bill's totals itself ("Account lines", "Products and services", Total, Balance due): `DocumentTotalsPanel` has only Subtotal/Tax/Total/last row, so the build extends it per kind. Wide band: Vendor and Mailing address halves, then Terms, Bill date, Due date, Vendor's bill no. quarters; phone: Vendor over Mailing address, then two rows of halves.
  - Widths measured on `/a/books/helix-mockup` inside the Books layout, the shipping layout for `books/bills/*`.
- phase 4 (2026-11-13, unattended, review mode C): plan `docs/plans/bill-form-checkpoints.md`, 5 checkpoints (1 data + Go layer generalization, 2 client layer generalization, 3 bill form + read view, 4 bills across Books, 5 Purchases setting + help), 11 of 12 e2e runs (2 at 390), all in `tests/e2e/bill-form.spec.ts` under `bill-form:` describes. No core change. Accepted deviation: core `TableField` "No rows yet." under an empty table stays. plan-check exit 0 (warnings only: produced names not reused later, and names defined in an earlier checkpoint).
  - plan review (general-purpose subagent, 44 findings, all fixed): `Cable ties, 100 pack` is inactive and the e2e products had no purchase description → tests use `Wireless access point`; address-fill checks moved to Office Supply World (Summit and Pacific Power have no address); keyboard create test now covers title, no tabs, hints, no message field, Edit vendor tab stop, ⌥P product line by keyboard, Enter in Rate, core row keys; edit test adds ⌘⇧↵ Post & new and Esc discard; refusal test adds Product line / inactive vendor routing, draft kept after a refused post, ⌘⌫ delete, account-cell load error with Retry; correction test checks "Replaced by", E key, and C copy with Vendor focus; CP4 uses J; row-menu items, purchases picker filter, typed-description kept; bill tables `required: false` so `hideBuiltins` can hide them; new `lib/bill-pickers.ts` (account, product, vendor options with inactive / not purchased labels and empty texts, unit-tested); figure `—` / `Too large` via `bigFigureText`; screen-state cases for every failing read; `documentNewHref` key order is `fresh` before the party; `tableSubtotals` one array shape; `checkBillLinesToPost` named; `floored` exported; `purchaseLinesSchema` in `lib/settings-schema.ts` on `useSettingsForm` (no new hook; keeps zod out of the seed graph); `purchasesSummary(undefined)` fallback; settings save-error e2e step; read view shows tables whatever the setting; pinning tests added to Files (`tests/register.test.ts`, `server/numbering_test.go`, `tests/collections.test.ts`, `server/search_index_test.go`); help ripple (`help/settings.md`, `help/vendors.md`, `help/products-services.md` with their tests); wider grep in CP1 (6400, 6900, seeded product names); CP3 gate 1 adds `sales-receipt-form.spec.ts` and `products-services-bundle.spec.ts`; manifest path lines dropped (routes and help are found by directory). Desktop V key not driven by a bill e2e (shared `DOCUMENT_READ_KEYS`, pinned by `tests/document-actions.test.ts`).
- review mode switches: none

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
