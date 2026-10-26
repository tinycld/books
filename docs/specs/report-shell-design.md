# Report shell

## Goal
Give every Books report one frame: a Reports hub, and one report screen with a period control, a method toggle, filter chips, a Customize panel, live apply, and one table renderer that each report feeds with rows.

## Design decisions (design gate)
Approved 2026-10-26: direction C (one chip row, each control a chip with its own popover, full-width table). The human accepted the recommended answer to every open question Q1–Q13; this spec states each one.

## Where it lives
`books/tinycld/books/`:
- `screens/reports/index.tsx` — route `/a/books/reports`, the Reports hub.
- `screens/reports/[report].tsx` — route `/a/books/reports/<report id>`, the report screen. `<report id>` is a registry id (kebab-case).
- `lib/shell-nav.ts` gains a top-group sidebar entry "Reports" (icon `BarChart3`, href `books/reports`). Its `available` is computed: true when at least one report entry is available.
- `lib/report-registry.ts` — the hub sections and one entry per v0 report (id, title, one-line description, section, `available`). Every v0 report is listed now with `available: false`; the unit that builds a report sets its flag and attaches its definition. This is the pattern of `lib/shell-nav.ts`.
- `lib/report-definition.ts` — the types a report implements (see Data, "The report contract").
- `lib/report-period.ts` — period presets, preset resolution from the fiscal year start month, and month slicing for balance-row reads. It imports the month arithmetic of `lib/register-range.ts` (which exports its private helpers for this); no second copy.
- `lib/report-options.ts` — the options zod schema built from a definition, URL search-param parse and serialize, defaults.
- `lib/report-format.ts` — amount formatting under the number-format options, on top of `lib/money.ts`.
- `lib/report-rows.ts` — folding: visible rows from the model and the folded set.
- `stores/report-ui-store.ts` — folded section ids per report id and the Customize panel open flag (Zustand, not persisted).
- `hooks/useReportScreen.ts`, `hooks/useReportOptionsForm.ts`, `hooks/useReportsHub.ts`.
- `components/reports/` — ReportsHubView, ReportScreenView, ReportHeader (back link, title, toolbar), ReportDocumentHeader (business name, title, period, basis), ReportPeriodControl, ReportMethodToggle, ReportFilterChips, ReportFilterChip, ReportAccountFilterPicker, ReportCustomizePanel, ReportTable, ReportRow, ReportEmptyState.
- `help/reports.md` — help topic "Run and customize a report", linked from `help/navigating-books.md`.
- Package files import each other relatively (`../lib/x`).
- First report (Q1): the Trial Balance definition lands in this unit as the shell's first consumer (`lib/reports/trial-balance.ts`, `hooks/useTrialBalance.ts`), with the minimum body in "First report" below. `p5-trial-balance` adds what its own design gate approves on top.

## Behavior

Reports hub
- Lists available reports under section headings, in registry order: Business overview, For my accountant, Who owes you, What you owe, Sales and customers, Expenses and vendors, Taxes. A section with no available report is not drawn.
- Each report is one row: title and one-line description; a press opens the report with its default options. Rows are 44pt or taller.
- No available report: the empty state "No reports yet".
- Every user with Books read access sees the hub. Level none sees no Books screens (existing shell behavior).

Report screen — frame
- Header (outside the scroll area): back link "Reports" (to `books/reports`), the report title, and a toolbar with "Customize" and one fold button. The fold button reads "Collapse all" when any section is unfolded and "Expand all" when all are folded; it is not drawn when the model has no section rows. `p5-exports` adds its actions to this toolbar later.
- Control row (direction C), under the header and outside the table scroll area: the period chip, then the method toggle (when shown), then the filter chips, then "Add filter", in that order. Each chip opens its own core `Popover` on wide and tablet and a bottom `Sheet` on phone. On phone the row is one line that scrolls sideways when it does not fit; it never wraps. The table below uses the full width (no card around it).
- Document header above the table (spark 1), a compact strip: the business name (`books_settings.business_name`; omitted when blank), the report title, the period in words ("October 1 – October 25, 2026", or "As of October 25, 2026" for an as-of report), and the basis ("Accrual basis" or "Cash basis", only when the report has a basis). When "Divide by 1000" is on, the line "Amounts in thousands" follows.
- Unknown report id, or a report whose entry is not available: "This report does not exist" with the back link; no controls.

