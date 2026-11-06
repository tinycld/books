# Checkpoint 4 — gate 2 critique

Scope: "Checkpoint 4 — Readers see the Trial Balance" (viewer share + the Trial Balance in core's report view with every behavior of spec §3). The sidebar entry (checkpoint 5) is out of scope. Appearance only; behavior notes go to gate 3 (last section).

Inputs read: all 40 built PNGs under `trial-balance-evidence/cp4/`, `capture.json`, all 40 reference PNGs under `trial-balance-reference/`, the spec (`docs/specs/trial-balance-design.md`), `docs/helix-lessons.md`, and for causes: `books/server/report_trial_balance.go`, `books/server/report_sources.go`, `books/tinycld/books/seed.ts`, core `server/reports/options.go`, `server/reports/detail.go`, `reports/components/ReportControls.tsx`, `reports/components/SourceChoicePicker.tsx`, `ui/sheet/index.tsx`, `components/workspace/MobileLayout.tsx`.

## 1. State check

| Shot | Shows its state? |
|---|---|
| populated-1280-light / -dark | Yes. Chips As of (End of last month · Oct 31, 2026), Rows: Non-zero, Add filter; 8 account rows in chart order; Total $35,100.00 = $35,100.00. |
| populated-390-light / -dark | Yes. Two-line rows (label, then No. · Debit · Credit); no sideways scroll of the table; Total wraps the same way. |
| opened-1280-light / -dark | Yes. Business Checking open with 3 lines labelled "<date> · JE-n · <memo>"; toolbar shows Collapse all. |
| opened-390-light / -dark | Yes. Same, two-line rows. |
| rows-all-1280-light / -dark | Yes. Rows: All; the fill rows Software Subscriptions (6200) and Software Subscriptions:Design Tools (6210) show with empty Debit/Credit. |
| rows-all-390-light / -dark | Yes (the second fill row is below the fold). |
| filtered-1280-light / -dark | Yes. Chip "Accounts: All Expense accounts" with its remove control; one row (Rent); Total $1,800.00 / $0.00. |
| filtered-390-light / -dark | Yes, with a caveat: the Accounts chip is past the right edge of the chip row, so the shot proves the filter only by its rows (Rent alone). See N3. |
| picker-1280-light / -dark | Yes. Popover under Add filter: Search, grouped options with "All <type> accounts" picks, Apply. |
| picker-390-light | **INVALID.** Only the sheet's handle and header ("Accounts", ×) are in view, resting on the tab bar; the sheet is still sliding in. What it shows is the populated table with a sheet edge. Not critiqued. (The reference shot has the same defect.) |
| picker-390-dark | Yes, partially: the sheet is in view (title, Search, Accounts receivable and Bank groups) but not at rest — its lower part, with Apply, is clipped at the host's bottom edge. Critiqued on what is visible. |
| customize-1280-light / -dark | Yes. Side panel: Number format (Divide by 1000, Without cents, Negative numbers -100/(100), red negatives), Columns (collapsed), Reset to defaults. |
| customize-390-light | **INVALID.** No Customize sheet is in view; the shot shows the populated state. (The reference shot has the same defect.) Not critiqued. |
| customize-390-dark | Yes, partially: sheet header, Number format, Divide by 1000 and a clipped Without cents; still sliding in. Critiqued on what is visible. |
| empty-1280-light / -dark, empty-390-light / -dark | Yes. "No rows as of January 1, 1900" + "Show end of last fiscal year"; chips keep As of: Jan 1, 1900. |
| empty-filtered-1280-light / -dark, empty-filtered-390-light / -dark | Yes. Same text + "Clear filters"; the Accounts chip shows (1280) or peeks at the right edge (390). |
| loading-1280-light / -dark, loading-390-light / -dark | Yes. Chips without a resolved day, "Trial Balance" header, centered spinner. |
| error-1280-light / -dark, error-390-light / -dark | Yes. "Could not load this report" + Retry. |

Why the phone sheets are mid-slide: core's Sheet keeps its content in the DOM while it animates (helix-lessons line 8), so a `waitFor` on `report-filter-options` / `report-customize` resolves before the slide ends. The sheet host is `OverlayHost name="sheet"` inside the content box (MobileLayout.tsx line 20: "Bottom sheets render here, so they rest on the tab bar rather than sliding under it"), so at rest the sheet sits on the tab bar and nothing is hidden under it. This is a capture-timing defect, not a layout defect. A rerun should wait for a node at the sheet's bottom (`report-filter-apply`, Reset to defaults) to be in the viewport.

## 2. Critique

Reference decisions the build keeps: the document header block (business name line, "Trial Balance", "As of <day in words>"), the column set Account · No. · Debit · Credit, chart order, bold account rows with a chevron, indented regular-weight lines, the heavy rule above Total and the currency symbol on totals only, fill rows without a chevron, the empty/loading/error states and their actions, the phone two-line row wrap, the chip strip and the Add filter popover/sheet. The missing Books sidebar panel in the 1280 shots is the report living at core's `/a/reports/<id>` (spec §2 "Books adds no screen and no route"), not a loss.

### BLOCKING

**B1 — picker-1280-light, picker-1280-dark, picker-390-dark: the picker's groups — listed alphabetically by type label (Accounts receivable, Bank, Credit card, Equity, …), not in chart order — BLOCKING.**
Basis: the reference decision (reference picker-1280-light lists Bank → Accounts receivable → Fixed asset → Credit card, the chart order), and the spec's order rule for the same types, §3 "Order: the chart order — account type in the order of `account_types.json` (Bank … Other expense)". The report's rows walk the types in chart order while the filter that picks among them walks them alphabetically, so the picker and the table disagree on where a type sits.
Cause: core. `core/server/reports/options.go` `optionGroups` orders groups by label text — `ORDER BY o.g <> '', <orderKey(typ, "gl")>, 1` — and `reports.OptionsFrom` (used in `report_trial_balance.go` lines 60–67: `Source`, `Value`, `Label`, `Group`, `GroupLabel`) has no group-order field, so Books cannot ask for the select's option order. The Books `type` field is a Select whose option order is the chart order; ordering a Select-typed group by option position (or an `optionsFrom.groupOrder` formula) is the core-side fix, per spec §0 "what is missing is built in core first".

### NOTE

**N1 — opened-1280-light, opened-1280-dark, opened-390-light, opened-390-dark: No. column of each opened line — repeats the account's number ("1000" on all three Business Checking lines); the reference left the line's No. blank — NOTE.**
Checked against spec §3 "No.: the account's number (read from the group record), blank when it has none" (a statement about the account row) and §4 E4 "New leaf `{ "record": "<groupId>", "path": [...] }` reads the record's fields on that level, its subtotal, **and the rows below**" — the spec authorizes the value on lines, so no rule is broken; the reference's blank was the static fixture's choice. The repetition adds a column of identical numbers under each opened account and slightly flattens the account/line hierarchy on the phone, where "1000" leads the second line of every detail row. A decision for the human: keep (spec E4) or blank it (needs a core option such as a column's detail value, since no Books formula can tell a line from its group).
Cause if blanked: core — `core/server/reports/detail.go` line 96 "record reads the group record's field on a base row: a base row is under every group, so its record is its own key" (by design); Books-side the column is `rec("byAccount", "number")` (`report_trial_balance.go` line 76).

**N2 — picker-1280-light, picker-1280-dark, picker-390-dark: group heading — truncated to "ACCOUNT…" (1280) / "ACCOUNTS R…" (390) because the "All Accounts receivable accounts" pick takes the row's width; "ACCOUNT…" cannot be told from Accounts payable later — NOTE.**
The reference truncates too ("ACCOUNTS RECEIVA…") with the shorter "All Accounts receivable" pick; the D1 template "All {group} accounts" lengthens the button and shortens the heading further.
Cause: core `reports/components/SourceChoicePicker.tsx` lines 97–98 (`numberOfLines={1}` heading in `min-w-0 flex-1` beside the pick button). A Books-side mitigation would be a shorter `GroupLabel`, but D1 fixed its wording.

**N3 — filtered-390-light, filtered-390-dark (also empty-filtered-390-light/-dark): chip strip — the Accounts chip sits past the right edge; the strip is a horizontal ScrollView with `showsHorizontalScrollIndicator={false}` and no fade, so nothing on a phone says a filter is applied until the user swipes the chips (the "Rows: No" cut at the edge is the only hint) — NOTE.**
The reference 390 filtered shot is identical, so this is inherited, not lost; no rule names it. Worth a human call because the applied filter is the one thing the filtered state has to show. (The empty-filtered state carries its own cue, "Clear filters".)
Cause: core `reports/components/ReportControls.tsx` lines 165–173.

**N4 — rows-all-1280-light, rows-all-1280-dark, rows-all-390-light, rows-all-390-dark: fill rows (Software Subscriptions, Software Subscriptions:Design Tools) — no chevron, so their label starts at the gutter, 18 px left of every other account label — NOTE.**
The reference made the same choice (its 6200 row), so not lost; listed for alignment polish only (reserve the chevron's width, or draw a disabled chevron).
Cause: core report table row rendering (ReportTable.tsx); the data side is the spec's fill (`report_trial_balance.go` `Fill`).

### Per screenshot

- populated-1280-light: nothing found.
- populated-1280-dark: nothing found.
- populated-390-light: nothing found.
- populated-390-dark: nothing found.
- opened-1280-light: No. column of opened lines — repeated account number — NOTE (N1).
- opened-1280-dark: same — NOTE (N1).
- opened-390-light: same, "1000" leads the second line of each detail row — NOTE (N1).
- opened-390-dark: same — NOTE (N1).
- rows-all-1280-light: fill-row labels left of the chevron column — NOTE (N4).
- rows-all-1280-dark: same — NOTE (N4).
- rows-all-390-light: same — NOTE (N4).
- rows-all-390-dark: same — NOTE (N4).
- filtered-1280-light: nothing found.
- filtered-1280-dark: nothing found.
- filtered-390-light: chip strip — Accounts chip off-screen — NOTE (N3).
- filtered-390-dark: same — NOTE (N3).
- picker-1280-light: group order — BLOCKING (B1); group heading truncated — NOTE (N2).
- picker-1280-dark: same — BLOCKING (B1); NOTE (N2).
- picker-390-light: INVALID.
- picker-390-dark: group order — BLOCKING (B1); group heading "ACCOUNTS R…" — NOTE (N2). Sheet not at rest (capture timing, §1).
- customize-1280-light: nothing found.
- customize-1280-dark: nothing found.
- customize-390-light: INVALID.
- customize-390-dark: nothing found in what is visible (sheet not at rest, capture timing, §1).
- empty-1280-light: nothing found.
- empty-1280-dark: nothing found.
- empty-390-light: nothing found.
- empty-390-dark: nothing found.
- empty-filtered-1280-light: nothing found.
- empty-filtered-1280-dark: nothing found.
- empty-filtered-390-light: Accounts chip peeks at the edge — NOTE (N3).
- empty-filtered-390-dark: same — NOTE (N3).
- loading-1280-light: nothing found.
- loading-1280-dark: nothing found.
- loading-390-light: nothing found.
- loading-390-dark: nothing found.
- error-1280-light: nothing found.
- error-1280-dark: nothing found.
- error-390-light: nothing found.
- error-390-dark: nothing found.

## 3. Reported claims, checked

- (a) filtered-390-dark Accounts chip off the right edge: **confirmed** in the PNG (also in -light and both empty-filtered-390 shots). The reference 390 filtered shot has the same. Filed as N3 (no rule to quote; inherited from the reference).
- (b) opened shots show "1000" on each line: **confirmed** in all four opened PNGs; the reference leaves it blank. Spec §3's No. sentence describes the account row; spec §4 E4 says the record leaf reads "the rows below", and core `detail.go` line 96 does so by design. Filed as N1 (authorized by the spec; a decision for the human, not a rule break).
- (c) picker-390-light shows only the sheet header: **confirmed**; so does the reference. The sheet is mid-slide, not hidden under the tab bar (MobileLayout.tsx line 20 hosts sheets above the tab bar). From picker-390-dark the sheet is usable on a phone: full-width title with ×, a Search field, uppercase group headings with the "All <type> accounts" pick on the right, checkbox rows with 44 px touch height. Apply is not in any phone shot, so its placement at rest is unproven; the capture should wait for `report-filter-apply` in the viewport.

## 4. For gate 3 (behavior, not appearance)

- Every built shot's document header reads "Test Organization", the organization name, not a Books business name. This is the spec's fallback ("the organization name when it is empty"): `books/tinycld/books/seed.ts` writes no `business_name` (its only `books_settings` use, line 308, reads `fiscal_year_start_month`), and `booksHeading` (`report_sources.go` lines 162–172) returns "" for a blank name. So the shots do not exercise the business-name path (spec §3 "Document header: the Books business name … through the source heading, E9"); e2e test 1 (§7) must prove it, or the capture should run after setup has set a name.
- The phone picker and customize captures resolve before the sheet is at rest (§1); the e2e that drives the phone Accounts filter (§7 test 4, phone) is the proof that Apply is reachable there.
