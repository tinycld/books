# customer-balance — helix run ledger

- mode: unattended
- unit: p5-customer-balance
- started: 2026-11-16
- package branch: books/p5-customer-balance   core checkout: books/p5-customer-balance (from core main 5050e43b)
- spec: docs/specs/customer-balance-design.md
- checkpoints: docs/plans/customer-balance-checkpoints.md
- reference: docs/plans/customer-balance-reference/
- evidence: docs/plans/customer-balance-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/customer-balance-capture.json
- review mode: C — none (unattended)
- core extension: R1 `groups[].inline` (major, lane holds exclusive) + R2 `groups[].muted` (small), checkpoint 0, core branch books/p5-customer-balance; PR not opened yet
- sparks:
  - 1. Only a family of customers gets a header and a total; a customer with no sub-customers is one plain line — needs extension → R1, accepted
  - 2. The grand total is the heaviest line of the page — expressible (core ReportRow total row)
  - Q11 (human): inactive customer rows muted + " (inactive)" label — needs extension → R2, accepted

## Deferrals

## Rebuttals

## Design notes

## Out-of-plan changes

## Phase notes
- phase 1: unattended; intake at staging p5-customer-balance/intake.md.
- phase 3: design gate 2026-11-16 (human): direction A (families nested, one report). R1 accepted. Open questions Q1–Q15 as recommended, except Q11: an inactive customer with a balance shows marked inactive (human: "an 'inactive' badge or lighter gray text"); driver chose muted text through core R2 plus a " (inactive)" label suffix so exports keep the mark. Direction C (open invoices by customer with Type, No., Due date, Open balance) rejected for this unit; the human wants it in p5-ar-aging. Q14: p5-exports core PR #484 merged at this gate, so checkpoint 0 starts from core main. Model trial: shadow (run.md) for checkpoints 1–3.
- phase 3 pass 2 (2026-11-16): direction A captured. Fixture `tinycld/books/lib/customer-balance-fixture.ts` (static `RunResult`s over the seeded customers of `customer-form-fixture.ts`; params, columns, groups, display block, the Customer picker's option page). Scratch route `/a/books/helix-mockup?state=` populated, opened, collapsed, with-activity, by-balance, filtered, picker, empty, loading, error: core `ReportView` over a hand-built `ReportViewModel`. Reference: `docs/plans/customer-balance-reference/` (44 files; 390 and 1280, light and dark; populated and opened also at 375). The capture spec copy has one run-only option, `fakeOptions` (answers `POST /api/reports/param-options` with `CUSTOMER_OPTIONS_PAGE`).
  - Shipping route: core `/a/reports/<id>` (no package sidebar). The scratch route draws the Books sidebar at 1280 (the view is about 956 px there) and the Books New button on a phone (hidden in the captures with `hideLabels`). The phone view is the same width on both routes.
  - Display block measured at 375 and 390: `name: { whiteSpace: "normal", lineClamp: 3 }` and `balance: { minWidth: "max-content" }` keep every row on one line (label left, Balance right); no `oneLine` and no `layouts` are needed. A long customer name wraps to 3 lines, a family total label to 3 lines, a transaction label to 3 lines and then ends in "…"; no Balance figure is cut.
  - Sparks: 1 (R1) shows in the reference through the fixture's row tree (a customer with no sub-customers is one row at depth 0). 2 (total row) shows: core total row. 2b (R2, muted) is not in the reference: fixture rows of inactive customers carry `muted: true` (local type `CustomerBalanceRow`), core `ReportRow` does not read it yet, so only the " (inactive)" label marks them. Checkpoint 0 captures the states with an inactive customer again (populated, opened, collapsed, with-activity, by-balance) and replaces `CustomerBalanceRow` with core's `ResultRow`. No spark dropped.
  - Core behavior seen in the reference, unchanged by this unit: a folded family header shows its total with no currency sign (a group row), the title is cut at 375 ("Customer Balan…"), the picker cuts a long group name beside its "All <parent> sub-customers" button, the empty state offers "Show end of last fiscal year".
  - The reference draws transaction rows as plain labels (no `drill` given to `ReportView`); the built report gives them `detail.open` links.
- phase 4 (2026-11-16): plan `docs/plans/customer-balance-checkpoints.md`: checkpoint 0 (core R1 + R2, fixture retype, re-capture) and 3 Books checkpoints. Spec §5 edited twice: the seed also posts a St. Jude Gala invoice and an Old Mill Bakery (inactive) entry (plan D2); the With-activity e2e voids an invoice (plan D3). Plan decisions D1–D10 are in the plan. `plan-check.mjs --unattended`: 0 errors.
  - Plan review (report: staging `plan-review.md`): 1 blocker, 15 should-fix, 21 notes; the blocker and all should-fix items are fixed in the plan.
    - Blocker: the unset `customers` param has no chip; the first pick goes through Add filter (`chooseAgencies` pattern). Fixed in checkpoints 2 and 3.
    - Empty: 2025-01-01 is not empty (seeded 2024-08-15 line) → 2020-01-01; an assertion of the empty text added to e2e 1.
    - Checkpoint 0: `GroupLevelDraft` (not `GroupDraft`); `statements-docs.test.ts` and `formula-context.test.ts` added to Files; client checks `levelIssues`, `blankReadIssues`, `blankAboveTrips` named; `figureTone` in `lib/rows.ts` with a vitest for "red figures keep their tone"; e2e 2 makes its own report; `groupFingerprint` holds the inline flags; more consumer specs (drill panel, drill phone, audit log) and group-editor core specs in the run lists.
    - Checkpoint 1: e2e 5 no longer asserts a color on an unmounted row; the seed's activate, post, deactivate steps for the inactive customer are definite (`checkLineParty` refuses); `CUSTOMER_BALANCE_SHIPPED_KEY` goes in `lib/shipped-reports.ts`; the Total is compared with a Balance Sheet run; a fold test added.
    - Checkpoint 2: `receive-payment-form.spec.ts` (name fixed); e2e 8 makes the name order and the balance order differ by a second invoice; e2e 6 has no memo.
    - Checkpoint 3: the caller passes `headerAction` as `undefined` when there is no href; gate 1 runs the seven specs that press a `-new-header` button.
    - Notes not changed: Live is driven by one post in e2e (other causes by the topic list); e2e 6 and 7 are long flows.