Period
- The period shows its value at rest: the preset name and the resolved dates ("This fiscal year to date · Jan 1 – Oct 25, 2026").
- Range reports offer these presets, limited to the ones the definition lists: Today, This month, This month to date, This quarter, This quarter to date, This fiscal year, This fiscal year to date, Last month, Last quarter, Last fiscal year, Last 12 months, Custom. Quarters and fiscal years start at `books_settings.fiscal_year_start_month` (default 1). "Today" is the device's local date (`todayIso`).
- As-of reports offer: Today, End of last month, End of last quarter, End of last fiscal year, Custom.
- Picking a preset resolves its dates and applies at once.
- From and To are core `DateField`s (typed YYYY-MM-DD or picked from the calendar). An as-of report has only one date, labelled "As of". Editing a date switches the preset to Custom. An incomplete or invalid date, From after To, or a range longer than the definition's `maxMonths` shows an inline field error, and the report keeps showing the last valid period. A valid edit applies at once.
- Day-level ranges are allowed. Reports read whole months from balance rows and the partial edge months from posted lines (`monthSlices`, see Data).

Method
- Shown only when the definition has `hasBasis: true`. Two options, Accrual and Cash, as a core `ButtonGroup`; default Accrual. A change applies at once.

Filters
- Filters are chips (spark 3). Each active filter is one chip naming the filter and its value ("Account: 1010 Operating checking", "Account: 3 accounts", "Account: All income accounts"). A press on the chip opens its picker. The chip's remove control (its own 44pt target, accessible label "Remove <filter> filter") removes the filter and applies at once.
- An "Add filter" chip opens a menu of the definition's filters that are not active; picking one opens its picker. It is not drawn when every filter is active or the definition has no filters.
- The shell implements two filter kinds: `accounts` (multi-select of active accounts in chart order, plus one choice per account group: "All asset accounts", "All liability accounts", "All equity accounts", "All income accounts", "All expense accounts") and `choice` (a fixed list from the definition). Units that add customers, vendors, or products add their own kind and picker.
- A filter picker applies when the user presses "Apply"; closing it without "Apply" changes nothing. "Apply" is disabled until at least one value is chosen, because an empty selection is not a filter.
- When filters are active and the report has no rows, the empty state offers "Clear filters".

