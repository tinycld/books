# ap-aging — checkpoints

Spec: `docs/specs/ap-aging-design.md` (design gate 2026-11-19: direction A, the answers of §11). Reference: `docs/plans/ap-aging-reference/` (capture `docs/plans/ap-aging-capture.json`; drawn from a static `ReportViewModel` on the scratch route `/a/books/helix-mockup?state=<state>`). Fixture: `tinycld/books/lib/ap-aging-fixture.ts`. Package branch `books/p5-ap-aging` (books main with p2-apply-credit merged in, cbacae83). Core: `main`, read only; no core checkpoint. Review mode C (unattended).

Rules for every checkpoint:

- **Where the work is.** Workspace root `/Users/nas/tmp/tinycld/books`. Every checkpoint is Books: paths are relative to the books package root `/Users/nas/tmp/tinycld/books/books`. A path that starts `tinycld/core/` or `tinycld/tests/` is in the core checkout, relative to the workspace root, and is read only. No checkpoint edits a file under `/Users/nas/tmp/tinycld/books/tinycld`.
- **Core gap rule (human, 2026-11-01).** If `reports.CheckSources`, `reports.Validate` or `reports.Run` refuses a part of this unit's source or spec, or a figure differs from spec §3 for a reason in the engine, read the engine code that decides it (`tinycld/core/server/reports/`). A different way to write the same report with what core has is allowed (say so in the report). If the engine cannot express it, **stop**: hand back `STOPPED: core gap` with the refused node and the engine's message. Never design around it in Books.
- **Performance rule (spec §9).** A bar of spec §9 is never changed and a run is never removed to pass. A bar that fails because of the stored table or a missing index is fixed in this unit's migration. A bar that fails because of the SQL that core's engine writes **stops the run**: hand back `STOPPED: core SQL fails a performance bar` with the statement, its plan and the time.
- **The A/R Aging does not change (spec §4.2, §8).** The receivable SQL constants (`receivableLinesSQL`, `receivableApplicationsSQL`, `receivableCreditApplicationsSQL`, `receivableColumns`), the receivable hook points, the A/R Aging's spec JSON, its Revision (1), `server/testdata/ar_aging_spec.json`, `server/testdata/ar_aging_stat1.json` and the rows of `books_receivable_items` stay as p2-apply-credit merged them. Two golden tests of checkpoint 1 hold this through every later checkpoint. A change that makes one of them red is wrong; the golden files are written one time, in checkpoint 1's step 0, and `BOOKS_GOLDEN=1` is not used after it in this unit. The statements the golden test does not hold (the insert, the delete, the verify and the pairs query of a refresh, which becomes `SELECT DISTINCT customer AS party, item`) are run by no report; the receivable row tests hold what they do.
- **Files shared with p5-report-engine-scale** (another lane, not merged; this unit merges after it, spec §10): `server/balances.go`, `server/report_sources.go`, `server/report_sources_test.go`, `help/reports.md`. Edits to them are small and additive: add lines, change a line only where this plan names it, move nothing, reformat nothing.
- **Gate 1**, from the books root: `cd server && go test ./...`; `pnpm exec tinycld-pkg check`; then the e2e the checkpoint names.
- **E2E.** Ports first, in the same Bash command: `lsof -iTCP -sTCP:LISTEN -nP | grep -qE ':(7230|7231) ' && { echo PORTS-BUSY; exit 1; }`. Then named files in ONE command, paths from the workspace root: `E2E_PORT=7230 E2E_PORT_2=7231 E2E_IMAP_PORT=1230 E2E_IMAP_PORT_2=1231 pnpm exec tinycld-pkg test:e2e books/tests/e2e/books-ap-aging.spec.ts` (more files in the same command when a checkpoint names them). Never `-g` with file names. Never the full suite. A run that needs more than about 4 minutes is handed back as `NEEDS-RUN: <command>`.
- **Captures** (gate 2) run with the files command: `HELIX_CAPTURE=<manifest> E2E_PORT=7230 E2E_PORT_2=7231 E2E_IMAP_PORT=1230 E2E_IMAP_PORT_2=1231 pnpm exec tinycld-pkg test:e2e books/tests/e2e/helix-capture.spec.ts`.
- Every `test.describe` title this run adds starts with `ap-aging:`. All e2e of this report are in `tests/e2e/books-ap-aging.spec.ts`; its helpers are in the new `tests/e2e/ap-aging-helpers.ts`, which imports `tests/e2e/ar-aging-helpers.ts`, `tests/e2e/books-report-helpers.ts`, `tests/e2e/customer-balance-helpers.ts`, `tests/e2e/pay-bills-helpers.ts`, `tests/e2e/vendor-credit-helpers.ts`, `tests/e2e/record-form-helpers.ts` and `@tinycld/core/e2e-helpers` (`hubRow`, `chooseParamOption`), and edits none of them.
- **Sizes (plan review F20, F21).** Checkpoints 2 and 3 are estimated at about 2,300 and 2,500 changed lines with their tests, above the target of about 2,000: their Go test files mirror the A/R Aging's (`server/receivable_*_test.go`, `server/report_ar_aging_test.go`). They are not split, because the stored rows cannot be judged without the route, the source and `requireNoDrift`, and the report cannot be judged without its Go tests and its e2e; the plan stays at 5 checkpoints. An e2e test of this report that posts two documents through the UI needs more than 10 s locally, as the A/R Aging's do; none is split into a chain of goals.
- **E2E budget: 9 tests** (checkpoint 3 adds 6, checkpoint 5 adds 3; a phone run counts once per width).
- E2E creates its data through the UI with `uniqueName(prefix)` (`tests/e2e/record-form-helpers.ts`); a raw request is allowed only to read. No e2e posts a document dated before 2026-07-01 (`books-settings.spec.ts` holds close date 2026-06-30 on the shared database). A bill of this spec is dated and due in July 2026 (`AP_DAY`); a Pay bills payment, a vendor credit and an application are dated today by their screens, so a test that reads them keeps As of at its default, Today. No e2e asserts a figure of a row another spec can move: exact figures only for vendors the test creates, read with the report filtered to those vendors.
- **Reading rows.** The shared e2e book holds many vendors and core's table mounts only the rows near the viewport. A test filters the report to its own vendors (`filterToVendors`) and reads the mounted rows in ONE `reportSnapshot`. After a param change a test waits for a row set only the new run shows (core keeps the previous rows until the new run lands; `snapshotWhen`).
- The shipped spec is revision 1 in every checkpoint (unreleased, no backward compatibility). A developer database that stored an earlier checkpoint's spec keeps it: delete that `reports` row or reset the dev data. The e2e database is new on every run.
- Every checkpoint starts with the test writer (a different agent from the implementer). It writes the checkpoint's "Tests it must add", plus any test-only helper they need, and proves each red for the reason named in the checkpoint's Do step 0. The implementer makes them green and never edits them.
- The scratch route `tinycld/books/screens/helix-mockup.tsx` and the capture spec `tests/e2e/helix-capture.spec.ts` are excluded from git. A gate-2 step may edit them; they are never committed.
- No backward compatibility and no upgrade path: every database starts empty (spec §8).

## Plan decisions (where the plan settles what the spec or phase 3 left open)

