# vendor-pages — helix run ledger

- mode: unattended
- unit: p3-vendor-pages
- started: 2026-11-18
- package branch: books/p3-vendor-pages   core checkout: main
- spec: docs/specs/vendor-pages-design.md
- checkpoints: docs/plans/vendor-pages-checkpoints.md
- reference: docs/plans/vendor-pages-reference/
- evidence: docs/plans/vendor-pages-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/vendor-pages-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - money figures read at a glance (large figure, small label, status-colored marker) → expressible (existing `CustomerBalance`, becomes `PartyBalance`)
  - ways to reach the vendor as quiet icons beside the name → expressible (existing `CustomerContactActions`, becomes `PartyContactActions`)

## Deferrals
(none yet)

## Rebuttals
(none yet — every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)

## Design notes
- cp 1 · reviewer A NOTE: `pb-migrations/2100000026_add_vendor_party_balances.js` down path (restore the customer-only query, drop `idx_books_jlines_vendor`) has no test; its text matches `2100000015` character for character (checked by reviewers A and B). Optional: a Go test that runs the migration down and checks the view has no `vendor` field.
- cp 1 · seed data vs spec wording: spec §4 Seed says the contacts are "for three seeded vendors, one with a primary and a long role"; the approved fixture gives two vendors a primary (Office Supply World — Grace Liu, and Willamette). The unit test pins the fixture's set (Office Supply World + Willamette). Kept as approved at the design gate; the human may say if only one vendor should have a primary.

