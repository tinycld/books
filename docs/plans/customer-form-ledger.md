# customer-form — helix run ledger

- mode: unattended
- unit: p2-customers
- started: 2026-10-25
- package branch: books/p2-customers   core checkout: books/p2-customers (from main a5e0c8f)
- spec: docs/specs/customer-form-design.md
- checkpoints: docs/plans/customer-form-checkpoints.md
- reference: docs/plans/customer-form-reference/
- evidence: docs/plans/customer-form-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/customer-form-capture.json
- review mode: C — none (unattended)
- core extension: tinycld PR (branch books/p2-customers), checkpoint 0 — Q15 forms host default layout; Q16 useLeaveGuard catches browser Back on web. Must merge before checkpoint 1.
- sparks:
  - form reads as a few short titled groups → dropped (one page; each address is one labelled cell; admins can add pages)
  - related short fields side by side on wide → needs extension (accepted, Q15)
  - shipping address folded to one checked line while it equals billing → expressible (AddressField shipping variant, core Toggle + isVisible block, semantic tokens)

## Deferrals
(none yet)

## Rebuttals
(none yet)

## Design notes
(none yet)

## Out-of-plan changes
(none yet)

## Phase notes
- phase 1: design gate 1 (2026-10-25): human chose direction A, but the customer shows in a side panel only on a very wide window and otherwise as a pushed page (master-detail, slide in); the URL encodes the customer shown, as boards `[boardSlug]/[card]` does. Packet revised.
- phase 3: design gate 2 (2026-10-25): approved. Direction A with the width-dependent surface (panel at window >= 1360 px, pushed page below). Every packet question Q1-Q22 takes its recommended answer, except Q15 and Q16: both core extensions accepted ("do add an extension to core forms if needed"). Platform-only item 1 (no slide on web) signed off; item 2 void because Q16 fixes it. Q19-Q21: p2-customers owns AddressField + lib/address.ts, the Books forms host files (forms/hosts.ts, forms/ui.ts) and lib/drawer-placement.ts; p3-vendors (lane reports) uses them. Q22: fix the journal entry search-target path in this unit.
- phase 3 pass 2: reference captured at docs/plans/customer-form-reference/ (30 PNGs from 8 shots: list, list-empty, list-no-match, panel at 1600, page, new, new-sub, delete; both schemes; manifest docs/plans/customer-form-capture.json; form shots 2000 px tall so the whole form shows). Fixture lib/customer-form-fixture.ts is typed against a local interface until the books_customers migration checkpoint swaps in the generated type. No spark dropped: the shipping fold is built (core Toggle + hidden address block); the Q15 half-width pairs (needs extension) are not drawn, so checkpoint 0 re-captures page, new and new-sub at 1280. Reference deviates from the spec in one place: City has its own line and State + Postal code share the next on tablet/desktop, because core TextInput keeps a ~200 px intrinsic width on web and three of them overflow the 480 px panel and the 640 px column (core gap: no min-width 0 on the input). Scratch capture spec gained a wait-at-rest (box + opacity) before `opaque` shots, so the phone Sheet and the re-mounted desktop Dialog are captured settled.
- phase 3 driver decisions (after pass 2): (1) the reference agent found core `TextInput` keeps a ~200 px intrinsic width on web, so City/State/Postal cannot share a line; fixed at the source as a core `min-w-0` on the input in checkpoint 0 (spec Sparks carried). (2) Spec contradiction: the delete dialog offered Make inactive while the server refuses it with active sub-customers; the dialog now offers Make inactive only when every sub-customer is inactive, otherwise "Make its sub-customers inactive first" and Close. Both shown to the human at the checkpoint 0 stop.
- phase 4: plan written (checkpoints 0-7; 0 core). Driver fixes before review: core FormRenderer `summary: 'root'` option (human authorized core forms extensions), Q21 drawerPlacement extraction added (CP3), zod for host-value forms. Fresh plan review: 31 findings (3 missing, 4 narrowed, 7 untested, 5 placeholders, 4 name mismatches, 2 rules, 5 design faults incl. the browser-Back guard catching expo-router's own history.go after an in-app Discard); all fixed, none rebutted. E2E runs 11/12. No core version bump (optional additive field; peerVersions '>=0.8 <1' covers it). Open risk: CP3 Retry uses recoverLiveQueries with sources: [], proven or not by its e2e step. review mode: C (unattended).
- review mode switches: none

## Final review
- eval:
- native: not executed in this run
