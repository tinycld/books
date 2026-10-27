# Checkpoint 9 — Filter chips and account picker — gate 2 critique

Scope judged: the filter chips (value and remove control), the Add filter menu, the account picker (group heading, account rows with checkboxes, Apply that stays in view), and the empty-with-filters state with "Clear filters". The Customize button and the business-name line in the document header belong to later checkpoints and are not findings.

Known capture limit applied: the `filter-picker-390-*` shots show no checked rows (the picker remounts at the breakpoint after the actions run). The disabled Apply in those shots follows from that and is not counted.

## add-filter-1280-light
State check: VALID. Menu open under the "Add filter" chip with one item, "Account".
Findings: nothing found.

## add-filter-1280-dark
State check: VALID. Same state as light.
Findings: nothing found.

## add-filter-390-light
State check: VALID. Bottom sheet titled "Add filter" with close control and one item, "Account". The control row is one line; the "Add filter" chip is clipped at the right edge, which is the sideways-scrolling row the spec asks for.
Findings: nothing found.

## add-filter-390-dark
State check: VALID. Same state as light.
Findings: nothing found.

## filter-picker-1280-light
State check: VALID. Popover anchored under "Add filter" with the headings "Account groups" and "Accounts", the five group rows, "All expense accounts" checked, account rows in chart order, Apply enabled and outside the scroller.
Findings: nothing found.

## filter-picker-1280-dark
State check: VALID. Same state as light. Unchecked checkbox borders and the muted headings are legible on the dark popover; the checked box is primary with a primary-foreground check.
Findings: nothing found.

## filter-picker-390-light
State check: VALID for layout. Sheet titled "Account" with close control, the two headings, the group rows, the account rows, and Apply pinned above the tab bar outside the scrolling list. No checked rows (capture limit, not counted).
Findings: nothing found.

## filter-picker-390-dark
State check: VALID for layout. Same as light.
Findings: nothing found.

## empty-filtered-1280-light
State check: VALID. Chips "Custom · Jan 31, 2000" and "Account: All income accounts" with its remove control; no "Add filter" chip (the only filter is active); "No balances as of January 31, 2000" with a "Clear filters" button.
Findings: nothing found.

## empty-filtered-1280-dark
State check: VALID. Same state as light.
Findings:
- empty-filtered-1280-dark: chip row, remove control on the Account chip — the X in `muted-foreground` is low-contrast on the `bg-secondary` chip in dark mode. The reference makes the same choice and the spec names that color, so this is not a loss against the reference. — NOTE

## empty-filtered-390-light
State check: VALID. Control row on one line, the Account chip clipped at the right edge (sideways scroll), the empty message and the "Clear filters" button.
Findings: nothing found.

## empty-filtered-390-dark
State check: VALID. Same state as light.
Findings: nothing found.

## Summary
BLOCKING: 0. NOTE: 1 (dark-mode remove-control contrast, matches the reference). Every built shot keeps the reference's structure, hierarchy, and detail placement: the chips show their value at rest, the Add filter menu lists only inactive filters, the picker keeps Apply outside the scroller on both widths, and the filtered empty state offers "Clear filters".
