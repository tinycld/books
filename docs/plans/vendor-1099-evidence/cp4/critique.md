# Gate 2 critique — checkpoint 4 "Vendor form 1099 fields"

Critic: fresh subagent (Fable), 2026-10-30. Built shots in this folder; reference in ../../vendor-1099-reference/.

## State check
All 8 VALID: vendor-tracking-on/off at 1280 and 390, light and dark. On: toggle on, Legal name, Tax ID type + Tax ID (half-width pair at 1280, stacked at 390) between Default expense account and Notes. Off: the three fields hidden; Notes follows the toggle. The 390 off shots end at Notes (sticky footer covers its top edge): capture height, not the screen.

## Findings
- vendor-tracking-off-1280-dark: Track payments for 1099 row — the off toggle track is low-contrast on the dark background; it reads but is faint — NOTE (core toggle component, same in the reference).
- vendor-tracking-off-390-dark: same — NOTE.
- All other shots: nothing found.

BLOCKING: none. The build keeps every reference decision: toggle label left and switch right, Legal name full width with its hint, the half-width Tax ID pair at 1280 with the hint under Tax ID only, stacked at 390, and the fields removed (not greyed) when tracking is off.