Customize panel
- Opened by the "Customize" toolbar button; closed by its close button. Wide (desktop breakpoint): an inline core `Drawer` beside the report, so the report stays visible and updates behind it. Tablet: an overlay `Drawer` from the right. Phone: a bottom `Sheet`.
- Folding sections, the first open: "Number format", "Rows", "Columns". A section the definition does not use is not drawn ("Rows" needs `rowsChoice`; "Columns" needs `columnsBy` or `columnToggles`).
- Number format: "Divide by 1000" (Toggle), "Without cents" (Toggle), "Negative numbers" (ButtonGroup: "-100" or "(100)"), "Show negative numbers in red" (Toggle).
- Rows: "Show rows" — Active (rows with any posting in the period, or a non-zero balance), Non-zero, All. Default from the definition.
- Columns: "Display columns by" (a SelectInput of the definition's choices) and one Toggle per definition column toggle. The shell draws them; the report computes them.
- "Reset to defaults" at the bottom restores every option, period and filters included, to the definition's defaults.
- Every change applies at once. There is no Run button and no Save button.

Live apply and options state
- All options are one zod-validated form (`useForm` + `zodResolver`, mode `onChange`). The report reads the last valid values. The URL is written from the change handlers (`onValueChange` of core ButtonGroup, Toggle and SelectInput; the DateField's `onChange`; a picker's "Apply"), never from an effect.
- Options live in the route's search params, written with `router.setParams`, which replaces the current history entry: `preset` (or `from` and `to` when Custom), `basis`, `rows`, `colsBy`, `cols`, the number-format flags, and one param per active filter. Default values are left out of the URL. A copied link reopens the same report with the same options; an invalid or unknown param falls back to its default. A preset is stored by name, so "This month" in a link opened next month shows next month.
- Back from the report returns to the hub. Option changes add no history entries.
- Opening a report from the hub starts from the definition's defaults.

Report table
- The shell renders the model the report returns: columns (label, kind) and rows. One renderer serves every report, so every report formats, folds, and lays out the same way.
- Row kinds: `section` (semibold label with a fold caret; amount cells blank while unfolded), `detail` (regular), `subtotal` (semibold, `border-t border-border` above), `total` (semibold, `border-t-2 border-foreground` above; spark 2). Depth indents the label 16pt per level.
- A folded section hides its child rows and its subtotal row, and its own row shows the subtotal's amounts instead. A press on a section row (click, Enter, Space, tap) folds or unfolds it. Folded ids live in `report-ui-store` per report id for the visit; they are not persisted.
- Money cells are right aligned with tabular figures, formatted by `formatReportAmount`. Detail and section rows show bare numbers; subtotal and total rows show the currency symbol. Rounding happens once, at display, half away from zero, with integer-exact arithmetic on the whole cents (a float division near 2^53 can land on the wrong side of a half). Totals are summed in whole cents by the report before formatting, so a displayed total can differ from the sum of the displayed rounded rows. Negative style and red follow the options (red is `text-danger`).
- Percent cells show one decimal and a % sign. Text and date cells are left aligned and truncate with an ellipsis on one line.
- The column-label row stays visible while the rows scroll. Rows are 44pt and windowed (`useRowWindow`).
- Wide: the label column takes free space (minimum 220pt); amount columns are a fixed 128pt and never shrink. When the columns exceed the width, the amount columns scroll sideways and the label column stays fixed (`contentContainerStyle={{ width: '100%', minWidth }}`).
- Phone: with one or two amount columns, each amount column is a fixed 108pt and the label column takes the rest of the width; nothing scrolls sideways. With three or more, the label column is fixed at 168pt and the 128pt amount columns scroll sideways beside it, and the column-label row scrolls sideways in step with the body. Vertical scroll moves the label and amount columns together.

States
- Loading (first load, or a change whose figures are not ready): the header, document header and controls stay; the table area shows `LoadingState`. Controls stay usable.
- Error (the report's query failed): an alert region "Could not load this report" with a Retry button that calls the definition's `retry`, which runs `recoverLiveQueries` on the failed queries only. Settings or accounts failing to load shows the same alert with its own retry.
- Empty (ready with no rows): "No activity for <period in words>" on a range report, "No balances as of <date in words>" on an as-of report. The action is a core `Button` (core `EmptyState` draws its action in `text-accent`, which is too faint in light mode). When filters are active, the action is "Clear filters". Else, when the preset is not This fiscal year (End of last fiscal year for as-of reports), the action is "Show this fiscal year" ("Show end of last fiscal year"). Else there is no action.
- Access: read-only users see everything. The shell writes nothing.

First report (Q1)
- The Trial Balance is the shell's first registered report and the target of this unit's e2e. Minimum body: as-of the date, presets Today, End of last month, End of last quarter, End of last fiscal year, Custom (default End of last month); one detail row per account with a non-zero balance (Rows default Non-zero), in chart order, label "<number> <name>"; columns Debit and Credit, each account's balance on its own side; one Total row, whose Debit and Credit are equal for a balanced ledger. Asset, liability and equity accounts are cumulative to the date. Income and expense accounts run from the start of the fiscal year that holds the date; their activity before that fiscal year nets into the retained-earnings row. `hasBasis: false`. Filters: one `accounts` filter. `p5-trial-balance` refines this at its own design gate.

## Data

Reads by the shell (all on-demand; no new collection, field, migration, or endpoint):
- `books_settings` through `useBooksSettings()`: `business_name`, `fiscal_year_start_month`, `currency`.
- `books_accounts` through `useAccountOptions()` (exists): the `accounts` filter picker and chip labels. A selected account that is now inactive still shows its name on the chip; the picker offers active accounts only.
- `books_access` through `useBooksAccess()` (exists), for the hub and the screen gate.
- Report figures are read by each definition's `useReport`, never by the shell. The first report reads `books_account_balances` (balance rows, by `period` range) and posted `books_journal_lines` for the edge month, per `asOfSlices`.

The report contract (`lib/report-definition.ts`), for every later report unit:
- `ReportDefinition`: `id`, `title`, `period: { kind: 'range' | 'as-of'; presets; defaultPreset; maxMonths? }`, `hasBasis`, `rowsChoice?: { default }`, `columnsBy?: { choices; default }`, `columnToggles?: { id; label }[]`, `filters?: FilterSpec[]`, `useReport(options) → ReportResult`.
- `FilterSpec`: `{ id; label; kind: 'accounts' } | { id; label; kind: 'choice'; options }`. The union grows when a later unit adds a kind.
- `ReportOptions` (the parsed, valid options): `period: { preset; from; to }` (from is null for as-of), `basis`, `rows`, `columnsBy`, `columns` (ids of the toggles that are on), `filters` (filter id → selected values), `numberFormat: { divideBy1000; withoutCents; negative: 'minus' | 'parens'; negativeRed }`.
- `ReportResult`: `{ state: 'loading' | 'error' | 'ready'; model?: ReportModel; retry(): void }`.
- `ReportModel`: `columns: { id; label; kind: 'text' | 'date' | 'money' | 'percent' }[]`, `rows: { id; kind: 'section' | 'detail' | 'subtotal' | 'total'; depth; label; section?: string; cells: Record<columnId, number | string | null> }[]`. `section` on a row names the section row it folds under. Money cells are integer cents. Row and option types derive from these declarations and from query results; no hand-written row shapes elsewhere.
- `monthSlices(from, to)` → `{ months: { first: 'YYYY-MM'; last: 'YYYY-MM' } | null; edges: { from; to }[] }`: the whole months a report reads from `books_account_balances` and the 0–2 partial edge ranges it reads from posted `books_journal_lines`. `asOfSlices(date)` → the months before the date's month, plus the edge from the first of that month to the date. These follow ADR 0002 and the register's opening-balance pattern.

Money: integer cents through `lib/money.ts`. `formatReportAmount(cents, currency, numberFormat, { withSymbol })` divides and rounds once, half away from zero, with integer-exact arithmetic on the whole cents. A value above `maxStoredAmount` shows an error cell, never a wrong figure.

Writes: none.

## Cut
- "Run report" button: live apply replaces it.
- "Save customization" and settings remembered across visits: saved reports are v1.1 in the Books spec. A copied link keeps options.
- Header/Footer section (show or hide company name, title, date and time prepared, alignment): the document header is fixed in v0; the PDF header belongs to `p5-exports`.
- Add notes and Edit titles: not in v0 scope; titles are fixed.
- A generic Sort menu: ordering is each report's own.
- Email, print, export buttons: `p5-exports`.
- Drill-down from an amount: `p5-drill-down`.
- Logo in the on-screen header: the server PDF template carries the logo (`p2-pdf`, `p5-exports`).
- A Filter section inside Customize, and per-filter on/off checkboxes: filters live only in chips; a chip present means the filter is on.
- The "100-" negative style and "Except zero amount": two negative styles cover the use.
- Employee filter: payroll is Later.
- Week presets: no week-start setting exists.
- Folded-section state across visits.

## Platform notes
None. Every control is a core component that runs on web and native (Popover, Sheet, Drawer inline and overlay, DateField, ButtonGroup, Toggle, SelectInput, ScrollView). Section rows take Enter and Space on web and a tap on native. `web:[scrollbar-gutter:stable]` on the table scrollers is a web-only class variant that changes nothing on native.

## Sparks carried
1. Finished-document header — `ReportDocumentHeader`: `text-muted-foreground` business name, `text-lg font-semibold text-foreground` title, `text-sm text-muted-foreground` period and basis, on `bg-card`.
2. Totals by weight and rules — `font-semibold`, `border-t border-border` (subtotal), `border-t-2 border-foreground` (total); negatives in red use `text-danger`.
3. Controls show their value at rest — core `PickMenu` / `Popover` for the period, core `ButtonGroup` for the method, Books `ReportFilterChip` from `Pressable` with `bg-secondary`, `border-border`, `text-secondary-foreground` (as `GroupChip`).
No core extension.

## Non-goals
The rows, columns, filters, and comparison math of any report other than the Trial Balance minimum; cash-basis figures (the first cash-capable report, `p5-profit-and-loss`, settles how cash balances are read); exports, email, PDF; drill-down; dashboard widgets; saved or scheduled reports; a report search box in the hub; customer, vendor, or product filter kinds.
