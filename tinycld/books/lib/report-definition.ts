// The contract every report implements. The shell owns the options, the period control,
// the filters and the table; a definition owns its spec and the hook that reads its figures.
// Money cells are integer cents.

export type PeriodKind = 'range' | 'as-of'

export type RangePeriodPreset =
    | 'today'
    | 'this-month'
    | 'this-month-to-date'
    | 'this-quarter'
    | 'this-quarter-to-date'
    | 'this-fiscal-year'
    | 'this-fiscal-year-to-date'
    | 'last-month'
    | 'last-quarter'
    | 'last-fiscal-year'
    | 'last-12-months'
    | 'custom'

export type AsOfPeriodPreset =
    | 'today'
    | 'end-of-last-month'
    | 'end-of-last-quarter'
    | 'end-of-last-fiscal-year'
    | 'custom'

export type PeriodPreset = RangePeriodPreset | AsOfPeriodPreset

export type ReportBasis = 'accrual' | 'cash'

export type RowsChoice = 'active' | 'non-zero' | 'all'

export interface ReportNumberFormat {
    divideBy1000: boolean
    withoutCents: boolean
    negative: 'minus' | 'parens'
    negativeRed: boolean
}

export const DEFAULT_NUMBER_FORMAT: ReportNumberFormat = {
    divideBy1000: false,
    withoutCents: false,
    negative: 'minus',
    negativeRed: false,
}

// A range period always has a start; an as-of period never has one. The period carries its
// kind, so a period and the kind it is read as cannot disagree.
export type RangePeriod = { kind: 'range'; preset: RangePeriodPreset; from: string; to: string }

export type AsOfPeriod = { kind: 'as-of'; preset: AsOfPeriodPreset; from: null; to: string }

export type ReportPeriod = RangePeriod | AsOfPeriod

export interface ReportOptions {
    period: ReportPeriod
    basis: ReportBasis
    rows: RowsChoice
    columnsBy: string
    columns: string[]
    filters: Record<string, string[]>
    numberFormat: ReportNumberFormat
}

export interface FilterChoiceOption {
    id: string
    label: string
}

export type FilterSpec =
    | { id: string; label: string; kind: 'accounts' }
    | { id: string; label: string; kind: 'choice'; options: FilterChoiceOption[] }

export type ReportColumnKind = 'text' | 'date' | 'money' | 'percent'

export interface ReportColumn {
    id: string
    label: string
    kind: ReportColumnKind
}

export type ReportRowKind = 'section' | 'detail' | 'subtotal' | 'total'

export type ReportCellValue = number | string | null

export interface ReportModelRow {
    id: string
    kind: ReportRowKind
    depth: number
    label: string
    section?: string
    cells: Record<string, ReportCellValue>
}

// The first column is the label column; its text comes from `row.label`.
export interface ReportModel {
    columns: ReportColumn[]
    rows: ReportModelRow[]
}

export interface ReportResult {
    state: 'loading' | 'error' | 'ready'
    model?: ReportModel
    retry(): void
}

export interface ReportSpec {
    id: string
    title: string
    period:
        | {
              kind: 'range'
              presets: readonly RangePeriodPreset[]
              defaultPreset: Exclude<RangePeriodPreset, 'custom'>
              maxMonths?: number
          }
        | {
              kind: 'as-of'
              presets: readonly AsOfPeriodPreset[]
              defaultPreset: Exclude<AsOfPeriodPreset, 'custom'>
              // An as-of report reads one date, so it has no span to limit.
              maxMonths?: never
          }
    hasBasis: boolean
    rowsChoice?: { default: RowsChoice }
    columnsBy?: { choices: { value: string; label: string }[]; default: string }
    columnToggles?: { id: string; label: string }[]
    filters?: FilterSpec[]
}

export interface ReportDefinition extends ReportSpec {
    // Options are null while the screen's prerequisites load; the report then runs no query.
    useReport(options: ReportOptions | null): ReportResult
}