- **D1 — migration number 2100000029.** `pb-migrations/` holds 2100000028 (receivable items), 2100000030 (bank matches), 2100000031 (credit memo applications) and 2100000032 (the audit log view); 2100000029 is free. The file is `pb-migrations/2100000029_create_books_payable_items.js`. It runs after the collections it relates to (vendors, journal entries) and before the audit view, so the audit view stays the highest migration, `AFTER_AUDIT` of `tests/migration-prefixes.test.ts` stays empty and no file is renamed. The migration creates no collection the audit view reads. Spec §4.1 says so (edited in phase 4). If another unit takes 2100000029 on main first, the driver renames the file at the merge; no Go code names the number.
- **D2 — the seed rows (spec Q10; `AP_AGING_SEED` was a proposal).** All three rows are on Harbor Freight Logistics, which has no seeded document and is read only by `tests/e2e/vendor-form-list.spec.ts` (list order and layout). The proposal's part payment on Pacific Power's bill "Seed bill open" is dropped: that bill's open balance of 420.00 is read by the vendor credit apply fixture and specs. The rows: a bill of 2026-08-20, due 2026-09-19, ref `HFL-20418`, 860.00 on account 6200, memo "Seed A/P aging: storage, August"; a part payment of 137.25 on that bill, 2026-11-04, check 1061 from account 1000 (137.25 is no amount of the bank statement and bank match fixtures); a vendor credit of 2026-10-06, ref `HFL-CR-0311`, 200.00 on account 6200, memo "Seed A/P aging: storage overcharge credit", with 120.00 applied to the bill on 2026-10-20. The bill then has 602.75 open and the credit 80.00. `seedApAging` runs after `seedApplyCredit` and before `seedBankMatch` (which must see every seeded document and posts none), so no earlier document number moves.
- **D3 — the row id of the credit side of an application** is the application's id followed by `c` (spec §4.1; 16 characters). The receivable table uses `UPPER(id)` for its memo side; the two tables differ on purpose (the spec's text decides), and a Go test reads the 16-character id through REST.
- **D4 — one engine, receivable names kept at the hook points.** `server/open_items.go` holds `openItemsTable` and its methods. The receivable files keep their SQL constants, `refreshReceivableEntry`, `refreshReceivablePayment`, `refreshReceivableCreditMemo`, `refreshReceivableInvoice` and the `bindReceivable…Refresh` functions, except `bindReceivableEntryRefresh`, which checkpoint 2 renames to `bindOpenItemEntryRefresh` because it then refreshes both tables (their callers in `payments.go`, `sales_documents.go`, `credit_memo_applications.go`, `write_offs.go` do not change). The functions that name no receivable become methods: `insertReceivables` → `receivableItems.insert`, `settleReceivables` → `receivableItems.settle`, `settleReceivablesSQL` → `receivableItems.settleSQL`, `fmt.Sprintf(receivableSettledSQL, w)` → `receivableItems.settledSQL(w)`, `rebuildReceivables` → `receivableItems.rebuild`, `verifyReceivables` → `receivableItems.verify`, `refreshReceivables` → `receivableItems.refresh`, `repairReceivables` → `receivableItems.repair`, `registerReceivableWriteGuard` → `receivableItems.registerWriteGuard`; `receivablePair{Customer, Item}` → `itemPair{Party, Item}`, `receivablePart` → `itemPart`, `ReceivableDrift` → `ItemDrift`, `maxReceivableDriftsReported` → `maxItemDriftsReported`, `receivablePairChunk` → `itemPairChunk`, `bindReceivableRefresh` → `bindItemRefresh`, `receivableDriftReport` → `itemDriftReport`. `receivableOpen` stays and equals the new `openItemDay`.
- **D5 — settled reads `SUM(debit - credit)` in both tables.** The day a balance becomes zero is the same for either sign, so the payable table uses the engine's statement with `vendor` for `customer`.
- **D6 — every refresh is keyed so that the last write of a flow leaves the rows right.** A document's own update (post, void, replacement) refreshes every row that reads it. An update of a bill payment line, a vendor refund line or a vendor credit application (a correction moves it with `tx.Save`, `server/document_balance.go` `moveLinesWhere`) refreshes the rows of that one id. The judge is `requireNoDrift`: it runs `payableItems.verify` after every posting test of the package. A posting test that shows a missing or stale row is fixed by a refresh at the write that left it, never by a rebuild.
- **D7 — the vendor sort (spec §4.4).** Keys in this order: `col(due)`, `col(itemNo)`, `fld(date)`, `fld(entry, posted_at)` (the inner keys); No vendor last; the balance key; `lower(display_name)`. Core applies a key on each group level where it has a value, skips a key that reads a row value on a group level, and skips a key that reads a column blank above its level (`tinycld/core/server/reports/levels.go`, `sortKey` and `readsRowValue`). `due` and `itemNo` are `blankAbove: "byItem"`, so the item order applies on the item level only; Largest balance orders vendors and never items.
- **D8 — gate 2 figures and widths.** The reference is drawn from the fixture; the built report holds the seeded book. Gate 2 judges the arrangement (the vendor rows, the age columns, blank ages, the muted inactive row, opened items and lines, the Total, the wrapped lines), not the names and numbers. The scratch route draws the Books sidebar and the shipping route (`/a/reports/<id>`) does not: reference `*-1540-*` = built 1280; reference `*-1284-*` = built 1024; reference `*-1160-*` = built 900 (the tablet arrangement); 375 and 390 are the same on both (ledger, phase 3 pass 2).
- **D9 — core-owned behavior.** Loading, error and Retry, refresh, Customize, Save as, copy link, share and the Export menu are core's report view, driven by core e2e. Books pins what Books owns: the stored rows, the source, the spec (Go), the share, the figures, the entry points and the wrapped layouts. Gate 2 compares `loading-*` and `error-*` nowhere: they are core's view over a static model.
- **D10 — what stands as proof for behavior no new e2e drives.** Live: e2e 4 drives one cause (a bill payment post); the other causes reach the report through the same path, pinned by `TestAPAgingTopics` (the run's topics) and by the stored-row tests of checkpoint 2 (each write refreshes the rows and touches the signal). The drill panel at 1360 px and wider: unchanged p5-drill-down code, driven by `tests/e2e/report-drill-panel.spec.ts`; this unit's e2e drive the own-screen path. The inactive vendor, the No vendor row, the age edges, a past As of day and a reader without Books access: Go tests of checkpoint 3 (`readerInfo`). The tablet arrangement: `TestAPAgingDisplayLayouts` and the `*-1160-*` shots of gate 2.
- **D11 — one shared case file for the values Go and the fixture both hold.** `server/testdata/ap_aging_spec.json` holds the title, the description, the params and the display block (as `server/testdata/ar_aging_spec.json`). `TestAPAgingMatchesSharedSpecFile` compares the shipped spec with it and `tests/ap-aging-fixture.test.ts` compares the fixture with it.
- **D16 — `TestRegister_BindsEachPartOnce` gains no line** (spec §4.5 says it "gains the new parts"). The test compares the hook counts of `Register` with a list of parts bound by hand (`server/registrations_test.go` line 971). Every new bind of this unit is inside a part of that list (`registerLedger`, `registerSalesDocGuards`, `registerBillPaymentGuards`, `registerVendorCreditApplications`, `registerVendorRefundGuards`), so both sides gain the same hooks and the test still fails for a bind made twice or outside those parts.
- **D12 — the fixture keeps local item shapes.** No client collection backs `books_payable_items` (spec §4.5), and the fixture draws core run results. Checkpoint 2 keeps the seed rows typed against the generated document types (`satisfies`) and wires them into `seed.ts`.
- **D13 — plan checks under L statistics** (as the A/R Aging's D10): the ordinary plan test reads each statement's plan with no statistics and with the L dataset's statistics loaded from `server/testdata/ap_aging_stat1.json` (written by the `BOOKS_SCALE=1` run), each reading on ONE connection.
- **D14 — the A/R Aging's L run** is made one time, in checkpoint 4, by the shared harness (spec §9 Record). Checkpoint 1 needs no L run: its golden tests prove that every receivable statement and the whole A/R spec keep their text, and `TestARAgingQueryPlans` reads the plans under the recorded L statistics in the ordinary `go test`.
- **D15 — core mechanisms this plan relies on, with their files.** `diffDays(a, b)` = b − a: `tinycld/core/server/reports/formula.go`. `hideEmpty`, `muted`, `having`, `blankAbove`, `Detail: "blank"`: `tinycld/core/server/reports/bind.go` and `levels.go`. `relationCheck` (a link column is a relation column of the collection): `tinycld/core/server/reports/check.go`. A run's `Topics`: `tinycld/core/server/reports/run.go`; `changesignal.Touch` (it fires after the commit and not for a transaction that is rolled back; core's `touch_test.go` in that folder is the proof, and no Books test repeats it): `tinycld/core/server/changesignal/changesignal.go`. `hubRow` and `chooseParamOption`: `@tinycld/core/e2e-helpers`. CSV and Excel open every group: `tinycld/core/server/reports/export.go`. Wrapped rows: `tinycld/core/reports/lib/table-lines.ts`.

## Checkpoint list

1. Shared engine, A/R Aging unchanged — logic
2. Payable items table and source — logic
3. A/P Aging report for readers — renders
4. Query plans and scale proof — logic
5. Reports menu, narrow layouts, help — renders

### Checkpoint 1 — Shared engine, A/R Aging unchanged

**Delivers:** one engine type, `openItemsTable`, that stores, settles, verifies, rebuilds and refreshes a stored open-items table, with `receivableItems` as its first value, and the aging spec helpers that two reports can call; the A/R Aging's statements, spec JSON and rows are equal to what they were.

**Files:**
- Create: `server/open_items.go`
- Modify: `server/receivable_items.go` (keeps the constants, the three SQL constants and `receivableQueries`; gains `var receivableItems`; its functions and types move to the engine)
- Modify: `server/receivable_refresh.go` (the `refreshReceivable…` functions call `receivableItems.refresh`; `bindReceivableRefresh` becomes `bindItemRefresh`; the write guard, the repair and the message constant's use move to the engine)
- Modify: `server/balances.go` (four edit sites: the `itemDriftReport` definition and its call, `receivableItems.repair(tx)`, `receivableItems.verify(re.App)`)
- Modify: `server/ledger.go` (`receivableItems.registerWriteGuard(app)`)
- Modify: `server/report_spec_helpers.go` (new `itemKindLabel`, `agingDisplay`, `agingItemGroup`, `agingParams`, `agingAge`, `agingDetailLabel`)
- Modify: `server/report_ar_aging.go` (`arParams`, `arGroups`, `arAge`, `arDetailLabel`, `arDisplay` call the helpers; `arItemKindLabel` is removed)
- Modify: `server/env_test.go` (`requireNoDrift` calls `receivableItems.verify`)
- Modify: `server/receivable_items_test.go`, `server/receivable_refresh_test.go`, `server/receivable_stored_test.go`, `server/receivable_credit_application_test.go`, `server/receivable_write_off_test.go`, `server/report_ar_aging_scale_test.go`, `server/report_ar_aging_profile_test.go`, `server/report_ar_aging_test.go` (calls renamed by D4, nothing else)
- Test: `server/open_items_test.go` · `server/testdata/receivable_statements.json` · `server/testdata/ar_aging_spec_full.json`

**Interfaces:**
- Consumes: `receivableItemsCollection`, `receivableColumns`, `receivableLinesSQL`, `receivableApplicationsSQL`, `receivableCreditApplicationsSQL`, `receivableQueries`, `receivableOpen`, `receivableSettledSQL`, `settleReceivablesSQL`, `msgReceivableItemsReadOnly` (`server/receivable_items.go`, `server/receivable_refresh.go`); `arAgingSpec`, `receivableItemsSource`, `customersParam`, `lineEntryTypeLabel`, `mustJSON`, `op`, `fld`, `lit`, `prm` (`server/report_ar_aging.go`, `server/report_sources.go`, `server/report_spec_helpers.go`); `refuse` (`server/guards.go`); `requireNoDrift`, `newLedgerEnv` (`server/env_test.go`)
- Produces (checkpoints 2, 3 and 4 use these names):
  - `type openItemsTable struct { Collection, Party, Columns string; Queries []string; Open, Noun, ReadOnly string }`
  - `func (t openItemsTable) insert(tx core.App, query, where string, params dbx.Params) (int64, error)`
  - `func (t openItemsTable) settledSQL(where string) string` · `func (t openItemsTable) settleSQL(where string) string`
  - `func (t openItemsTable) settle(tx core.App, pairs []itemPair) (int64, error)` with `type itemPair struct { Party string; Item string }` (db tags `party`, `item`)
  - `func (t openItemsTable) rebuild(tx core.App) error` · `func (t openItemsTable) verify(app core.App) ([]ItemDrift, error)` · `func (t openItemsTable) repair(tx core.App) error`
  - `func (t openItemsTable) refresh(tx core.App, stale string, params dbx.Params, parts ...itemPart) error` with `type itemPart struct{ query, where string }`
  - `func (t openItemsTable) registerWriteGuard(app core.App)`
  - `type ItemDrift struct { ID, Entry, Item, Problem string }` (json `id`, `entry`, `item`, `problem`), `const maxItemDriftsReported = 100`, `const openItemDay = "9999-12-31"`
  - `func bindItemRefresh(app core.App, collection string, refresh func(tx core.App, r *core.Record) error)`
  - `func itemDriftReport(drifts []ItemDrift) (listed []ItemDrift, count int)` (`server/balances.go`)
  - `var receivableItems openItemsTable`
  - `func itemKindLabel(source reports.Source) *reports.Node` · `func agingDisplay() *reports.Display` · `func agingItemGroup(net, kindLabel *reports.Node) reports.Group` · `func agingParams(party reports.ParamDef) []reports.ParamDef` · `func agingAge() *reports.Node` · `func agingDetailLabel() *reports.Node`

**Gates:** 1 · 3 (nothing renders; no e2e: no client file and no report statement changes, and the golden tests prove it)

**Spec:**
- §4.2: "The parts that do not name a receivable move to `server/open_items.go` as one type, `openItemsTable` (the collection, the party column, the column list, the row queries, the open day, the read-only message), with the methods `insert`, `settle`, `rebuild`, `verify`, `refresh`, `repair`, `registerWriteGuard` and the shared `ItemDrift` shape. `receivableItems` and `payableItems` are its two values. The receivable SQL constants, the receivable hook points and every statement the A/R Aging runs keep their text, so the A/R Aging's stored rows, its spec JSON, its Revision and its recorded query plans do not change; `server/receivable_*_test.go` and `report_ar_aging_scale_test.go` pass with only their calls renamed."
- §4.4: "extracted from `report_ar_aging.go`, which then calls them with no change to its JSON: `itemKindLabel(source)` (from `arItemKindLabel`), `agingDisplay()` (from `arDisplay`), `agingItemGroup(net, kindLabel)` (the `byItem` level), `agingParams(party)` (As of, the party param, Order)"
- §8: "No change to what the A/R Aging shows or to the SQL it runs."

**Tests it must add:**
- `server/open_items_test.go`, `TestReceivableStatementsKeepTheirText`: reads `server/testdata/receivable_statements.json` and requires, each as an exact string: `receivableItems.Columns` = `columns`; `receivableItems.Queries` = `queries` (three texts, in order); `receivableItems.settledSQL("")` = `settled`; `receivableItems.settledSQL("WHERE customer = 'x'")` = `settledWhere`; `receivableItems.settleSQL("")` = `settle`; `receivableItems.settleSQL("WHERE item = 'x'")` = `settleWhere`. Fails when the extraction changes one character of a receivable statement.
- `server/open_items_test.go`, `TestARAgingSpecKeepsItsJSON`: `string(mustJSON(arAgingSpec()))` equals the bytes of `server/testdata/ar_aging_spec_full.json`, and `arAgingShipped().Revision` is 1. Fails when a helper extraction moves one node of the A/R spec. With `BOOKS_GOLDEN=1` the two tests write their files and fail with "golden written"; the header comment of the test file says the files change only with a new A/R scale run (`docs/plans/ar-aging-evidence/perf-plans.md` and `server/testdata/ar_aging_stat1.json` are recorded against these texts).
- `server/open_items_test.go`, `TestOpenItemsEngineOnASecondTable`: on a `newLedgerEnv` app it makes a second table by raw SQL (`CREATE TABLE zz_open_items` with the columns `id, source, vendor, entry, date, currency, debit, credit, item, item_kind, item_number, item_seq, due_date, settled`) and a value `openItemsTable{Collection: "zz_open_items", Party: "vendor", Columns: <those 13 without settled>, Queries: []string{<one SELECT of three literal rows with VALUES: two rows of item A for vendor v1 that add to zero on 2026-03-05, one row of item B>}, Open: openItemDay, Noun: "test", ReadOnly: "no"}`. It asserts: `rebuild` in a transaction stores three rows; item A's rows have `settled` "2026-03-05" and item B's `openItemDay`; `verify` gives no drift; after a raw `UPDATE … SET settled = '2026-01-01'` on one row `verify` gives one drift with `Problem` "settled"; after a raw `DELETE` of a row, one "missing"; after a raw insert of a row the query does not give, one "stale"; `repair` in a transaction makes `verify` empty again; `refresh` on the app outside a transaction returns an error whose text is "books: test rows are refreshed only inside the transaction of the write". Fails when a method still names the receivable table or the `customer` column. `changesignal.Touch` on a table with no collection only logs a warning; that log is not a failure.
- The existing tests are the proof of the rows: `server/receivable_items_test.go`, `server/receivable_refresh_test.go`, `server/receivable_stored_test.go`, `server/receivable_credit_application_test.go`, `server/receivable_write_off_test.go`, `server/report_ar_aging_test.go` (with `TestARAgingMatchesSharedSpecFile` and `TestARAgingDisplayLayouts`), `TestARAgingBulkWriterMatchesPosters`, `TestARAgingQueryPlans` and `TestARAgingRunsAgreeWithSmallBook` pass with only the renames of D4.

**Do:**
0. Test writer. First, before any other change, write the two golden files from the tree as it is, with a throwaway test in `server/` that is deleted after its run (never committed): `receivable_statements.json` is `{"columns": receivableColumns, "queries": receivableQueries, "settled": fmt.Sprintf(receivableSettledSQL, ""), "settledWhere": fmt.Sprintf(receivableSettledSQL, "WHERE customer = 'x'"), "settle": settleReceivablesSQL(""), "settleWhere": settleReceivablesSQL("WHERE item = 'x'")}` (indented JSON, `SetEscapeHTML(false)`), and `ar_aging_spec_full.json` is the bytes of `mustJSON(arAgingSpec())`. Then write `server/open_items_test.go`. Red for: the package's tests do not compile, because `receivableItems`, `openItemsTable`, `openItemDay` and `ItemDrift` do not exist. Say in the report that the red is a compile error and that `go vet ./...` names only those four symbols.
1. `server/open_items.go`. Move the bodies from the receivable files with these substitutions only: the collection name → `t.Collection`; the column list → `t.Columns`; the word `customer` in SQL → `t.Party`; `receivableOpen` → `t.Open`; `receivableQueries` → `t.Queries`; the word "receivable" in an error text → `t.Noun`. The type and the parts whose shape changes:
   ```go
   // openItemsTable is one stored open-items table: one row per movement of an
   // item of one party, written only by Books from Queries, with the day each
   // item settles. receivableItems and payableItems are its two values.
   type openItemsTable struct {
       Collection string   // books_receivable_items
       Party      string   // the party column: customer or vendor
       Columns    string   // the columns every query gives, in their order
       Queries    []string // the row queries; each ends in its WHERE
       Open       string   // settled while the item is open
       Noun       string   // "receivable": names the table in error texts
       ReadOnly   string   // the refusal of a REST write
   }

   const openItemDay = "9999-12-31"

   type itemPair struct {
       Party string `db:"party"`
       Item  string `db:"item"`
   }

   type itemPart struct{ query, where string }
   ```
   - `settledSQL(where)` returns the text of `receivableSettledSQL` after `fmt.Sprintf`, built by concatenation with `t.Party`, `t.Collection` and `t.Open`; every space, tab and line break stays (the golden test compares the string).
   - `settleSQL(where)` is `settleReceivablesSQL` with `t.settledSQL(where)`.
   - `settle` keeps the param names `c<i>` and `i<i>` and writes the term `(<Party> = {:c<i>} AND item = {:i<i>})`.
   - `refresh` reads the pairs with `"SELECT DISTINCT " + t.Party + " AS party, item FROM " + t.Collection + " WHERE " + stale`; its refusal outside a transaction is `"books: " + t.Noun + " rows are refreshed only inside the transaction of the write"`.
   - `verify` builds the statement of `verifyReceivables` from `t.Queries`, `t.Columns`, `t.Collection`, `t.Party` and `t.settledSQL("")`, and scans into `[]ItemDrift`.
   - `registerWriteGuard` binds the three request hooks with `refuse(t.ReadOnly)`. `repair` is verify, then rebuild when a drift exists.
   - `bindItemRefresh` is `bindReceivableRefresh` under its new name.
2. `server/receivable_items.go`: delete what moved; keep the constants and the three SQL constants untouched; `receivableOpen = openItemDay`; add
   ```go
   var receivableItems = openItemsTable{
       Collection: receivableItemsCollection, Party: "customer", Columns: receivableColumns,
       Queries: receivableQueries, Open: receivableOpen, Noun: "receivable", ReadOnly: msgReceivableItemsReadOnly,
   }
   ```
   `receivableSettledSQL` and `settleReceivablesSQL` are deleted (the engine holds the text). The comment above `receivableCreditApplicationsSQL` names `insertReceivables`: change that word of the comment to `receivableItems.insert`; the constant's text stays. `server/receivable_refresh.go`: `refreshReceivables(tx, …)` calls become `receivableItems.refresh(tx, …)` with `itemPart`; the five `bindReceivable…Refresh` functions keep their names and call `bindItemRefresh`; `registerReceivableWriteGuard` and `repairReceivables` are deleted.
3. `server/balances.go`, four edits and no other line: `receivableDriftReport(drifts []ReceivableDrift)` becomes `itemDriftReport(drifts []ItemDrift)` with `maxItemDriftsReported` (its comment says "the stored open-item part"); its call near line 327 becomes `itemDriftReport(receivableDrifts)`; `return repairReceivables(tx)` becomes `return receivableItems.repair(tx)`; `verifyReceivables(re.App)` becomes `receivableItems.verify(re.App)`. The answer keys `receivableDrifts` and `receivableDriftCount` stay. `server/ledger.go`: `registerReceivableWriteGuard(app)` becomes `receivableItems.registerWriteGuard(app)`.
4. `server/report_spec_helpers.go`, after `agingColumns`:
   ```go
   // itemKindLabel is the label of an item's kind (min(item_kind): every row of
   // an item has the one kind), from the item_kind options of source; the last
   // option (Journal entry) is the fallback.
   func itemKindLabel(source reports.Source) *reports.Node

   // agingItemGroup is the open-item level of an aging report: labelled
   // "<type> <number>" and shown only when its amount on the day is not zero.
   func agingItemGroup(net, kindLabel *reports.Node) reports.Group {
       return reports.Group{
           ID: "byItem", Col: "itemKey",
           Label:  op("concat", kindLabel, lit(" "), op("min", fld("item_number"))),
           Having: op("ne", op("sum", net), lit(0)),
       }
   }

   // agingParams are As of (Today by default), the party param and Order (Name
   // by default).
   func agingParams(party reports.ParamDef) []reports.ParamDef

   // agingAge is a row's age on the As of day: the days from its item's due
   // date to the day (core diffDays(a, b) is b − a).
   func agingAge() *reports.Node { return op("diffDays", fld("due_date"), prm("asOf")) }

   // agingDetailLabel labels an opened line "<date> · <type> <number>".
   func agingDetailLabel() *reports.Node
   ```
   `itemKindLabel` has the body of `arItemKindLabel` with `source.Fields` and the panic text `"books: " + source.Key + " has no item_kind options"`. `agingParams` has the body of `arParams` with `party` in place of `customersParam()`. `agingDisplay` has the body and the comment of `arDisplay` (the comment names both fixtures). `agingDetailLabel` has the body of `arDetailLabel`.
5. `server/report_ar_aging.go`: `arParams()` returns `agingParams(customersParam())`; `arGroups()` appends `agingItemGroup(arNet(), itemKindLabel(receivableItemsSource()))`; `arAge()` returns `agingAge()`; `arDetailLabel()` returns `agingDetailLabel()`; `arDisplay()` returns `agingDisplay()`; `arItemKindLabel` is deleted. Title, description, key, Revision and every other node stay.
6. Rename the calls in the test files of the Files block by D4 (`requireNoDrift` in `server/env_test.go` too). Change no assertion.
7. Gate 1. Then `cd server && go test -run 'TestReceivableStatementsKeepTheirText|TestARAgingSpecKeepsItsJSON|TestARAging|TestReceivable|TestRebuildRoute' -count=1 .` and say its result in the report. `git diff --stat` must show no change under `server/testdata/ar_aging_spec.json` and `server/testdata/ar_aging_stat1.json`.

### Checkpoint 2 — Payable items table and source

**Delivers:** the stored collection `books_payable_items`, kept right by every write that changes a payable (refresh in the write's transaction), with verify and rebuild on the rebuild route, the report source `books.payable_items`, and the seeded A/P rows.

**Files:**
- Create: `pb-migrations/2100000029_create_books_payable_items.js`
- Create: `server/payable_items.go` · `server/payable_refresh.go`
- Modify: `server/receivable_refresh.go` (`bindReceivableEntryRefresh` becomes `bindOpenItemEntryRefresh` and refreshes both tables)
- Modify: `server/ledger.go` (`bindOpenItemEntryRefresh(app)`; `payableItems.registerWriteGuard(app)`)
- Modify: `server/sales_documents.go` (two cases in the switch of `registerSalesDocGuards`: the bill and the vendor credit)
- Modify: `server/bill_payments.go` (`bindPayablePaymentRefresh(app)` at the end of `registerBillPaymentGuards`)
- Modify: `server/vendor_refunds.go` (`bindPayableRefundRefresh(app)` at the end of `registerVendorRefundGuards`)
- Modify: `server/vendor_credit_applications.go` (`AfterChange: refreshPayableVendorCredit` on the kind; `bindPayableApplicationRefresh(app)` in `registerVendorCreditApplications`)
- Modify: `server/balances.go` (additive: the payable verify before the rebuild, `payableItems.repair(tx)`, the answer keys `payableDrifts` and `payableDriftCount`)
- Modify: `server/report_sources.go` (additive: `payableItemsSource()` and its entry in the source list)
- Modify: `server/oauth_scopes.go` (`"books_payable_items": ro`)
- Modify: `server/env_test.go` (`requireNoDrift` also runs `payableItems.verify`)
- Modify: `server/registrations_test.go` (the collection map near line 38 gains `"books_payable_items": true`)
- Modify: `server/report_sources_test.go` (additive: the key list near line 58, the source case near line 524, the catalog list near line 652)
- Modify: `server/oauth_scopes_test.go` (new `TestOAuth_PayableItems`)
- Modify: `tests/migration-prefixes.test.ts` (the header comment; a test for the payable items file; `2100000029` in the "holds" test and its title)
- Modify: `tinycld/books/lib/ap-aging-fixture.ts` (`AP_AGING_SEED` by D2; `ApAgingSeedPayment` loses `billMemo`; the seed rows keep `satisfies`)
- Modify: `tinycld/books/seed.ts` (new exported `seedApAging`, called after `seedApplyCredit`)
- Modify: `tests/seed-node.test.ts` (new `describe('seedApAging')`; the seed-order test)
- Test: `server/payable_items_test.go` · `server/payable_refresh_test.go` · `server/payable_stored_test.go`

**Interfaces:**
- Consumes: `openItemsTable`, `itemPart`, `itemPair`, `ItemDrift`, `openItemDay`, `bindItemRefresh`, `itemDriftReport`, `receivableItems` (checkpoint 1); `refreshReceivableEntry` (`server/receivable_refresh.go`); `billKind`, `vendorCreditKind` (`server/bills.go`, `server/vendor_credits.go`); `billPaymentsCollection`, `billPaymentLinesCollection`, `registerBillPaymentGuards` (`server/bill_payments.go`); `vendorRefundsCollection`, `vendorRefundLinesCollection`, `registerVendorRefundGuards` (`server/vendor_refunds.go`); `vendorCreditsCollection`, `vendorCreditApplicationsCollection`, `vendorCreditApplicationKind`, `registerVendorCreditApplications` (`server/vendor_credits.go`, `server/vendor_credit_applications.go`); `applicationKind` with its `AfterChange` field (`server/credit_applications.go`); `registerSalesDocGuards` (`server/sales_documents.go`); `receivableItemsSource` (`server/report_sources.go`, the model); `statusDraft`; `newLedgerEnv`, `requireNoDrift`, `readerInfo`; `postSeedDocument`, `seededAccountId`, `seedApplyCredit`, `seedBankMatch`, `SeedContext` (`tinycld/books/seed.ts`); `AP_AGING_SEED`, `VENDORS`
- Produces:
  - Go constants `payableItemsCollection = "books_payable_items"`, `payableSourceLine = "line"`, `payableSourcePaymentLine = "payment_line"`, `payableSourceRefundLine = "refund_line"`, `payableSourceApplicationBill = "application_bill"`, `payableSourceApplicationCredit = "application_credit"`, `payableColumns`, `payableLinesSQL`, `payablePaymentLinesSQL`, `payableRefundLinesSQL`, `payableApplicationsSQL`, `payableQueries`, `msgPayableItemsReadOnly`
  - `var payableItems openItemsTable`
  - `func refreshPayableEntry(tx core.App, entryID string) error` · `func refreshPayableBill(tx core.App, bill *core.Record) error` · `func refreshPayablePayment(tx core.App, payment *core.Record) error` · `func refreshPayableVendorCredit(tx core.App, credit *core.Record) error` · `func refreshPayableRefund(tx core.App, refund *core.Record) error`
  - `func bindOpenItemEntryRefresh(app core.App)` · `func bindPayableBillRefresh(app core.App)` · `func bindPayableVendorCreditRefresh(app core.App)` · `func bindPayablePaymentRefresh(app core.App)` · `func bindPayableRefundRefresh(app core.App)` · `func bindPayableApplicationRefresh(app core.App)`
  - `func payableItemsSource() reports.Source` (key `books.payable_items`)
  - the rebuild route's keys `payableDrifts`, `payableDriftCount`
  - Go test helpers in `server/payable_items_test.go` that checkpoints 3 and 4 use: `type apBook struct` (the env, the reader, the Accounts payable account, an expense account, the bank account), `newAPBook(t)`, `apVendor(t, b, name)`, `apBill(t, b, vendor, date, dueDate, cents)`, `apPayBills(t, b, vendor, date, map[billID]cents)`, `apVendorCredit(t, b, vendor, date, cents)`, `apApply(t, b, credit, bill, date, cents)`, `apRefund(t, b, vendor, date, map[creditID]cents)`, `apJournal(t, b, date, vendor, debitCents, creditCents)`, `apRows(t, app, source)`, `requireNoPayableDrift(t, app)`
  - TS `seedApAging(pb, ctx, accountIds): Promise<void>`

**Gates:** 1 · 3 (nothing renders). Gate 1's e2e, because the seeded book changes: ONE command with `books/tests/e2e/vendor-form-list.spec.ts books/tests/e2e/pay-bills-read.spec.ts books/tests/e2e/purchase-lists-tabs.spec.ts books/tests/e2e/vendor-pages-balance.spec.ts books/tests/e2e/account-register-table.spec.ts books/tests/e2e/bank-match.spec.ts books/tests/e2e/trial-balance.spec.ts books/tests/e2e/balance-sheet.spec.ts books/tests/e2e/books-ar-aging.spec.ts books/tests/e2e/attachments.spec.ts` (the last one searches "Bill 1003" by its title, and the seed gains a bill); hand back `NEEDS-RUN` with that command when it needs more than about 4 minutes.

**Spec:**
- "**Live.** A post or a void of a bill, a bill payment, a vendor credit, a vendor refund or a journal entry, a correction of one of them, a vendor credit applied to a bill or removed from it, a vendor rename, or a Books settings change re-runs an open report. The run's topics are `collection/books_payable_items`, `collection/books_vendors` and `collection/books_settings`. Books refreshes the stored payable rows inside the transaction of each write that changes one and touches the table's change signal there (core `changesignal.Touch`), so the signal fires after the commit and never for a write that is rolled back." (this checkpoint: the refresh and the touch; checkpoint 3: the topics and the open report)
- "**The figures tie.** A vendor's Total for today is the Open balance of its vendor page (`books_party_balances`). The report's Total is the Accounts payable figure of the Balance Sheet for the day. This holds because every row comes from a posted Accounts payable line or is a part of one: the lines of a bill payment add up to the Accounts payable debits of its entry, the lines of a vendor refund add up to the Accounts payable credits of its entry, and the two rows of a vendor credit application add up to zero." (this checkpoint: the stored rows; checkpoint 3: the report's figures)
- §4.1 (the table, its five sources, `settled`, the four indexes), §4.2 (refresh hook points 1 to 6, rebuild, verify) and §4.3 (the source), as the spec gives them. Seed: spec §4.5 Seed, with the rows of D2.

**Tests it must add:**
- `server/payable_items_test.go`:
  - `TestPayableItemsShape`: the collection is a base collection with the Books read rule on list and view and nil create, update and delete rules; the `source` select has exactly the five values; the four indexes exist by their columns `(entry)`, `(item)`, `(vendor, item, date)`, `(settled, date)`. Fails when a rule, a value or an index is missing.
  - `TestPayableLinesBill`: after `apBill` (due 30 days after its date) one stored row: `source` line, `id` the entry's Accounts payable line, `vendor`, `credit` the total, `debit` 0, `item` the bill id, `item_kind` "bill", `item_number` and `item_seq` the entry's, `due_date` the bill's due date, `settled` `openItemDay`.
  - `TestPayableLinesPayment`: one payment of two bills (`apPayBills`) stores no `line` row for the payment's entry and two `payment_line` rows: `id` the payment line's id, `entry` the payment's entry, `date` the payment's date, `debit` the line's amount, `item` each bill, number, sequence and due date the bill's; the two debits add up to the Accounts payable debit of the payment's entry. A bill paid in full has `settled` equal to the payment's date on all its rows; the part-paid bill stays open.
  - `TestPayableLinesVendorCredit`: a credit stores one `line` row, a debit, `item` the credit, `item_kind` "vendor_credit", `due_date` the credit's date. After `apApply`: two more rows, `application_bill` (`id` the application's id, `debit` the amount, `item` the bill, `entry` the credit's entry, `date` the apply date) and `application_credit` (`id` the application's id + "c", 16 characters, `credit` the amount, `item` the credit, `entry` the bill's entry); the two add up to zero. After the application's delete both rows are gone and each `settled` is computed again.
  - `TestPayableLinesRefund`: a refund of part of a credit stores no `line` row for the refund's entry and one `refund_line` row: `credit` the line's amount, `item` the credit, `due_date` the credit's date, `entry` the refund's entry. A credit used up by an application and a refund has `settled` on the later of the two days.
  - `TestPayableLinesJournal`: a manual Accounts payable line with a vendor and one with none are each one item (`item` the line's id, `item_kind` "entry", `due_date` the entry's date, `vendor` "" for the second); the reversal of the entry gives each line a second row with the same `item` (the reversed line at the same position) and both items settle on the reversal's day.
  - `TestPayableLinesVoids`: a void bill (its line and its reversal's line are one item that adds to zero and is settled); a void bill payment (its `payment_line` rows are gone, the bill is open again with `settled` `openItemDay`); a void vendor credit; a void vendor refund (its `refund_line` row is gone, the credit open again).
  - `TestPayableCorrections`: a corrected bill that has a payment line and an application (the rows of both now have `item` the correction's id, its number, sequence and due date; no row names the original except its own line and its reversal, which add to zero); a corrected bill payment (rows of the original gone, rows of the replacement stored); a corrected vendor credit that has an application and a refund line (both moved to the correction's id). Each case ends with `requireNoPayableDrift` with no rebuild. Fails when a moved line keeps a row of the old item.
  - `TestPayableItemsTieToPartyBalances`: on a book with every kind of document above, for each vendor the sum of `credit - debit` of its stored rows equals `books_party_balances` for that vendor, and the sum over all rows equals the credit balance of the Accounts payable account in `books_account_balances`.
  - `TestPayableItemsAccess`: a reader with Books access lists rows through the records API; a user without Books access gets none; `GET` of the 16-character `application_credit` id answers 200 with the row. Fails when the rule or the id is refused.
  - `TestPayableItemsEngine`: a `reports.Run` of a small spec over `books.payable_items` (sum of `credit` less `debit` by the `vendor` link, and the `entry.number` of a row) passes `reports.CheckSources` and gives the bill's figure: the source's two links are accepted by `relationCheck`.
- `server/payable_refresh_test.go`:
  - `TestPayableRefreshOnEachWrite`: after each of post bill, post payment, void payment, post credit, apply, remove the application, post refund, void refund, post journal entry, the stored rows equal what `payableItems.Queries` give (`requireNoPayableDrift`), with no rebuild between the writes.
  - `TestPayableRefreshRollsBackWithItsWrite`: a bill post that fails after the entry is written (a transaction that returns an error after `apBill`'s writes) leaves no stored row.
  - `TestPayableRefreshNeedsTransaction`: `refreshPayableEntry(app, id)` outside a transaction returns the error "books: payable rows are refreshed only inside the transaction of the write".
  - `TestPayableItemsRefuseWrites`: a REST create, update and delete of a `books_payable_items` row by a superuser are each refused with `msgPayableItemsReadOnly`.
  - `TestPayableRefreshSettlesOnlyTouchedItems`: after a payment of one bill, the `updated`-free check: only the rows of that vendor and bill changed `settled` (compare a snapshot of every other row before and after).
  - `TestEntryRefreshKeepsBothTables`: one journal entry with an Accounts receivable line and an Accounts payable line stores one row in each table after its post.
  - `TestRebuildRoute_RepairsPayables`: after a raw delete of a stored row, a raw insert of a stray row and a raw change of one `settled`, `POST /api/books/balances/rebuild` by a Books admin answers `payableDriftCount` 3 with three `payableDrifts` (problems "missing", "stale", "settled"), keeps `receivableDrifts` and `receivableDriftCount` in the answer, and `payableItems.verify` is empty after it. Fails when the route does not report or repair the payable table.
- `server/payable_stored_test.go`:
  - `TestPayableSettled`: `settled` for a part-paid bill (`openItemDay`), a bill paid in two parts (the second payment's day), a bill settled by a payment on its own day (that day), and a bill opened again by a void payment (`openItemDay`).
  - `TestVerifyPayablesFindsDrift`: each of the three problems alone, with the row's `ID`, `Entry` and `Item`.
  - `TestPayableDriftReport_IsCapped`: with 101 drifted rows `itemDriftReport` lists 100 and counts 101.
- `server/oauth_scopes_test.go`, `TestOAuth_PayableItems`: as `TestOAuth_ReceivableItems` reads `books_receivable_items`: a token with the Books read scope lists `books_payable_items`, and a write is refused.
- `server/report_sources_test.go`: the source case for `books.payable_items` (collection, label "Payable items", its fields with their types and aggregates, its two links), and the key in the catalog list. `server/registrations_test.go`: the collection map entry. `TestRegister_BindsEachPartOnce` gains no line: every new bind is inside a part it already binds one time (`registerLedger`, `registerSalesDocGuards`, `registerBillPaymentGuards`, `registerVendorCreditApplications`, `registerVendorRefundGuards`); it fails when a bind is added outside them or twice.
- `tests/migration-prefixes.test.ts`: new test "runs the payable items after the bills, the bill payments, the vendor credits and the vendor refunds, and before the audit log view" (the one file that ends `_create_books_payable_items.js` has a number above those four files' and below `AUDIT`'s); the "holds" test also requires that the files with prefix `2100000029` are exactly `['2100000029_create_books_payable_items.js']`, and its title names it; `AFTER_AUDIT` stays `[]`.
- `tests/seed-node.test.ts`, `describe('seedApAging')`, as `describe('seedArAging')` is written: the seed body calls `seedApAging(` after `seedApplyCredit(` and before `seedBankMatch(`; with the fake PocketBase client, `seedApAging` creates one bill with `AP_AGING_SEED.bill`'s vendor, date, due date, ref and memo and one account line of 86000 on account 6200; one bill payment batch with one line of 13725 on that bill, dated 2026-11-04, method check, reference 1061, paid from account 1000; one vendor credit with `AP_AGING_SEED.credit`'s rows; one `books_vendor_credit_applications` create of 12000 dated 2026-10-20 that names the created credit and the created bill; and it throws when the vendor is not in `VENDORS`.

**Do:**
0. Test writer: the tests above. Red for: `payableItems`, the `refreshPayable…` functions and `payableItemsSource` do not exist (Go compile error; the report names the symbols); the migration file does not exist (vitest); `seedApAging` is not exported (vitest). The Go helpers of `server/payable_items_test.go` post through the same code the REST routes run: read `server/bill_payments_test.go`, `server/vendor_credits_test.go`, `server/vendor_refunds_test.go` and `server/receivable_items_test.go` (`newARBook`, `arInvoice`, `arPayment`) first and call the helpers those files already have.
1. Migration `pb-migrations/2100000029_create_books_payable_items.js`, with `pb-migrations/2100000028_create_books_receivable_items.js` as the model (the same READ rule constant, `listRule` and `viewRule` READ, `createRule`, `updateRule`, `deleteRule` null): base collection `books_payable_items`, id `pbc_books_payable_items`; fields `source` (select, required, one of `line`, `payment_line`, `refund_line`, `application_bill`, `application_credit`), `vendor` (relation to `books_vendors`, not required), `entry` (relation to `books_journal_entries`, required), `date` (text day), `currency` (text), `debit` and `credit` (number, integer), `item` (text), `item_kind` (text), `item_number` (text), `item_seq` (number, integer), `due_date` (text day), `settled` (text day); the id field is the default one, as in the receivable migration (Books writes the rows with raw SQL, which runs no field validation, and `TestPayableItemsAccess` reads the 16-character `application_credit` id through REST; only when that test shows a refusal by the id's length does the id field get `min: 15, max: 16`); indexes `idx_books_payable_items_entry (entry)`, `idx_books_payable_items_item (item)`, `idx_books_payable_items_vendor_item_date (vendor, item, date)`, `idx_books_payable_items_settled_date (settled, date)`. The down migration deletes the collection. It adds no index on `books_accounts` (the receivable migration made `idx_books_accounts_type`).
2. `server/payable_items.go`:
   ```go
   const (
       payableItemsCollection         = "books_payable_items"
       payableSourceLine              = "line"
       payableSourcePaymentLine       = "payment_line"
       payableSourceRefundLine        = "refund_line"
       payableSourceApplicationBill   = "application_bill"
       payableSourceApplicationCredit = "application_credit"
   )

   const payableColumns = "id, source, vendor, entry, date, currency, debit, credit, item, item_kind, item_number, item_seq, due_date"

   const (
       payableIsDoc = "COALESCE(e.doc_type, '') IN ('bill', 'vendor_credit') AND COALESCE(NULLIF(e.document, ''), NULLIF(r.document, '')) IS NOT NULL"
       payableDocID = "COALESCE(NULLIF(e.document, ''), r.document)"
       payableLineItem = "CASE WHEN " + payableIsDoc + " THEN " + payableDocID +
           " WHEN e.reverses != '' THEN COALESCE((SELECT rl.id FROM books_journal_lines rl WHERE rl.entry = e.reverses AND rl.position = l.position), l.id) ELSE l.id END"
   )

   // Ends in its WHERE, so a refresh adds " AND l.entry = {:entry}".
   const payableLinesSQL = "SELECT l.id AS id, '" + payableSourceLine + "' AS source, l.vendor AS vendor, l.entry AS entry, l.date AS date, l.currency AS currency, l.debit AS debit, l.credit AS credit, " +
       "CAST(" + payableLineItem + " AS TEXT) AS item, " +
       "CAST(CASE WHEN " + payableIsDoc + " THEN e.doc_type ELSE 'entry' END AS TEXT) AS item_kind, " +
       "CAST(COALESCE(r.number, e.number) AS TEXT) AS item_number, " +
       "CAST(COALESCE(r.sequence, e.sequence) AS INTEGER) AS item_seq, " +
       "CAST(CASE WHEN " + payableIsDoc + " AND e.doc_type = 'bill' THEN b.due_date ELSE COALESCE(r.date, e.date) END AS TEXT) AS due_date " +
       "FROM books_journal_lines l " +
       "JOIN books_accounts a ON a.id = l.account " +
       "JOIN books_journal_entries e ON e.id = l.entry " +
       "LEFT JOIN books_journal_entries r ON r.id = e.reverses " +
       "LEFT JOIN books_bills b ON e.doc_type = 'bill' AND b.id = " + payableDocID + " " +
       "WHERE l.posted = TRUE AND a.type = 'accounts_payable' AND COALESCE(e.doc_type, '') NOT IN ('bill_payment', 'vendor_refund')"

   // Ends in its WHERE: " AND bpl.payment = {:payment}", " AND bpl.bill = {:bill}" or " AND bpl.id = {:line}".
   const payablePaymentLinesSQL = "SELECT bpl.id AS id, '" + payableSourcePaymentLine + "' AS source, bp.vendor AS vendor, bp.entry AS entry, bp.date AS date, bp.currency AS currency, " +
       "bpl.amount AS debit, CAST(0 AS INTEGER) AS credit, CAST(bpl.bill AS TEXT) AS item, CAST('bill' AS TEXT) AS item_kind, " +
       "CAST(be.number AS TEXT) AS item_number, CAST(be.sequence AS INTEGER) AS item_seq, b.due_date AS due_date " +
       "FROM books_bill_payment_lines bpl JOIN books_bill_payments bp ON bp.id = bpl.payment " +
       "JOIN books_bills b ON b.id = bpl.bill JOIN books_journal_entries be ON be.id = b.entry " +
       "WHERE bp.status = 'posted' AND bp.entry != ''"

   // Ends in its WHERE: " AND rl.refund = {:refund}", " AND rl.vendor_credit = {:credit}" or " AND rl.id = {:line}".
   const payableRefundLinesSQL = "SELECT rl.id AS id, '" + payableSourceRefundLine + "' AS source, vr.vendor AS vendor, vr.entry AS entry, vr.date AS date, vr.currency AS currency, " +
       "CAST(0 AS INTEGER) AS debit, rl.amount AS credit, CAST(rl.vendor_credit AS TEXT) AS item, CAST('vendor_credit' AS TEXT) AS item_kind, " +
       "CAST(ce.number AS TEXT) AS item_number, CAST(ce.sequence AS INTEGER) AS item_seq, CAST(vc.date AS TEXT) AS due_date " +
       "FROM books_vendor_refund_lines rl JOIN books_vendor_refunds vr ON vr.id = rl.refund " +
       "JOIN books_vendor_credits vc ON vc.id = rl.vendor_credit JOIN books_journal_entries ce ON ce.id = vc.entry " +
       "WHERE vr.status = 'posted' AND vr.entry != ''"

   // Two rows per application, wrapped, so a refresh adds a condition on its
   // own columns: " AND pa.vendor_credit = {:credit}", " AND pa.bill = {:bill}"
   // or " AND pa.application = {:application}". The three extra columns are
   // not stored (insert selects payableColumns).
   const payableApplicationsSQL = "SELECT * FROM (" +
       "SELECT ca.id AS id, '" + payableSourceApplicationBill + "' AS source, vc.vendor AS vendor, vc.entry AS entry, ca.date AS date, vc.currency AS currency, " +
       "ca.amount AS debit, CAST(0 AS INTEGER) AS credit, CAST(ca.bill AS TEXT) AS item, CAST('bill' AS TEXT) AS item_kind, " +
       "CAST(be.number AS TEXT) AS item_number, CAST(be.sequence AS INTEGER) AS item_seq, CAST(b.due_date AS TEXT) AS due_date, " +
       "ca.id AS application, ca.bill AS bill, ca.vendor_credit AS vendor_credit " +
       "FROM " + vendorCreditApplicationsCollection + " ca JOIN books_vendor_credits vc ON vc.id = ca.vendor_credit JOIN books_journal_entries ce ON ce.id = vc.entry " +
       "JOIN books_bills b ON b.id = ca.bill JOIN books_journal_entries be ON be.id = b.entry WHERE vc.status = 'posted' " +
       "UNION ALL " +
       "SELECT ca.id || 'c' AS id, '" + payableSourceApplicationCredit + "' AS source, vc.vendor, b.entry, ca.date, vc.currency, " +
       "CAST(0 AS INTEGER) AS debit, ca.amount AS credit, CAST(ca.vendor_credit AS TEXT), CAST('vendor_credit' AS TEXT), " +
       "CAST(ce.number AS TEXT), CAST(ce.sequence AS INTEGER), CAST(vc.date AS TEXT), " +
       "ca.id, ca.bill, ca.vendor_credit " +
       "FROM " + vendorCreditApplicationsCollection + " ca JOIN books_vendor_credits vc ON vc.id = ca.vendor_credit JOIN books_journal_entries ce ON ce.id = vc.entry " +
       "JOIN books_bills b ON b.id = ca.bill JOIN books_journal_entries be ON be.id = b.entry WHERE vc.status = 'posted'" +
       ") pa WHERE TRUE"

   var payableQueries = []string{payableLinesSQL, payablePaymentLinesSQL, payableRefundLinesSQL, payableApplicationsSQL}

   const msgPayableItemsReadOnly = "Books writes the payable items itself. They cannot be changed."

   var payableItems = openItemsTable{
       Collection: payableItemsCollection, Party: "vendor", Columns: payableColumns,
       Queries: payableQueries, Open: openItemDay, Noun: "payable", ReadOnly: msgPayableItemsReadOnly,
   }
   ```
   Each constant gets a comment that says what one row is (spec §4.1). Both halves of the application query join both entries, so an application has its two rows or none.
3. `server/payable_refresh.go`. Every function runs `payableItems.refresh(tx, stale, params, parts...)`; `stale` matches every row its parts can give:
   - `refreshPayableEntry(tx, entryID)`: stale `entry = {:entry} AND source = 'line'`; part `payableLinesSQL` + ` AND l.entry = {:entry}`.
   - `refreshPayableBill(tx, bill)`: when the bill has an entry, `refreshPayableEntry` of it first. Then stale `(item = {:bill} AND source IN ('payment_line', 'application_bill')) OR (source = 'application_credit' AND entry = {:entry})` with params `bill` and `entry` (the bill's entry; the second term is left out when the entry is blank); parts `payablePaymentLinesSQL` + ` AND bpl.bill = {:bill}` and `payableApplicationsSQL` + ` AND pa.bill = {:bill}`.
   - `refreshPayablePayment(tx, payment)`: nothing when the payment has no entry. Stale `entry = {:entry} AND source = 'payment_line'`; part `payablePaymentLinesSQL` + ` AND bpl.payment = {:payment}`.
   - `refreshPayableVendorCredit(tx, credit)`: nothing when the credit has no entry. Stale `(entry = {:entry} AND source IN ('line', 'application_bill')) OR (item = {:credit} AND source IN ('application_credit', 'refund_line'))`; parts `payableLinesSQL` + ` AND l.entry = {:entry}`, `payableApplicationsSQL` + ` AND pa.vendor_credit = {:credit}`, `payableRefundLinesSQL` + ` AND rl.vendor_credit = {:credit}`.
   - `refreshPayableRefund(tx, refund)`: nothing when the refund has no entry. Stale `entry = {:entry} AND source = 'refund_line'`; part `payableRefundLinesSQL` + ` AND rl.refund = {:refund}`.
   - The binds, each with `bindItemRefresh` (after the collection's serialized guard, so `e.App` is the guard's transaction):
     - `bindPayableBillRefresh(app)`: `billKind.Collection`, skips a draft, calls `refreshPayableBill`.
     - `bindPayableVendorCreditRefresh(app)`: `vendorCreditKind.Collection`, skips a draft, calls `refreshPayableVendorCredit`.
     - `bindPayablePaymentRefresh(app)`: `billPaymentsCollection` → `refreshPayablePayment`; and `billPaymentLinesCollection` → the rows of that one line: stale `id = {:line}`, part `payablePaymentLinesSQL` + ` AND bpl.id = {:line}`.
     - `bindPayableRefundRefresh(app)`: `vendorRefundsCollection` → `refreshPayableRefund`; and `vendorRefundLinesCollection` → stale `id = {:line}`, part `payableRefundLinesSQL` + ` AND rl.id = {:line}`.
     - `bindPayableApplicationRefresh(app)`: `vendorCreditApplicationsCollection` → stale `id IN ({:application}, {:credit_row})` with `credit_row` the id + "c", part `payableApplicationsSQL` + ` AND pa.application = {:application}`.
4. Hook the binds: `server/receivable_refresh.go`: rename `bindReceivableEntryRefresh` to `bindOpenItemEntryRefresh`; after `refreshReceivableEntry(tx, r.Id)` succeeds it returns `refreshPayableEntry(tx, r.Id)` (one hook for both tables, spec §4.2 hook point 1; its comment says so). `server/ledger.go`: the call's new name, and `payableItems.registerWriteGuard(app)` after the receivable guard. `server/sales_documents.go`, the switch of `registerSalesDocGuards`: `case billKind.Collection: bindPayableBillRefresh(app)` and `case vendorCreditKind.Collection: bindPayableVendorCreditRefresh(app)`. `server/bill_payments.go`: `bindPayablePaymentRefresh(app)` as the last line of `registerBillPaymentGuards`. `server/vendor_refunds.go`: `bindPayableRefundRefresh(app)` as the last line of `registerVendorRefundGuards`. `server/vendor_credit_applications.go`: `AfterChange: refreshPayableVendorCredit` in `vendorCreditApplicationKind` (the field of `applicationKind` that `creditMemoApplicationKind` uses in `server/credit_memo_applications.go`; it runs after the balances change on create and on delete), and `bindPayableApplicationRefresh(app)` after `registerCreditApplications(app, vendorCreditApplicationKind)`.
5. `server/balances.go`, additive: in `rebuildBalances` the last statement becomes
   ```go
   if err := receivableItems.repair(tx); err != nil {
       return err
   }
   return payableItems.repair(tx)
   ```
   In `bindBalanceRoutes`, after the receivable verify block, the same block for `payableItems.verify(re.App)` (log text "payable rows disagree with the book"); `payableListed, payableCount := itemDriftReport(payableDrifts)`; the answer gains `"payableDrifts": payableListed, "payableDriftCount": payableCount`. The comments of `rebuildBalances` and of the route name the payable rows.
6. `server/report_sources.go`, additive: `payableItemsSource()` after `receivableItemsSource()`, with that function as the model: key `books.payable_items`, collection `payableItemsCollection`, label "Payable items"; fields `date` and `due_date` (`Date`, `TextDay`, `MinMax`), `debit` and `credit` (`Money`, `SumAll`, `Currency: "currency"`), `currency`, `item` (`Text`), `item_kind` (`Select`, options in this order: `bill` "Bill", `vendor_credit` "Vendor credit", `entry` "Journal entry"), `item_number` (`Text`, `MinMax`), `item_seq` (`Number`, `MinMax`), `settled` (`Text`); links `vendor` → `books.vendors` and `entry` → `books.journal_entries`, both to-one. Add `payableItemsSource()` to the source list beside `receivableItemsSource()`; the loop there sets `FiscalStartMonth`, `Heading`, `Watch` and `Currency`. `books.vendors` gains no link. `server/oauth_scopes.go`: `"books_payable_items": ro` beside the receivable entry.
7. `server/env_test.go`: `requireNoDrift` also fails on `payableItems.verify(app)` ("payable rows drifted from the book"). Run `cd server && go test ./...`: every posting test of the package now checks the payable rows. A failure here is a refresh that a write path misses (D6): find the last write of that flow and refresh there.
8. Fixture `tinycld/books/lib/ap-aging-fixture.ts`, the seed block only: `AP_AGING_SEED.bill.memo` "Seed A/P aging: storage, August"; `ApAgingSeedPayment` loses `billMemo` and `AP_AGING_SEED.partPayment` becomes `{ id: 'apagingpay00001', lineId: 'apagingpayln001', date: '2026-11-04', payment_method: 'check', reference_no: '1061', paidFromNumber: '1000', cents: 13725 }` (fixed 15-character ids, as the rows of `BILL_PAYMENT_SEED` have; `ApAgingSeedPayment` gains `id` and `lineId`); `AP_AGING_SEED.credit.memo` "Seed A/P aging: storage overcharge credit"; the comment above says the part payment pays `AP_AGING_SEED.bill` and why (D2). The rows keep `satisfies`. The static run results of the fixture do not change.
9. Seed. The readers of the seeded purchases were swept in the plan review (2026-11-20: Pay bills, purchase lists, vendor pages, registers, reports, bank match, 1099, the journal list, the unit tests, the next document numbers): no test reads a figure that the three rows of D2 change. The e2e of the Gates line is the check; a spec of that run that fails on a seeded figure is updated and named in the report. Then `tinycld/books/seed.ts`: `export async function seedApAging(pb, ctx, accountIds)`, called after `seedApplyCredit` with a comment that names D2's reason for its place. It writes, in this order: the bill as `seedVendorCreditApplications` writes `VENDOR_CREDIT_SEED_BILL` (the draft with the vendor's `terms` and `address`, one `books_bill_lines` account line, `postSeedDocument`); the part payment as `seedBillPayments` writes one payment (the same batch: the payment with status posted and its one line on the created bill); the vendor credit as `seedVendorCredits` writes one (the draft, one `books_vendor_credit_lines` account line, `postSeedDocument`); the application as `seedVendorCreditApplications` creates one (`vendor_credit`, `bill`, `amount`, `date`, `applied_by: ctx.user.id`; no fixed id). It throws `seed: A/P aging vendor <id> is not in VENDORS` when the vendor is missing.
10. Gate 1 with the e2e of the Gates line.

### Checkpoint 3 — A/P Aging report for readers

**Delivers:** the shipped report `books.ap_aging`, shared with every Books reader and listed in the Books Reports hub: vendors with their open items by age on the As of day, each vendor opening into its items, each item into its lines, each line into its document.

**Files:**
- Create: `server/report_ap_aging.go`
- Modify: `server/report_spec_helpers.go` (new `vendorsParam`, `vendorGroup`, `vendorSort`)
- Modify: `server/register.go` (`reports.RegisterShipped(apAgingShipped())` after the A/R Aging's line)
- Create: `server/testdata/ap_aging_spec.json`
- Create: `tests/e2e/ap-aging-helpers.ts`
- Modify: each Go and vitest test that counts or lists the shipped Books reports (step 5's grep; the report lists each)
- Test: `server/report_ap_aging_test.go` · `tests/ap-aging-fixture.test.ts` · `tests/e2e/books-ap-aging.spec.ts`

**Interfaces:**
- Consumes: `payableItemsSource`, `payableItems`, `apBook`, `newAPBook`, `apVendor`, `apBill`, `apPayBills`, `apVendorCredit`, `apApply`, `apRefund`, `apJournal`, `requireNoPayableDrift` (checkpoint 2); `itemKindLabel`, `agingDisplay`, `agingItemGroup`, `agingParams`, `agingAge`, `agingDetailLabel` (checkpoint 1); `agingColumns`, `entryOpenPath`, `mustJSON`, `op`, `fld`, `link`, `lit`, `prm`, `col`, `rec`, `path` (`server/report_spec_helpers.go`); `arAgingShipped` (the model, `server/report_ar_aging.go`); `readerInfo`, `agedCell`, `requireAgesAddUp`, `dueOf` (`server/report_ar_aging_test.go`, `server/env_test.go`); `AP_AGING_TITLE`, `AP_AGING_DESCRIPTION`, `AP_AGING_PARAMS`, `AP_AGING_DISPLAY`, `AP_AGING_EMPTY_DAY`; e2e: `openAgingRow`, `agingRow`, `agedCents` (`tests/e2e/ar-aging-helpers.ts`); `openBooksReports`, `snapshotWhen`, `reportSnapshot`, `chooseAsOf`, `dayWords`, `expectTableFits` (`tests/e2e/books-report-helpers.ts`); `chooseBalanceOrder` (`tests/e2e/customer-balance-helpers.ts`); `vendorWithBills`, `openPayBills`, `filterToVendor`, `payBillsRowAmount`, `postedNumber`, `uniqueCheckNo`, `BILL_PAYMENT_URL` (`tests/e2e/pay-bills-helpers.ts`); `postVendorCredit`, `applyCreditToBill` (`tests/e2e/vendor-credit-helpers.ts`); `uniqueName`, `openBooks` (`tests/e2e/record-form-helpers.ts`); `DESKTOP` (`tests/e2e/account-register-helpers.ts`); `hubRow`, `chooseParamOption` (`@tinycld/core/e2e-helpers`)
- Produces:
  - Go `const apAgingKey = "books.ap_aging"`, `func apAgingShipped() reports.Shipped`, `func apAgingSpec() *reports.Spec`, `func apNet() *reports.Node`, `func apDisplay() *reports.Display`
  - Go `func vendorsParam() reports.ParamDef`, `func vendorGroup() reports.Group`, `func vendorSort(net *reports.Node, inner ...reports.SortKey) []reports.SortKey`
  - Go test helpers in `server/report_ap_aging_test.go` that checkpoint 4 uses: `runAP(t, app, reader, params) *reports.Result`, `exportAPCSV(t, b, reader, params) string` (as `exportARCSV`: it stores the shipped spec as a report row of the reader and calls core's export route)
  - e2e helpers in `tests/e2e/ap-aging-helpers.ts` that checkpoint 5 uses: `AP_DAY`, `openApAging(page)`, `filterToVendors(page, names: string[])`, `apVendorWithBill(page, { amount, due, name? })` (returns `{ vendor: { id, name }, billId, billNo }`), `payPartOfBill(page, { vendor: { id, name }, billId, amount })` (returns the bill payment's number)

**Gates:** 1 · 2 (reference: `populated-1540-*`, `populated-1284-*`, `opened-1540-*`, `opened-1284-*`, `item-opened-1540-*`, `item-opened-1284-*`, `by-balance-1540-*`, `filtered-1540-*`, `past-day-1540-*`, `empty-1284-*` screenshots, at built widths 1280 and 1024 by D8; built URL: `/a/reports/<id>`, the A/P Aging opened from `/a/reports?package=books`) · 3

**Spec:**
- "**Open items (Q3).** The report reads the posted journal lines on accounts of type `accounts_payable`, dated on or before the As of day, and gives each amount to one open item:
  - A bill is one item. Its open amount on the day is its total, less the lines of posted bill payments dated on or before the day that pay it, less the vendor credit applications dated on or before the day that name it.
  - A vendor credit is one item, a negative figure. Its open amount on the day is its total, less its applications dated on or before the day, less the lines of posted vendor refunds dated on or before the day that refund it.
  - A posted journal entry line on Accounts payable that comes from none of these documents is one item for its credit less its debit.
  - A bill payment and a vendor refund are never items: Books posts each one fully applied, so each of their lines is a part of the bill or the vendor credit it names.
  - A void document and its reversal are one item that adds up to zero. A voided bill payment or vendor refund reads as never applied. A removed vendor credit application reads as never applied, on past days too (Q5).
  - An item whose amount on the day is zero does not show."
- "**Sign (Q4).** A figure is positive when the business owes it. A vendor credit is negative and lowers its vendor's Total."
- "**The figures tie.** A vendor's Total for today is the Open balance of its vendor page (`books_party_balances`). The report's Total is the Accounts payable figure of the Balance Sheet for the day. This holds because every row comes from a posted Accounts payable line or is a part of one: the lines of a bill payment add up to the Accounts payable debits of its entry, the lines of a vendor refund add up to the Accounts payable credits of its entry, and the two rows of a vendor credit application add up to zero."
- "**Age (Q2).** An item's age is the days from its due date to the As of day. A bill has a due date. Every other item ages from its own date."
- "**Columns (Q2).** **Vendor** (the label), **Due date**, **Current** (age 0 or less: not yet due), **1 - 30**, **31 - 60**, **61 - 90**, **91 and over**, **Total**. An item's amount is in the one age column of its age and in Total. A vendor row and the Total row add their items in each column. An age column with no money on a row is blank, on the Total row too; Total always shows a figure. Due date shows on an item row only."
- "**Rows.** Level 1 is the vendor, level 2 the open item. Vendors have no parent, so there is no family level. A vendor with no open item on the day does not show (core `groups[].hideEmpty`)."
- "**Opening a vendor (Q2).** A press on a vendor row opens it in place into one row per open item, labelled "<type> <number>" ("Bill 1042", "Vendor credit 3", "Journal entry JE-12": the number is the item's entry number as Books prints it), with its Due date and its open amount in its age column and in Total. Items are in due-date order, oldest first, then by number."
- "**Opening an item (Q2).** A press on an item row opens it in place into its lines: the document's own line and one line per part that changed it on or before the day, each labelled "<date> · <type> <number>" (the date as its ISO day). Under a bill: "2026-11-03 · Bill payment 317" for a payment line and "2026-11-05 · Vendor credit 12" for an applied credit, each negative. Under a vendor credit: "2026-11-05 · Bill 1042" for an application and "2026-11-09 · Vendor refund 4" for a refund line, each positive. Each amount is in the item's age column and in Total. The lines add up to the item's open amount."
- "**Opening a line.** A press on a line opens the read view of the document the label names, or the journal entry (core `detail.open` with Books `entryOpenPath()`): beside the report at 1360 px and wider where Books registers a report panel for the path, else as its own screen (p5-drill-down, unchanged)."
- "**No vendor (Q7).** Accounts payable lines that name no vendor form one row "No vendor", after every vendor; it opens into its items like a vendor row. With vendors picked in the filter it does not show."
- "**Params.**
  - **As of** (core `asOf`), default **Today** (Q2). A past day shows the items as they were open on that day.
  - **Vendor** (new Books `vendorsParam()`: multiple, every vendor by name, inactive ones included). The document header prints "Vendor: …" for the picks.
  - **Order** (choice, Q2): **Name** (default) or **Largest balance** (by Total, largest first)."
- "**Inactive vendors (Q2).** The row is muted (core `groups[].muted`) and its label ends with " (inactive)"."
- "**Heading.** The Books business name, "A/P Aging", "As of <day>" (core `ReportDocumentHeader`, `Source.Heading`)."
- "**Empty.** With no open item on the day the report shows core's empty text for the day (`emptyMessage`) and no rows."
- "**Live.** A post or a void of a bill, a bill payment, a vendor credit, a vendor refund or a journal entry, a correction of one of them, a vendor credit applied to a bill or removed from it, a vendor rename, or a Books settings change re-runs an open report. The run's topics are `collection/books_payable_items`, `collection/books_vendors` and `collection/books_settings`. Books refreshes the stored payable rows inside the transaction of each write that changes one and touches the table's change signal there (core `changesignal.Touch`), so the signal fires after the commit and never for a write that is rolled back."
- "**Loading, error and Retry, refresh, Customize, Save as, copy link, share and the Export menu (CSV, Excel, PDF, email):** core's report view, unchanged. PDF writes the rows the view shows with their folds; CSV and Excel open every group." (core's view, D9; Books pins the CSV rows in `TestAPAgingCSVOpensEveryGroup`)
- "**Wide.** The eight columns are on one line where the rows are 940 px wide or wider (`display.oneLine.minWidth: "940px"`, the A/R Aging's measured value; phase 3 pass 2 measures it again on `/a/reports/<id>` with this report's fixture at 1024 and 1280). Every figure column is `minWidth: "max-content"`; the Vendor column wraps to at most three lines."

**Tests it must add:**
- `server/report_ap_aging_test.go` (Go; every test builds its book with the checkpoint-2 helpers, runs the shipped spec with `runAP` as a reader from `readerInfo`, and ends with `requireNoDrift`):
  - `TestAPAgingSpecLoads`: `reports.CheckSources` and `reports.Validate` accept the spec; base `books.payable_items`; params `asOf`, `vendors`, `order`; the column ids in order `name, due, current, d30, d60, d90, d91, total, vendorKey, itemKey, itemNo`; groups `byVendor` (`HideEmpty`) and `byItem`; `apAgingShipped()` has key `books.ap_aging`, title "A/P Aging", the spec's description, Revision 1 and `Unpublished` true.
  - `TestAPAgingAgeColumns`: a bill not yet due is in `current`; bills with age 0, 1, 30, 31, 60, 61, 90, 91 on the As of day are in `current`, `d30`, `d30`, `d60`, `d60`, `d90`, `d90`, `d91`; every other age cell of each item row is absent (blank), `total` equals the amount, and the vendor row and the Total row add their items in each column (`requireAgesAddUp`). Fails on an off-by-one at an edge or on a zero shown in an empty age.
  - `TestAPAgingOpenItems`: a part payment lowers the bill's item to total less payment; one payment of two bills lowers each by its own line; a payment dated after the As of day does not lower it; a paid bill has no item row and a vendor whose only bill is paid has no row.
  - `TestAPAgingVendorCredit`: a credit with no application is one item with a negative `total` in the column of its own date's age, labelled "Vendor credit <number>", and the vendor's Total is bills less credit; a credit applied in part read the day before the apply date (bill and credit whole) and on it (both lower by the amount); after the application is removed, a run on the old apply date shows both whole (Q5); a refund of part of the credit raises the credit's item toward zero; a credit used up by an application and a refund has no item row.
  - `TestAPAgingAsOfDay`: a bill dated D with a part payment on day P: a run on D−1 has no row for the vendor, a run on P−1 shows the bill whole, a run on P shows it less the payment.
  - `TestAPAgingSettledItemOnPastDay`: a bill paid in full on day P (its rows are settled on P) shows whole on P−1 and not at all on P and later: the `settled > asOf` filter keeps a settled item on the days before it settled.
  - `TestAPAgingItemLines`: under a bill with a payment and an applied credit the lines are, in order, "<bill date> · Bill <n>" (positive), "<payment date> · Bill payment <n>" (negative), "<apply date> · Vendor credit <n>" (negative), each amount in the item's age column and in Total, adding up to the item's amount; under the credit: its own line (negative), "<apply date> · Bill <n>" and "<refund date> · Vendor refund <n>" (positive). Each line's open path is `books/` + the route of its document from `server/entry_routes.json` + `/` + the document id (the bill payment for the payment line, the vendor credit for the applied credit under the bill, the bill for the application under the credit, the vendor refund for the refund line); a manual journal line opens `books/entries/<entry id>`. `dueOf` is the bill's due date on the item row and blank on the vendor row, on each line and on the Total row.
  - `TestAPAgingItemOrder`: three bills of one vendor with due dates out of creation order, two of them with one due date: the item rows are by due date, oldest first, then by number as an integer (bill 9 before bill 10).
  - `TestAPAgingNoVendor`: a manual Accounts payable line with a vendor is an item "Journal entry <number>" of that vendor for its credit less its debit, in the age column of its entry's date (an entry dated 45 days before the As of day is in `d60`) with that date as its Due date; one with no vendor is under a row "No vendor", which is the last vendor row under both Order choices and opens into its item; with one vendor picked the "No vendor" row is absent.
  - `TestAPAgingVoids`: a void bill has no item; a void bill payment leaves the bill whole; a void vendor credit has no item; a void vendor refund leaves the credit as before the refund.
  - `TestAPAgingCorrections`: a corrected bill shows one item under the correction's number with its payment line and its application under it; a corrected bill payment and a corrected vendor credit show the replacement's figures.
  - `TestAPAgingInactive`: an inactive vendor's row has `Muted` true and a label that ends with " (inactive)"; an active one has neither.
  - `TestAPAgingVendorsParam`: with two of three vendors picked only their rows show, the Total adds only them, and the result's header line is "Vendor: <a>, <b>"; the param's options hold an inactive vendor.
  - `TestAPAgingOrder`: Name orders vendors by name ignoring case; Largest balance orders them by Total, largest first, with a credit-only vendor (negative Total) after the positive ones and "No vendor" last; the items under a vendor keep the due-date order under both.
  - `TestAPAgingTies`: for each vendor the row's Total on today equals `books_party_balances` for that vendor; the report's Total equals the Accounts payable figure of a Balance Sheet run (`balanceSheetSpec`) for the same day, on today and on a past day.
  - `TestAPAgingEmpty`: on `AP_AGING_EMPTY_DAY` the result has no rows.
  - `TestAPAgingNoAccess`: a user without Books access gets no rows (and no error that names a row).
  - `TestAPAgingTopics`: the run's `Topics` are exactly `collection/books_payable_items`, `collection/books_vendors` and `collection/books_settings`.
  - `TestAPAgingShippedShared`: after `Register`, a new Books reader has a viewer share of the report with `shipped_key` `books.ap_aging` (as `TestARAgingShippedShared`).
  - `TestAPAgingCSVOpensEveryGroup`: `exportAPCSV` holds a line for every item and every line of every vendor with no row opened in the request.
  - `TestAPAgingDisplayLayouts`: `apDisplay()` equals `agingDisplay()`; one line from `940px`; `name` wraps to 3 lines; the seven figure columns are `max-content`; the mobile layout has 3 tracks with `name` (span 2) and `due` on line 1, `current`, `d30`, `total` on line 2, `d60`, `d90`, `d91` on line 3; the tablet layout starts at `640px` with 12 tracks, `name` (span 10) and `total` on line 1, `due` and the five ages on line 2.
  - `TestAPAgingMatchesSharedSpecFile`: the shipped title, description, params and display block equal `server/testdata/ap_aging_spec.json`.
- `tests/ap-aging-fixture.test.ts` (vitest, non-UI: the shared case file, as `tests/ar-aging-fixture.test.ts`): `AP_AGING_TITLE`, `AP_AGING_DESCRIPTION`, `AP_AGING_PARAMS` and `AP_AGING_DISPLAY` equal the four values of `server/testdata/ap_aging_spec.json`. Fails when Go and the fixture differ.
- `tests/e2e/books-ap-aging.spec.ts`, `test.describe('ap-aging: report', …)`, desktop (`DESKTOP`), 6 tests. Each creates its own vendors, filters the report to them, and reads cents with `agedCents` from one `reportSnapshot`:
  1. "opens from the Reports hub with its heading, and is empty before the first payable": `openApAging` (the hub card "A/P Aging"); the document header shows the business name, "A/P Aging" and "As of <today in words>" (`dayWords`); after `chooseAsOf(page, { day: AP_DAY.empty })` the header reads "As of January 1, 2020", core's empty text for the day shows and no vendor row is mounted. Fails when the report is not shipped, not shared with the reader, or shows a row before any payable.
  2. "ages a bill by its due date": `apVendorWithBill` (1,250.00 due `AP_DAY.due`); filtered to the vendor with As of `AP_DAY.aged40` the vendor row has 125000 in `d60` and in `total` and no figure in `current`, `d30`, `d90`, `d91`, and the Total row has the same; with As of `AP_DAY.due` the amount is in `current`; with As of `AP_DAY.beforeBill` the vendor has no row. Fails when age is not counted from the due date or an empty age shows a figure.
  3. "opens a vendor into its bill, the bill into its lines, and a line into the bill payment": a bill of 900.00, then `payPartOfBill` 300.00; at the default As of the vendor row's `total` is 60000; a press on it (`openAgingRow`) shows one row "Bill <billNo>" with the Due date "Jul 20, 2026" and 60000; a press on the item shows two lines, "<bill day> · Bill <billNo>" with 90000 and "<today ISO> · Bill payment <n>" with -30000; a press on the payment line lands on a URL that matches `BILL_PAYMENT_URL`, and the read view shows the payment's number. Fails when an item or a line is missing, mislabelled or opens the wrong document.
  4. "an open report follows a bill payment made in another window": the report is open on page A, filtered to a new vendor with a bill of 500.00 (Total 50000); on a second page of the same context (`page.context().newPage()`, then `openBooks(second, DESKTOP)`, as `tests/e2e/books-ar-aging.spec.ts` line 275 does) `payPartOfBill` 200.00; page A's vendor Total becomes 30000 with no reload and no press on refresh (`snapshotWhen`). Fails when the write does not touch the change signal or the run's topics miss the table.
  5. "a vendor credit is a negative item, and applying it lowers the bill and the credit": a vendor with a bill of 800.00; `postVendorCredit` 250.00; the opened vendor shows "Bill <n>" 80000 and "Vendor credit <n>" -25000 and the vendor Total 55000; after `applyCreditToBill` 100.00 the bill's item is 70000, the credit's -15000 and the Total still 55000; the opened bill shows a line "<today ISO> · Vendor credit <n>" with -10000. Fails when the sign is wrong or an application does not change both items.
  6. "prints the Vendor filter and orders by largest balance": two vendors, the first by name with a bill of 100.00 and the second with 700.00; `filterToVendors` of both prints "Vendor: <a>, <b>" in the document header and the rows are in name order; after `chooseBalanceOrder(page, 'balance')` the second vendor is first; then at `{ width: 1024, height: 800 }` the first row's label and its cells are on one line and `expectTableFits(page)` passes (the Wide bullet, as `tests/e2e/books-ar-aging.spec.ts` lines 386 to 393). Fails when the header is missing, the order key is not the Total, or the eight columns wrap or scroll sideways at 1024.
  No phone run in this checkpoint: the phone layout is checkpoint 5's.

**Do:**
0. Test writer: the tests above, `server/testdata/ap_aging_spec.json` (the four values, from the fixture) and `tests/e2e/ap-aging-helpers.ts`. Red for: `apAgingSpec`, `apAgingShipped`, `vendorsParam` do not exist (Go compile error; the report names the symbols); the hub has no "A/P Aging" card (e2e). `tests/ap-aging-fixture.test.ts` is green from the start (it compares the fixture with the new file); say so. The e2e helpers:
   - `AP_DAY = { due: '2026-07-20', aged40: '2026-08-29', beforeBill: '2026-07-19', empty: AP_AGING_EMPTY_DAY }` (`vendorWithBills` dates a bill that is due before today on its due date, so the bill is dated 2026-07-20).
   - `openApAging(page)`: `openBooksReports(page)`, then a press on the hub entry with the name "A/P Aging", then the heading "A/P Aging" is visible (read `openArAging` in `tests/e2e/ar-aging-helpers.ts` and do the same steps with this title).
   - `filterToVendors(page, names)`: read `filterToCustomers` in `tests/e2e/customer-balance-helpers.ts` and do the same steps with the param id `vendors` (URL param `p-vendors`); it resolves when the document header shows "Vendor: " and the names.
   - `apVendorWithBill(page, { amount, due, name? })`: `vendorWithBills(page, { name, bills: [{ amount, due }] })`, which returns `{ vendor: { id, name }, bills: [{ id, number }] }`; it returns `{ vendor, billId: bills[0].id, billNo: bills[0].number }`.
   - `payPartOfBill(page, { vendor, billId, amount })`: `openPayBills(page)`, `filterToVendor(page, vendor)`, type the amount in `payBillsRowAmount(page, billId)`, a check number from `uniqueCheckNo`, Pay; returns `postedNumber(page)` (read the part-payment test in `tests/e2e/pay-bills-create.spec.ts` for the steps).
1. `server/report_spec_helpers.go`, after the customer helpers:
   ```go
   // vendorsParam is the Vendor param of the vendor reports: any number of
   // vendors, inactive ones included. The document header names the picks.
   func vendorsParam() reports.ParamDef {
       return reports.ParamDef{
           ID: "vendors", Type: reports.ParamChoice, Label: "Vendor", Multiple: true,
           Header: "Vendor: {label}",
           OptionsFrom: &reports.OptionsFrom{Source: "books.vendors", Value: path("id"), Label: path("display_name")},
       }
   }

   // vendorGroup is the vendor level: shown only with a row, muted when
   // inactive. A blank key (no vendor) labels "No vendor".
   func vendorGroup() reports.Group {
       inactive := op("eq", rec("byVendor", "inactive"), lit(true))
       return reports.Group{
           ID: "byVendor", Col: "vendorKey", HideEmpty: true,
           Label: op("concat",
               op("coalesce", rec("byVendor", "display_name"), lit("No vendor")),
               op("if", inactive, lit(" (inactive)"), lit("")),
           ),
           Muted: inactive,
       }
   }

   // vendorSort is the vendor order (D7): the report's inner keys; No vendor
   // last, before the balance key, so it stays last under Largest balance;
   // under Largest balance the vendor's sum of net, largest first; then
   // vendors by name, ignoring case.
   func vendorSort(net *reports.Node, inner ...reports.SortKey) []reports.SortKey {
       keys := append([]reports.SortKey{}, inner...)
       return append(keys,
           reports.SortKey{Formula: op("if", op("isEmpty", rec("byVendor", "id")), lit(1), lit(0))},
           reports.SortKey{Formula: op("if", op("eq", prm("order"), lit("balance")), op("sum", net), lit(0)), Dir: "desc"},
           reports.SortKey{Formula: op("lower", rec("byVendor", "display_name"))},
       )
   }
   ```
   `books.vendors` has the fields `display_name` and `inactive` (`server/report_sources.go` lines 137 and 146).
2. `server/report_ap_aging.go`, with `server/report_ar_aging.go` as the model:
   ```go
   const apAgingKey = "books.ap_aging"

   func apAgingSpec() *reports.Spec {
       return &reports.Spec{
           Version: reports.CurrentVersion,
           Source:  "books.payable_items",
           Params:  agingParams(vendorsParam()),
           Filter: op("and",
               op("gt", fld("settled"), prm("asOf")),
               op("lte", fld("date"), prm("asOf")),
               op("in", col("vendorKey"), prm("vendors")),
           ),
           Columns: apColumns(),
           Groups:  []reports.Group{vendorGroup(), agingItemGroup(apNet(), itemKindLabel(payableItemsSource()))},
           Sort: vendorSort(apNet(),
               reports.SortKey{Formula: col("due")},
               reports.SortKey{Formula: col("itemNo")},
               reports.SortKey{Formula: fld("date")},
               reports.SortKey{Formula: fld("entry", "posted_at")},
           ),
           Detail:  &reports.Detail{Label: agingDetailLabel(), Open: entryOpenPath()},
           Display: apDisplay(),
       }
   }

   // apNet is a row's credit less its debit: what the business owes.
   func apNet() *reports.Node { return op("sub", fld("credit"), fld("debit")) }

   // apDisplay is the A/R Aging's block: phase 3 pass 2 measured that this
   // report's fixture fits it with no change (ledger, phase 3 pass 2).
   func apDisplay() *reports.Display { return agingDisplay() }
   ```
   `apColumns()`: `{ID: "name", Label: "Vendor", Path: reports.Path{{Link: "vendor"}}}`; `{ID: "due", Label: "Due date", Formula: op("min", fld("due_date")), BlankAbove: "byItem", Detail: "blank"}`; `agingColumns(agingAge(), apNet())...`; hidden `vendorKey` (`Label: "Vendor key"`, the `vendor` link path), `itemKey` (`Label: "Item"`, field `item`), `itemNo` (`Label: "Item number"`, `op("min", fld("item_seq"))`, `BlankAbove: "byItem"`, `Detail: "blank"`). `apAgingShipped()`: key `apAgingKey`, title "A/P Aging", description "What you owe each vendor on one day, by how long each open bill is past due.", `Spec: mustJSON(apAgingSpec())`, `Revision: 1`, `Unpublished: true`. The line labels read `server/entry_type_labels.json` through `lineEntryTypeLabel()` inside `agingDetailLabel()`: check that the file names `bill`, `bill_payment`, `vendor_credit` and `vendor_refund` and that `server/entry_routes.json` has the four routes (spec §4.4 says both do); a missing one is added there with its test.
3. `server/register.go`: `reports.RegisterShipped(apAgingShipped())` on the line after `reports.RegisterShipped(arAgingShipped())`. `server/report_shares.go` needs no change (its filter `shipped_key ~ 'books.%'` covers the key).
4. If `reports.Validate` or a run refuses a node, apply the core gap rule. If a figure of `TestAPAgingTies` differs, the cause is in the stored rows (checkpoint 2's SQL), not in the spec: fix it there with a stored-row test that shows it.
5. `git grep -n -e "arAgingShipped" -e "books.ar_aging" -e "A/R Aging" -- server tests tinycld/books` and add this report wherever a test or a list counts or names every shipped Books report (a count of hub cards, a list of shipped keys, a share count for a new reader); list each changed file in the report.
6. Gate 1 with `books/tests/e2e/books-ap-aging.spec.ts`. Gate 2: capture the built report at 1280 and 1024 on the seeded book, in these states: as it lands (reference `populated-*`), Harbor Freight Logistics opened (`opened-*`), its bill opened (`item-opened-*`), Order = Largest balance (`by-balance-1540-*`), Vendor = two picked vendors (`filtered-1540-*`), As of 2026-10-15 (`past-day-1540-*`), As of 2020-01-01 (`empty-1284-*`). Judge by D8.

### Checkpoint 4 — Query plans and scale proof

**Delivers:** the proof of spec §9 for this report: every statement of the seven runs meets the query-plan bars under the L statistics in the ordinary `go test`, the S and L runs meet the time bars, the A/R Aging's seven runs still meet theirs after the engine extraction, and the measured results are in the ledger.

**Files:**
- Create: `server/report_scale_harness_test.go` (the parts of `server/report_ar_aging_scale_test.go` that name no receivable, moved with no change of body)
- Modify: `server/report_ar_aging_scale_test.go` (loses what moved; passes its own large-table list and statistics file to the harness)
- Create: `server/testdata/ap_aging_stat1.json` (written by the `BOOKS_SCALE=1` run)
- Create: `docs/plans/ap-aging-evidence/perf-plans.md`
- Modify: `docs/plans/ap-aging-ledger.md` (section Performance)
- Modify: `pb-migrations/2100000029_create_books_payable_items.js` (only when a bar fails for a missing index: the index, with the plan that needs it)
- Test: `server/report_ap_aging_scale_test.go`

**Interfaces:**
- Consumes: `apBook`, `newAPBook`, `apVendor`, `apBill`, `apPayBills`, `apVendorCredit`, `apApply`, `apRefund`, `apJournal`, `requireNoPayableDrift` (checkpoint 2); `runAP`, `exportAPCSV`, `apAgingSpec` (checkpoint 3); `payableItems` (checkpoint 2); from `server/report_ar_aging_scale_test.go`: `planStep`, `arStat`, `arReading`, `explainStatements`, `explainReading`, `arSchema`, `arSchemaOf`, `stepVerb`, `arReadsAny`, `arLoopSteps`, `arSubtreeReadsLarge`, `checkPlanBars`, `arStepsOf`, `arPlanRecorder`, `arMedian`, `arReads`, `arPlanText`, `arWithin`, `arWriter`, `newARWriter`, `arRun`, `arCheckRuns`, `arLStats`, `TestARAgingScale`
- Produces: `server/report_scale_harness_test.go`; `TestAPAgingBulkWriterMatchesPosters`, `TestAPAgingQueryPlans`, `TestAPAgingRunsAgreeWithSmallBook`, `TestAPAgingScale`; the ledger's Performance section

**Gates:** 1 · 3 (nothing renders; no e2e: the checkpoint changes test files, evidence and, only for a failed bar, an index)

**Spec:**
- "**Performance (Q9).** On a book with 500,000 journal lines, each run of the report meets the time bars and each SQL statement of each run meets the query-plan bars of §9, and the measured results are in the helix ledger."
- §9, whole: Where, Dataset (the S and L table), Runs 1 to 7, Time bars ("At L, the median of 5 runs after one warm-up: runs 1 to 6 at 1,000 ms or less, run 7 at 5,000 ms or less, and each run at L at no more than 15 times its time at S."), Record. The query-plan bars are the A/R Aging's (`docs/specs/ar-aging-design.md` §9), with this report's large tables: `books_journal_lines`, `books_journal_entries`, `books_bills`, `books_bill_payments`, `books_bill_payment_lines`, `books_payable_items`.

**Tests it must add:**
- `server/report_ap_aging_scale_test.go`:
  - `TestAPAgingBulkWriterMatchesPosters`: posts one bill, one bill payment, one vendor credit, one application, one vendor refund and one journal entry through the real posters (the checkpoint-2 helpers), writes the same six with the bulk writer in a second app, and compares, column by column, the rows of `books_journal_entries`, `books_journal_lines`, `books_bills`, `books_bill_payments`, `books_bill_payment_lines`, `books_vendor_credits`, `books_vendor_credit_applications`, `books_vendor_refunds`, `books_vendor_refund_lines` and `books_payable_items` (ids mapped, clock columns left out, as `TestARAgingBulkWriterMatchesPosters` does). Fails when the bulk writer writes a column the posters write differently, so a scale figure would be of a book Books cannot make.
  - `TestAPAgingQueryPlans` (ordinary `go test`, a book of about 500 lines): for each of the seven runs of spec §9 and for each SQL statement of the run, `EXPLAIN QUERY PLAN` is read with no statistics and with the L statistics of `server/testdata/ap_aging_stat1.json` (D13), and `checkPlanBars` requires each query-plan bar of the A/R Aging's §9 with this report's large tables: no step is a `SCAN` of a large table; no large table is read inside a loop over a large table without an index search; no automatic index and no temporary B-tree over a large table. Fails with the run, the statement and the step.
  - `TestAPAgingRunsAgreeWithSmallBook`: on the small book the seven runs give the figures the bulk plan predicts (the open items per vendor and the Total from the writer's own record of what it wrote), and `payableItems.verify` is empty after the bulk write. Fails when the dataset and the report disagree, so a fast run would be a wrong run.
  - `TestAPAgingScale` (skipped unless `BOOKS_SCALE=1`): writes S and L by the table of spec §9 and requires the written counts within 5 % of it (`arWithin`); for each of the seven runs at S and at L: one warm-up, the median of 5 (`arMedian`); requires runs 1 to 6 at L ≤ 1,000 ms, run 7 at L ≤ 5,000 ms and each run at L ≤ 15 times its S time; reads every statement's plan after `ANALYZE` and requires the plan bars; writes `server/testdata/ap_aging_stat1.json` and, with `BOOKS_SCALE_OUT`, the plans text for `docs/plans/ap-aging-evidence/perf-plans.md`. In the same test, after the L book of this report is closed, it runs the A/R Aging's seven runs one time at L (the A/R dataset writer and runs of `server/report_ar_aging_scale_test.go`) and requires the A/R time bars. Fails on a bar; never changes one.
- `server/report_ar_aging_scale_test.go` keeps `TestARAgingBulkWriterMatchesPosters`, `TestARAgingQueryPlans`, `TestARAgingRunsAgreeWithSmallBook` and `TestARAgingScale` with their assertions; they pass after the move.

**Do:**
0. Test writer: `server/report_ap_aging_scale_test.go` with the payable bulk writer and the four tests. Red for: `TestAPAgingQueryPlans` has no `server/testdata/ap_aging_stat1.json` to read (the file is written by the scale run of step 4); the other two ordinary tests are red only if the harness names they call are not yet in the shared file (compile error). The test writer does step 1 first, because its tests call the moved names; say so in the report.
1. The harness move. `server/report_scale_harness_test.go` takes from `server/report_ar_aging_scale_test.go`, bodies unchanged: `planStep`, `arStat`, `arReading`, `explainStatements`, `explainReading`, `arSchema`, `arSchemaOf`, `arNames`, `arAdd`, the `aliases` and `tablesOf` methods, `stepVerb`, `arReadsAny`, `arLoopSteps`, `arSubtreeReadsLarge`, `checkPlanBars`, `arStepsOf`, `arPlanRecorder`, `arMedian`, `arReads`, `arPlanText`, `arWithin`, and the generic row writer (`arBatch`, `arWriter` with `newARWriter`, `id`, `row`, `flush`, `finish`, `entry`, `lines`; its receivable document method `doc` and `write` stay in the A/R file). Names stay as they are, so the diff is a move (`git diff --color-moved` shows it). Where a moved function reads something of the A/R Aging, that value becomes a parameter or a field, and each test file passes its own value: the large-table list is a parameter of `checkPlanBars` and `arSubtreeReadsLarge`; the per-table column map is a field of `arWriter` set by `newARWriter(t, tx, columns)` (`arTableColumns` stays in the A/R file; the payable test has its own `apTableColumns`); the statistics file name is a parameter of `arLStats`. Run `cd server && go test -run 'TestARAging' -count=1 .`: green before the payable tests are written.
2. The payable dataset (`writeAPDataset(t, b, size)` in the new test file), in one transaction through the shared row writer, by the S and L table of spec §9: vendors; posted bills over five years with due dates 30 days after their dates; bill payments (8 in 9 with one line, 1 in 9 with two lines, so the line count is 9/8 of the payments) that pay bills in full or in part so that about 8 % of the bills are open on the last day; vendor credits with applications to open bills and refunds (one line each); manual Accounts payable journal lines, 1 in 10 with no vendor; void bills and void bill payments, each with its reversal entry; then `payableItems.rebuild(tx)` for the stored rows. The writer keeps a record of what it wrote (per vendor: the open items and their amounts on the last day and on the middle day), which `TestAPAgingRunsAgreeWithSmallBook` compares with the report.
3. The runs (`apRuns(b, data)`), by spec §9: (1) As of the last day, Order Name, no Vendor pick, the first page; (2) As of the middle day; (3) Order = Largest balance; (4) Vendor = five picked vendors; (5) run 1 with the vendor that has the most open items opened; (6) run 5 with that vendor's oldest bill that has a payment opened; (7) `exportAPCSV` of run 1.
4. The scale run. `cd server && BOOKS_SCALE=1 BOOKS_SCALE_OUT=<lane staging folder>/ap-perf-plans.txt go test -run 'TestAPAgingScale' -count=1 -timeout 60m .` It needs more than 4 minutes: hand it back as `NEEDS-RUN: <that command>` and continue when the driver gives the output. It writes `server/testdata/ap_aging_stat1.json`. A failed bar: read the statement and its plan. A missing index on `books_payable_items` → add it to the migration (unreleased, edited in place), with `TestPayableItemsShape` updated, and run again. A statement of core's that cannot meet a bar with any index → the Performance rule: `STOPPED: core SQL fails a performance bar`.
5. Record. `docs/plans/ap-aging-evidence/perf-plans.md`: for each run, each statement with its plan at L after `ANALYZE` (from `BOOKS_SCALE_OUT`). `docs/plans/ap-aging-ledger.md`, section Performance: the machine, the date, the dataset counts at S and L, a table of the seven runs with the S median, the L median, the ratio and the bar, the same for the A/R Aging's seven runs at L with its bars, and each index added (or "none").
6. Gate 1 (`go test ./...` runs the ordinary plan test with the new statistics file).

### Checkpoint 5 — Reports menu, narrow layouts, help

**Delivers:** the Vendors list's Reports menu with A/P Aging, the proof that an opened vendor reads on a phone with no sideways scroll, and the help text.

**Files:**
- Modify: `tinycld/books/lib/shipped-reports.ts` (`AP_AGING_SHIPPED_KEY`; the header comment names the Vendors list)
- Modify: `tinycld/books/components/vendors/VendorsList.tsx` (the Reports menu in `PartyList`'s `headerAction`)
- Modify: `help/reports.md` (additive: the section "Read the A/P Aging report" after "Read the sales reports"; "A/P Aging" in the list of "Who sees Books reports")
- Modify: `help/vendors.md` (the first section says where the Reports menu is and links to the new section)
- Modify: `tests/e2e/books-ap-aging.spec.ts` (the second describe)
- Test: `tests/e2e/books-ap-aging.spec.ts` · `tests/help-reports.test.ts` · `tests/help-vendors.test.ts`

**Interfaces:**
- Consumes: `apAgingKey` with the value `books.ap_aging` (checkpoint 3); `AP_DAY`, `openApAging`, `filterToVendors` (checkpoint 3, `tests/e2e/ap-aging-helpers.ts`); `openAgingRow`, `agingRow`, `expectAgingLinesFit`, `freshPageWithReports` (`tests/e2e/ar-aging-helpers.ts`); `fakeReadOnlyAccess` (`tests/e2e/banking-helpers.ts`); `vendorWithBills` (`tests/e2e/pay-bills-helpers.ts`); `expectTableFits`, `reportSnapshot`, `chooseAsOf` (`tests/e2e/books-report-helpers.ts`); `openVendorsList` (`tests/e2e/vendor-form-helpers.ts`); `PHONE` (`tests/e2e/account-register-helpers.ts`); `useShippedReportHref` (`tinycld/books/hooks/useShippedReportHref.ts`); `ShippedReportsMenu` (`tinycld/books/components/reports/ShippedReportsMenu.tsx`); `PartyList` and its `headerAction` prop; `AR_AGING_SHIPPED_KEY` (the model, `tinycld/books/lib/shipped-reports.ts`)
- Produces: `AP_AGING_SHIPPED_KEY = 'books.ap_aging'`; test ids `vendors-reports`, `vendors-reports-aging`; help section "Read the A/P Aging report"

**Gates:** 1 · 2 (reference: `populated-1160-*`, `opened-1160-*`, `item-opened-1160-*`, `populated-phone-375-*`, `populated-phone-390-*`, `item-opened-phone-375-*`, `item-opened-phone-390-*`, `empty-phone-390-*` screenshots, the `*-1160-*` ones at built width 900 by D8; built URL: `/a/reports/<id>`, the A/P Aging opened from the Vendors list's Reports menu at `/a/books/vendors`) · 3

**Spec:**
- "**Phone and narrow widths.** Below the one-line width a `display.layouts` arrangement wraps each row, with no sideways scroll. The arrangements are the A/R Aging's (the phone one approved by the human on 2026-11-18): on a phone (three tracks) the label and the Due date are on the first line, Current, 1 - 30 and Total on the second, and 31 - 60, 61 - 90 and 91 and over on the third; on a tablet (rows of 640 px to 939 px, twelve tracks) the label and Total are on the first line and the Due date and the five ages on the second. Phase 3 pass 2 measures both with this report's fixture, the phone one at 375 and 390 and the tablet one at 900. A width at which a figure is cut or the row scrolls sideways gets this report's own value in `apDisplay()`; the A/R Aging's block is then not changed."
- "**Help.** `help/reports.md` gains "Read the A/P Aging report": what an open item is, how age is counted, that a vendor credit is a negative figure, why a vendor's Total equals its page's Open balance and the report's Total equals the Balance Sheet, how to open a vendor, an item and a document, the As of day, the Order choice. Its "Who sees Books reports" list gains the A/P Aging. `help/vendors.md` links to the new section."
- §2: "The Vendors list gets a **Reports** menu (Q8): Books `ShippedReportsMenu` (test id `vendors-reports`) in `PartyList`'s `headerAction`, as the Customers list has. It has one item, **A/P Aging** (test id `vendors-reports-aging`), through `useShippedReportHref('books.ap_aging')`. The menu is not drawn while the report is not found."

**Tests it must add:**
- `tests/e2e/books-ap-aging.spec.ts`, `test.describe('ap-aging: entry points and narrow layouts', …)`, 3 tests:
  1. "the Vendors list's Reports menu opens the A/P Aging, for a reader too, and is not drawn when the report is not found" (desktop), written as the A/R test of `tests/e2e/books-ar-aging.spec.ts` lines 450 to 498 is: with `fakeReadOnlyAccess(page)` (`tests/e2e/banking-helpers.ts`), `openVendorsList`; a press on `vendors-reports`, then on `vendors-reports-aging`; the report's heading "A/P Aging" shows on a URL under `/a/reports/`. Then on `freshPageWithReports(page, [])` (a page whose `reports` list answers no row; `tests/e2e/ar-aging-helpers.ts`) the Vendors list opens, the test waits until the faked list has answered a request that names `books.ap_aging`, and `vendors-reports` has count 0 while the list's rows show. Fails when the menu or its item is missing or leads elsewhere, when a reader has no menu, or when an empty menu is drawn with no report.
  2. "an opened vendor reads on a 390 px phone with no sideways scroll": at the default viewport a vendor with a long name (`LONG_VENDOR`, a `uniqueName` of about 60 characters, long enough to wrap to two lines at 375 and 390, as `LONG_CUSTOMER` of `tests/e2e/books-ar-aging.spec.ts` line 404) and two bills in one `vendorWithBills` call: 900.00 due `AP_DAY.due` and 400.00 due 2026-09-15; `openApAging`, `filterToVendors`, `chooseAsOf(page, { day: '2026-09-15' })` (`vendorWithBills` dates each of these bills on its due date, so both exist on that day: the first is 57 days past due, in 31 - 60, and the second is in Current; the figures are on two different phone lines); then `page.setViewportSize(PHONE)` and a wait for `toolbar-more-button`; open the vendor and its first bill; inside `test.step('A/P Aging phone rows', …)`: `expectTableFits(page)` and `expectAgingLinesFit(page, { wrappedLabel: LONG_VENDOR })`: the table's scroll width is not above its client width, no figure's text is cut, the vendor row's Total is on the row's second line, and the item's Due date is on its first line. Fails when the phone arrangement is missing, scrolls sideways or cuts a figure. The phone path is different code: core draws the wrapped `display.layouts` rows.
  3. "an opened vendor reads on a 375 px phone with no sideways scroll": the same steps and assertions at `{ width: 375, height: 812 }` (the narrowest reference width; a width of its own because the three tracks are narrower and a figure can be cut here and not at 390).
- `tests/help-reports.test.ts` (vitest, non-UI: the help file's text, as the file's A/R Aging tests near lines 610 and 722): the heading list gains "## Read the A/P Aging report" directly after "## Read the sales reports" (the pinned rule "the sales reports come directly after the A/R Aging" stays true); the section's text contains, one assertion each: "open item", "due date", "negative", "Open balance", "Balance Sheet", "As of", "Largest balance", "No vendor", and the sentence that names the Vendors list's Reports menu; the "Who sees Books reports" paragraph contains "the A/P Aging". Fails when the section or one of the spec's Help items is missing.
- `tests/help-vendors.test.ts` (as `tests/help-customers.test.ts` lines 69 to 71; a new file if the vendors topic has none): `help/vendors.md` contains "press Reports at the top of the Vendors list and choose A/P Aging" and the link `help://books:reports`.

**Do:**
0. Test writer: the second describe and the two help tests. Red for: no element with the test id `vendors-reports` (test 1); the help files have no A/P Aging text (vitest). Tests 2 and 3 can be green from the start, because `apDisplay()` already returns the A/R Aging's layouts (checkpoint 3): run them and say the result in the report; when one is red for a cut figure or a sideways scroll, that is this checkpoint's work (step 3).
1. `tinycld/books/lib/shipped-reports.ts`: `export const AP_AGING_SHIPPED_KEY = 'books.ap_aging'` beside `AR_AGING_SHIPPED_KEY`; the header comment names the Vendors list's menu.
2. `tinycld/books/components/vendors/VendorsList.tsx`, as `tinycld/books/components/customers/CustomersList.tsx` lines 69 to 99 do it, above the JSX:
   ```tsx
   const agingHref = useShippedReportHref(AP_AGING_SHIPPED_KEY)
   const reportItems = [
       { key: 'aging', label: 'A/P Aging', href: agingHref, testID: 'vendors-reports-aging' },
   ]
   const hasReport = agingHref !== null
   const reportsMenu = hasReport ? (
       <ShippedReportsMenu items={reportItems} testID="vendors-reports" />
   ) : undefined
   ```
   and `headerAction={reportsMenu}` on `PartyList`. Read `CustomersList.tsx` first and use the exact item shape that file uses. `useShippedReportHref` returns `null` while the report is loading, not found, or its lookup failed (`tinycld/books/hooks/useShippedReportHref.ts`); then `headerAction` is `undefined`, not a menu that renders nothing, so the header draws no empty button group and the list is as today. A read-only user sees the menu (the report is shared with every reader). The menu works on web and native (it is the Customers list's component).
3. Narrow widths. Capture the built report at 900, 390 and 375 (Gates line). When a figure is cut or the table scrolls sideways at a width, `apDisplay()` in `server/report_ap_aging.go` gets this report's own value (a copy of `agingDisplay()`'s block with the changed value), `AP_AGING_DISPLAY`, `server/testdata/ap_aging_spec.json` and `TestAPAgingDisplayLayouts` follow, and `agingDisplay()` does not change. When nothing is cut, no code changes.
4. Help. `help/reports.md`, a new section "## Read the A/P Aging report" after the section "## Read the sales reports" and before "## Download or email a report" (`tests/help-reports.test.ts` pins the sales reports directly after the A/R Aging), task first ("To see what you owe each vendor and how late it is, open Reports and choose A/P Aging. You can also press Reports at the top of the Vendors list, then A/P Aging."), then: what an open item is (a bill, a vendor credit, a journal entry line on Accounts payable; a bill payment and a vendor refund are parts of the bill or credit they name); how age is counted (days from the due date to the As of day; an item with no due date from its own date; the five columns); a vendor credit is a negative figure and lowers the vendor's Total; a vendor's Total for today equals the Open balance of its vendor page and the report's Total equals Accounts payable on the Balance Sheet for the day; press a vendor to see its items, an item to see its lines, a line to open the document; the As of day (a past day shows the items as they were open then; a removed credit application reads as never applied); the Vendor filter; the Order choice (Name or Largest balance); the "No vendor" row; an inactive vendor is shown with "(inactive)". In "Who sees Books reports", add "the A/P Aging" after "the A/R Aging" in the sentence's list and change nothing else of that paragraph. `help/vendors.md`, first section: one sentence, "To see what you owe each vendor, press Reports at the top of the Vendors list and choose A/P Aging. To read it, see the [A/P Aging report](help://books:reports)." The heading list of `tests/help-reports.test.ts` (near line 34) is the one pin of the help headings (plan review, 2026-11-20). Run `cd /Users/nas/tmp/tinycld/books/tinycld && pnpm run packages:generate`.
5. Gate 1 with `books/tests/e2e/books-ap-aging.spec.ts books/tests/e2e/vendor-form-list.spec.ts` (the Vendors list's header changed) in one command. Gate 2 by the Gates line and D8.