## Out-of-plan changes
(none yet — every file touched that no checkpoint's Files block named, with why)

## Phase notes
- phase 1: none (unattended; intake at /Users/nas/tmp/tinycld/auto-helix-books/staging/p3-vendor-pages/intake.md)
- phase 3: design gate 2026-11-18 — direction A (the customer page, for a vendor) picked; open questions Q1–Q20 all accepted as recommended (incl. Q4 new migration for vendor rows in `books_party_balances`, Q7 no Statements tab, Q18 move party-neutral customer page parts to `components/party/page/`). No platform-only item new. Overlap: p2-refund-receipt (lane reports) also edits `lib/party-transactions.ts`, `lib/new-actions.ts`, the customer Transactions tab and `help/customer-pages.md`; it merges first, this unit takes its changes at the eval-gate integration.
- phase 3 (2026-11-18, unattended, pass 2): direction A captured (the customer page, for a vendor: below 1360 px the page with "‹ Vendors"; at 1360 px and wider a 320 px name column beside the page and no back link; phone stacked header). No spark dropped. No human corrections (unattended).
  - fixture `tinycld/books/lib/vendor-page-fixture.ts`: bills, expenses, bill payments, vendor credits and vendor refunds (`satisfies` the generated types; reference only, not seeded), `VENDOR_PAGE_CONTACTS` (the rows the seed creates), `VENDOR_PAGE_BALANCES`, `VENDOR_PAGE_EDITED_NOTES`, `VENDOR_PAGE_TODAY` (2026-11-18). `VendorPartyBalanceRecord` is a local interface (`id`, `customer`, `vendor`, `balance`): the generated `BooksPartyBalances` has no `vendor` column until this unit's migration; the migration checkpoint replaces the interface with the generated type. Vendors come from `vendor-form-fixture.ts`: Office Supply World (populated), Willamette (long), Jamal Okafor (credit), Pacific Power (one bill, for the chip with no rows), Coastal Coffee Roasters (inactive, no rows, no contacts).
  - scratch route `tinycld/books/screens/helix-mockup.tsx` (`?state=` populated, loading, error, empty, filter-empty, credit, long, read-only, dirty, contact-dialog, discard; `?tab=` as the real page). Static over the fixture, with three real parts: the Details tab draws the real vendor form (`useVendorForm` + `RecordFormBody`, `hideBuiltins(['notes'])`; it reads the stored form definition), the contact dialog is the real `ContactPersonDialog` (Add, no read), the save bar is the real `CustomerPageSaveBar` (so its test id in the reference is `customer-save-bar`; the build's is `vendor-save-bar`).
  - manifest `docs/plans/vendor-pages-capture.json`; reference `docs/plans/vendor-pages-reference/` (18 shots, 64 images, light + dark; 1600 on transactions, long, contacts, details-dirty). Capture log: staging `reference-capture-1.log` (30 passed).
  - reference choices the build should keep: transactions columns as the customer tab (date 1.1, type 1.2, number 1, due 1.1, total 1.1 flex; status 112 fixed; min width 640); contacts columns 1.3 / 1.3 / 1.6 / 1 + menu 48; a draft with no number shows an empty No. cell and the type alone on a card; the New transaction sheet hangs from the bottom on phones and the phone button is full width; an inactive vendor's empty-state New transaction button is disabled too, with the hint under the header button; the Details column is left-aligned (max 720 px, px-6).
  - not as the build will be: Details shows Default expense account "None" (the fixture names the account by number, the scratch row has no account id); the name column at 1600 px is drawn from the fixture in fixture order, not by `PartyList`; a dirty Details form is shown by the save bar alone (no field is edited).
- phase 4 (2026-11-18, unattended): plan `docs/plans/vendor-pages-checkpoints.md`, four checkpoints: 1 Vendor rows in party balances (logic; migration `2100000026_add_vendor_party_balances.js`, the `CASE` id proof is the first server task, fallback `(l.customer || l.vendor)`), 2 Shared party page parts (logic; the customer page moves onto them), 3 Vendor page with edit in place (renders; 6 e2e), 4 Balance, new transactions, transactions (renders; 6 e2e; help topic). plan-check: 0 errors. A past-due posted bill is already seeded (`PAY_BILLS_SEED_BILLS` key `partial`, Office Supply World, due 2026-08-08, part paid); checkpoint 1 pins it in a unit test and adds no bill.
  - plan review (report: staging `plan-review.md`): 1 BLOCKER, 8 MAJOR, 13 MINOR; all fixed in the plan, none rejected.
    - BLOCKER: the customer parts draw `ListTable` (a sideways scroller) at every width that is not a phone, so the contacts table (minimum 720) scrolls sideways on the 716 px record page. Fix: checkpoint 2 adds an own-width cards rule to the shared parts (`useFitsTable`), lowers the contacts minimum to 640, and adds width steps to two customer specs and to the vendor tests. This changes the customer page at narrow non-phone widths (cards in place of a sideways scroll).
    - MAJOR: `tests/e2e/vendor-1099-helpers.ts` missing from checkpoint 3 Files; `DeleteVendorDialog` props (`vendor` null when closed); shared part prop lists incomplete (`gutterClass`, `surface`, `isVisible`, `isFullWidth`, `shortcutGroup`); load-error and loading e2e steps could not run after `createVendor` (now Save and new, then route, then the row); the "no reload" balance step (the credit now starts from the page's own menu); wrong core citations (shortcut button, overlay Escape, leave guard paths); no test for the banner refusal, the disabled write items and the save bar's error summary; the "Edit vendor" grep in Gates (now `bill-form.spec.ts` by name, and the link is pressed in checkpoint 4).
    - MINOR: ⌥1 test; dialog key and button names in e2e text; the not-found step (dropped, `vendor-form-page.spec.ts` covers §3.10); two open conditionals answered from the tree; e2e helper files and shapes; `createVendor` fields; narrowed assertions (Call from mobile, company equal to the name, due today, one query per chip, a row opened from a dirty page, search hit); more customer specs in the checkpoint 2 gate; customer words in shared parts; a Create path that exists; help test lines and `help/vendors.md` lines 28 and 62; missing contact test ids; two Tests bullets with no named assertion.
- review mode switches: none
- checkpoint 1: the view id uses the `CASE WHEN l.customer != '' THEN l.customer ELSE l.vendor END` form; PocketBase accepted it and typed `customer` and `vendor` as relations (`TestPartyBalances_VendorFieldTypes`), so the `(l.customer || l.vendor)` fallback is not in use. The migration's comment above `BOTH_PARTIES` says so.

## Checkpoint 1 — Vendor rows in party balances
- test writer: `server/party_balances_test.go` (5 new tests: VendorFieldTypes, bills/payment/credit/void for two vendors, three no-row cases, customer + vendor separate, draft A/P; `partyLineSpec.vendor`; `partyBalances` fails on a row whose id is not its party or that names both), `tests/vendor-page-fixture.test.ts`, `tests/migration-prefixes.test.ts`; red for the right reason: yes (Go: no vendor column / no migration; TS2344 on the type alias; migration list); bullets 6–7 and the fixture-value cases guard behavior already present (stated in the report); untestable: none
- implementer: migration `2100000026_add_vendor_party_balances.js` (CASE id, vendor index, down path), comment in `server/party_balances.go`, fixture alias `VendorPartyBalanceRecord = BooksPartyBalances` + `satisfies`, `CUSTOMER_PAGE_BALANCES` rows `vendor: ''`, `seed.ts` shared `createPartyContacts` + `seedVendorContacts`; `report_customer_balance_test.go` unchanged (`partyBalances` keeps `map[string]int`); DONE
- test disputes: none
- self-declared differences: (1) the shared seed helper is `createPartyContacts` with a `partyOf` callback; the customer refusal keeps its old text, the vendor refusal names the contact; (2) Do steps 1 and 8 (test-side helpers, TS tests) were the test writer's
- gate 1: tests unedited: yes · `packages:generate` → `tinycld-pkg check` pass (362 files / 7198 tests) · `go test ./...` pass (176 s) · e2e: none (no `vendor-pages:` spec exists before cp 3; nothing renders) · dev DB `pnpm run db:reset` after the migration: seed ran (books done); view has 6 vendor rows (id = vendor, customer '') and 13 customer rows; 5 vendor contacts seeded
- gate 2: n/a
- gate 3 A (correctness): 0 BLOCK, 3 NOTE — migration-prefixes guard weakened (audit view no longer checked after every `_create_` migration) → accepted+fixed (test writer; cause weak-test); `SeedPartyContact` type named after the customer fixture → accepted+fixed (one-line type in a touched file); down path untested → Design notes
- gate 3 B (conformance): script lines: 0 · 1 finding — `vendor-page-fixture.test.ts` primary check used `toContain` and passed for any set → accepted+fixed (test writer pins `[officeSupply, willamette]`; cause weak-test)
- fix review: round 1: clean (findings file staging `cp/cp1-fix-r1.md`; gate 1 again: check pass 362 files / 7199 tests; each new test assertion shown failing on a mutant)
- gate 3 A notes: 1, listed under Design notes
- reviewer-caught deferrals: none
- commit: (this commit)
- human: review mode C, none

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
