# Gate 2 critique — checkpoint 6 "Expense account box mapping card"

Critic: fresh subagent (Fable), 2026-10-30. 20 built shots here; reference in ../../vendor-1099-reference/.

## State check
All 20 VALID: settings-admin, settings-writer, settings-read-only, settings-refusal, settings-empty-accounts at 1280 and 390, light and dark. Allowed differences: the refused row shows the 400's message; the read-only page hides New and the Access rail item (real access gating); the Company row reads "Name your business".

## Findings
- settings-refusal (all four): 6100 Rent box select — its write is held, yet the select looks idle; nothing shows it is disabled (core SelectInput has no disabled look; the reference did not decide a pending look; e2e test 1 asserts the disabled state) — NOTE.
- dark shots: 6900 row "Inactive" caption — low contrast on the dark card; same as the reference — NOTE.
- All other shots: nothing found.

BLOCKING: none. Structure and hierarchy match the reference: card title, helper line, chart-order rows, depth indent, inactive dimming, select column width at 1280, stacked full-width selects at 390, refusal text under the row, empty state with a "Chart of accounts" button.
