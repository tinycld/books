# Gate 2 critique — checkpoint 7 "1099 vendors card and help"

Critic: fresh subagent (Fable), 2026-10-30. 16 built shots here; reference in ../../vendor-1099-reference/.

## State check
All 16 VALID: settings-admin, settings-writer, settings-read-only, settings-empty-vendors at 1280 and 390, light and dark. Allowed differences: faked writer/read-only levels (read-only hides New, the FAB and the Access item); empty-vendors captured at admin level (the reference used writer); the chip classes from the spec's Sparks carried.

## Findings
- settings-*-390 (admin, writer, read-only, light and dark): vendors card, last row — the long Willamette name and legal name truncate to one line with an ellipsis; the reference made the same choice and the tax-ID column stays aligned — NOTE.
- Cross-cutting: the Accounts card dims its inactive row (opacity-60); the vendors card marks the inactive vendor with the muted "· Inactive" suffix only (spec and reference agree) — NOTE.
- All other shots: nothing found.

BLOCKING: none. The vendors card matches the reference: heading, muted count line ("5 vendors tracked · 1 missing a tax ID"), rows sorted case-insensitively with the muted legal name, trailing "•••NNNN" or the Missing tax ID chip, chevron, dividers; empty state text and the "Vendors" button; phone keeps name left and status right.
