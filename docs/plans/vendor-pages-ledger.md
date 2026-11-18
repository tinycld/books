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
(none yet — gate-2 NOTEs the loop did not act on, as
`cp N · <shot>: <where> — <what>`; shown to the human at each checkpoint
and again at the end)

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

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
