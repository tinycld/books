# Gate 2 critique — checkpoint 4, re-shot shots (2026-11-05)

Scope: the 12 re-shot PNGs under `trial-balance-evidence/cp4/` (opened, picker, customize at 390 and 1280, light and dark) against the reference PNGs of the same names under `trial-balance-reference/`, the spec (`docs/specs/trial-balance-design.md` §3), `docs/helix-lessons.md`, and the first critique (`cp4/critique.md`, context only). The other 28 states were not re-shot and are not re-critiqued.

## 1. State check

| Shot | Shows its state? |
|---|---|
| opened-1280-light / -dark | Yes. Business Checking open with 3 lines labelled "<date> · JE-n · <memo>"; toolbar shows Collapse all; No. blank on the lines. |
| opened-390-light / -dark | Yes. Same, two-line rows; No. blank on the lines, so each line's second row carries the amount alone. |
| picker-1280-light / -dark | Yes. Popover under Add filter: Search, groups Bank → Accounts receivable → Fixed asset → Credit card, "All <type> accounts" picks, Apply. |
| picker-390-light / -dark | Yes. Sheet at rest on the tab bar: title "Accounts" with ×, Search, the same four groups, Apply in view. (First critique's INVALID / mid-slide shots are fixed.) |
| customize-1280-light / -dark | Yes. Side panel: Number format (Divide by 1000, Without cents, Negative numbers -100 / (100), red negatives), Columns (collapsed), Reset to defaults. |
| customize-390-light / -dark | Yes. Sheet at rest on the tab bar with the same content through Reset to defaults. (First critique's INVALID / mid-slide shots are fixed.) |

No shot is INVALID.

## 2. Critique

Resolved since the first critique:

- **B1 (picker group order)** — fixed. All six picker shots list Bank, Accounts receivable, Fixed asset, Credit card, which is the chart order (spec §3 "The picker lists the type groups in chart order"). Matches the reference.
- **N1 (No. repeated on opened lines)** — fixed. All four opened shots leave No. blank on the lines (spec §3 "Opened lines leave No. blank"). Matches the reference.
- **Phone sheets mid-slide** — fixed. Both 390 picker and both 390 customize shots are at rest with Apply / Reset to defaults in view.

Reference decisions the build keeps: the document header block, Account · No. · Debit · Credit, chart order, bold account rows with a chevron, indented regular-weight lines with No. blank, the heavy rule above Total and the currency symbol on totals only, the phone two-line row wrap, the chip strip, the Add filter popover (1280) / sheet (390), the Customize side panel (1280) / sheet (390) with its sections and Reset to defaults.

### BLOCKING

**B2 — opened-1280-light, opened-1280-dark, opened-390-light, opened-390-dark: the opened account's lines — listed 2026-01-05 (JE-2), 2026-01-01 (JE-8), 2026-01-02 (JE-1): neither by date nor by entry number — BLOCKING.**
Basis: the reference decision. Reference opened-1280-light / -dark and opened-390-light list the lines in date order (2026-01-02 JE-2, 2026-01-05 JE-3, 2026-03-12 JE-6, 2026-04-01 JE-7, 2026-04-30 JE-8). A ledger detail whose lines sit in no order reads as unfinished, and the label leads with the date, so the eye expects the dates to run. Spec §3 states no line order, so the reference is the only decision; spec §5 `sort` has only group-record keys (RANK(type), `number`, `full_name`), which are equal for every line of one account, so the lines fall in storage order.
Cause: Books `report_trial_balance.go` `sort` has no key that differs between lines; a Books-side key on the line's `[date]` (then the entry number) after the group keys would order them, if core's detail order (E5 "`levels.go order` and detail order") takes a per-line key. Not seen in the first critique: its opened shots had the same order; this is a new finding, not a regression of the re-shoot.

### NOTE

**N2 (carried) — picker-1280-light, picker-1280-dark, picker-390-light, picker-390-dark: group heading "ACCOUNT…" (1280) / "ACCOUNTS R…" (390) — truncated because the "All Accounts receivable accounts" pick takes the row's width — NOTE.**
Unchanged from the first critique; the reference truncates too ("ACCOUNTS RECEIVA…") with the shorter pick label. Cause: core `reports/components/SourceChoicePicker.tsx` (`numberOfLines={1}` heading in `min-w-0 flex-1` beside the pick button).

**N5 — opened-390-light, opened-390-dark: each opened line wraps onto two rows where the second row holds only the amount (No. is now blank), so a line's label and its amount sit 44 px apart with nothing on the second row's left — NOTE.**
The reference 390 opened shot does the same (its lines also have blank No.), so nothing is lost; listed as polish. A one-line detail row when No. is blank (label left, amount right) would read tighter. Cause: core's phone row wrap (E14) wraps every row the same way.

### Per screenshot

- opened-1280-light: opened lines — not in date order — BLOCKING (B2).
- opened-1280-dark: same — BLOCKING (B2).
- opened-390-light: opened lines — not in date order — BLOCKING (B2); second row of each line holds only the amount — NOTE (N5).
- opened-390-dark: same — BLOCKING (B2); NOTE (N5).
- picker-1280-light: group heading "ACCOUNT…" truncated — NOTE (N2). Group order: fixed (B1 closed).
- picker-1280-dark: same — NOTE (N2).
- picker-390-light: group heading "ACCOUNTS R…" truncated — NOTE (N2). Sheet at rest, Apply in view.
- picker-390-dark: same — NOTE (N2).
- customize-1280-light: nothing found.
- customize-1280-dark: nothing found.
- customize-390-light: nothing found.
- customize-390-dark: nothing found.

## 3. Reported claims, checked

- Picker groups in chart order: **confirmed** in all six picker shots (Bank, Accounts receivable, Fixed asset, Credit card).
- Opened lines leave No. blank: **confirmed** in all four opened shots.
- 390 picker / customize re-captured at rest: **confirmed**; Apply (picker) and Reset to defaults (customize) are in view above the tab bar in both themes.

## 4. For gate 3 (behavior, not appearance)

- Every header still reads "Test Organization" (the organization-name fallback), as in the first critique §4; e2e test 1 (§7) must prove the business-name path.
- B2's order is a run result, so gate 3 should check what order the engine returns for detail rows when every sort key is equal, and whether the Books spec can add a line-level key.
