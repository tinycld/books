# Checkpoint 7 — design critique (gate 2)

Scope: the period chip and popover (preset pills, the As-of field and its inline error), the phone bottom sheet, and the method toggle where it can show. The table, Customize, Add filter and the header toolbar come in later checkpoints (cp8, cp9, cp10) and are not findings.

## State check

| Shot | Shows the named state? |
|---|---|
| period-1280-light | Yes. Popover open under the chip, "End of last month" selected, As of 2026-09-30. |
| period-1280-dark | Yes. Same state, dark theme. |
| period-390-light | Yes. Bottom sheet "Report period", pills wrap onto three lines, As of below. |
| period-390-dark | Yes. Same state, dark theme. |
| invalid-date-1280-light | Yes. As of 2026-02-30, "Custom" selected, error "Enter a date as YYYY-MM-DD.", chip keeps "End of last month · Sep 30, 2026". |
| invalid-date-1280-dark | Yes. Same state, dark theme. |
| invalid-date-390-light | Yes. Sheet with the error under the As of field, "Custom" selected, chip keeps the last valid period. |
| invalid-date-390-dark | Yes. Same state, dark theme. |

No shot is INVALID.

## Findings

period-1280-light: nothing found. Structure matches the reference (360pt popover anchored under the chip, wrapping 44pt pills, selected pill filled `bg-primary`, As of label and DateField below). The business name and table are absent by data and by scope.

period-1280-dark: nothing found. Popover surface, pill borders, selected pill and field text are legible.

period-390-light: nothing found. Sheet title "Report period" and close control match the reference; pills wrap with no overflow at 390; the sheet sits above the tab bar as in the reference.

period-390-dark: nothing found.

invalid-date-1280-light: nothing found. The error is inline under the field in `text-xs text-danger`, "Custom" is selected and the chip keeps the last valid period — this is the reference decision ("Custom" selected while the chip still shows the last valid preset) and the spec text ("shows an inline field error, and the report keeps showing the last valid period").

invalid-date-1280-dark: nothing found. Error text is legible on the dark surface.

invalid-date-390-light: nothing found. The sheet grows to hold the error; the error stays inside the sheet above the tab bar.

invalid-date-390-dark: nothing found.

Coverage, not a finding: the method toggle cannot show on the Trial Balance (`hasBasis: false`), so no cp7 shot gives visual evidence of `ReportMethodToggle`. The code uses core `ButtonGroup` with Accrual / Cash as the spec states. Its look must be judged when the first `hasBasis: true` report lands. — NOTE

Design-system check of the delivered files (`ReportPeriodControl.tsx`, `ReportMethodToggle.tsx`): no raw hex, semantic tokens only, pills built above the JSX return, visibility by early `null` return in `FieldError`. Clean.

## Verdict

Pass. No BLOCKING findings. One NOTE (method toggle unseen on this report).
