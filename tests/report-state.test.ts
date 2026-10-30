import { describe, expect, it } from 'vitest'
import {
    DEFAULT_NUMBER_FORMAT,
    type FilterSpec,
    type ReportModel,
    type ReportModelRow,
    type ReportOptions,
    type ReportPeriod,
    type ReportRowKind,
    type ReportSpec,
} from '../tinycld/books/lib/report-definition'
import { AS_OF_PRESET_IDS, RANGE_PRESET_IDS } from '../tinycld/books/lib/report-period'
import {
    controlRowItems,
    customizeSections,
    detailRowCount,
    emptyAction,
    emptyMessage,
    reportViewState,
} from '../tinycld/books/lib/report-state'
import {
    buildTrialBalance,
    TRIAL_BALANCE_COLUMNS,
} from '../tinycld/books/lib/reports/trial-balance-rows'

const ACCOUNT_FILTER: FilterSpec = { id: 'account', label: 'Account', kind: 'accounts' }
const STATUS_FILTER: FilterSpec = {
    id: 'status',
    label: 'Status',
    kind: 'choice',
    options: [
        { id: 'open', label: 'Open' },
        { id: 'paid', label: 'Paid' },
    ],
}

const RANGE_SPEC: ReportSpec = {
    id: 'range-report',
    title: 'Range report',
    period: {
        kind: 'range',
        presets: RANGE_PRESET_IDS,
        defaultPreset: 'this-fiscal-year-to-date',
        maxMonths: 12,
    },
    hasBasis: true,
    rowsChoice: { default: 'active' },
    columnsBy: {
        choices: [
            { value: 'total', label: 'Total only' },
            { value: 'months', label: 'Months' },
            { value: 'quarters', label: 'Quarters' },
        ],
        default: 'total',
    },
    columnToggles: [
        { id: 'percent-of-income', label: '% of income' },
        { id: 'previous-year', label: 'Previous year' },
    ],
    filters: [ACCOUNT_FILTER, STATUS_FILTER],
}

const AS_OF_SPEC: ReportSpec = {
    id: 'as-of-report',
    title: 'As-of report',
    period: { kind: 'as-of', presets: AS_OF_PRESET_IDS, defaultPreset: 'end-of-last-month' },
    hasBasis: false,
    rowsChoice: { default: 'non-zero' },
    filters: [ACCOUNT_FILTER],
}

// No basis, no rows choice, no columns and no filters.
const BARE_SPEC: ReportSpec = {
    id: 'bare-report',
    title: 'Bare report',
    period: { kind: 'as-of', presets: AS_OF_PRESET_IDS, defaultPreset: 'today' },
    hasBasis: false,
}

const THIS_MONTH: ReportPeriod = {
    kind: 'range',
    preset: 'this-month',
    from: '2026-10-01',
    to: '2026-10-31',
}
const THIS_FISCAL_YEAR: ReportPeriod = {
    kind: 'range',
    preset: 'this-fiscal-year',
    from: '2026-01-01',
    to: '2026-12-31',
}
const AS_OF_CUSTOM: ReportPeriod = { kind: 'as-of', preset: 'custom', from: null, to: '2000-01-31' }
const AS_OF_END_OF_LAST_FISCAL_YEAR: ReportPeriod = {
    kind: 'as-of',
    preset: 'end-of-last-fiscal-year',
    from: null,
    to: '2025-12-31',
}

function optionsWith(period: ReportPeriod, filters: Record<string, string[]> = {}): ReportOptions {
    return {
        period,
        basis: 'accrual',
        rows: 'active',
        columnsBy: '',
        columns: [],
        filters,
        numberFormat: DEFAULT_NUMBER_FORMAT,
    }
}

describe('reportViewState', () => {
    it('is error whenever isError is set, whatever else is true', () => {
        expect(reportViewState({ isError: true, isReady: false, rowCount: 0 })).toBe('error')
        expect(reportViewState({ isError: true, isReady: true, rowCount: 0 })).toBe('error')
        expect(reportViewState({ isError: true, isReady: true, rowCount: 12 })).toBe('error')
    })

    it('is loading while not ready, whatever the row count', () => {
        expect(reportViewState({ isError: false, isReady: false, rowCount: 0 })).toBe('loading')
        expect(reportViewState({ isError: false, isReady: false, rowCount: 3 })).toBe('loading')
    })

    it('is empty when ready with no rows', () => {
        expect(reportViewState({ isError: false, isReady: true, rowCount: 0 })).toBe('empty')
    })

    it('is ready when ready with rows', () => {
        expect(reportViewState({ isError: false, isReady: true, rowCount: 1 })).toBe('ready')
        expect(reportViewState({ isError: false, isReady: true, rowCount: 40 })).toBe('ready')
    })
})

function row(id: string, kind: ReportRowKind): ReportModelRow {
    return { id, kind, depth: 0, label: id, cells: {} }
}

// A report draws its section, subtotal and total rows from its detail rows, so the empty
// state reads the detail rows alone: the Trial Balance always adds a Total row.
describe('detailRowCount', () => {
    it('is 0 with no model yet', () => {
        expect(detailRowCount(undefined)).toBe(0)
    })

    it('is 0 for a Trial Balance built from no accounts, which still has its Total row', () => {
        const model = buildTrialBalance({ rows: [], rowsChoice: 'active', filter: undefined })
        expect(model.rows.map(line => line.kind)).toEqual(['total'])
        expect(detailRowCount(model)).toBe(0)
        expect(
            reportViewState({ isError: false, isReady: true, rowCount: detailRowCount(model) })
        ).toBe('empty')
    })

    it('counts only the detail rows among section, subtotal and total rows', () => {
        const model: ReportModel = {
            columns: TRIAL_BALANCE_COLUMNS,
            rows: [
                row('assets', 'section'),
                row('bank', 'detail'),
                row('cash', 'detail'),
                row('assets-subtotal', 'subtotal'),
                row('total', 'total'),
            ],
        }
        expect(detailRowCount(model)).toBe(2)
        expect(
            reportViewState({ isError: false, isReady: true, rowCount: detailRowCount(model) })
        ).toBe('ready')
    })
})

describe('emptyMessage', () => {
    it('names the range in words for a range period', () => {
        expect(emptyMessage(THIS_MONTH)).toBe('No activity for October 1 – October 31, 2026')
    })

    it('names the date in words for an as-of period', () => {
        expect(emptyMessage(AS_OF_CUSTOM)).toBe('No balances as of January 31, 2000')
    })
})

describe('emptyAction', () => {
    const CLEAR = { kind: 'clear-filters', label: 'Clear filters' }

    it('is Clear filters when a filter is active, whatever the preset', () => {
        expect(emptyAction(RANGE_SPEC, optionsWith(THIS_MONTH, { account: ['a1'] }))).toEqual(CLEAR)
        expect(
            emptyAction(RANGE_SPEC, optionsWith(THIS_FISCAL_YEAR, { status: ['open'] }))
        ).toEqual(CLEAR)
        expect(emptyAction(AS_OF_SPEC, optionsWith(AS_OF_CUSTOM, { account: ['a1'] }))).toEqual(
            CLEAR
        )
        expect(
            emptyAction(AS_OF_SPEC, optionsWith(AS_OF_END_OF_LAST_FISCAL_YEAR, { account: ['a1'] }))
        ).toEqual(CLEAR)
    })

    it('offers this fiscal year on a range spec that is on another preset', () => {
        expect(emptyAction(RANGE_SPEC, optionsWith(THIS_MONTH))).toEqual({
            kind: 'preset',
            preset: 'this-fiscal-year',
            label: 'Show this fiscal year',
        })
    })

    it('is null on a range spec already on this fiscal year', () => {
        expect(emptyAction(RANGE_SPEC, optionsWith(THIS_FISCAL_YEAR))).toBeNull()
    })

    it('offers the end of last fiscal year on an as-of spec that is on another preset', () => {
        expect(emptyAction(AS_OF_SPEC, optionsWith(AS_OF_CUSTOM))).toEqual({
            kind: 'preset',
            preset: 'end-of-last-fiscal-year',
            label: 'Show end of last fiscal year',
        })
    })

    it('is null on an as-of spec already on the end of last fiscal year', () => {
        expect(emptyAction(AS_OF_SPEC, optionsWith(AS_OF_END_OF_LAST_FISCAL_YEAR))).toBeNull()
    })

    it('is null when the spec does not list the target preset', () => {
        const rangeWithout: ReportSpec = {
            ...RANGE_SPEC,
            period: {
                kind: 'range',
                presets: ['this-month', 'last-month', 'custom'],
                defaultPreset: 'this-month',
            },
        }
        const asOfWithout: ReportSpec = {
            ...AS_OF_SPEC,
            period: {
                kind: 'as-of',
                presets: ['today', 'end-of-last-month', 'custom'],
                defaultPreset: 'end-of-last-month',
            },
        }
        expect(emptyAction(rangeWithout, optionsWith(THIS_MONTH))).toBeNull()
        expect(emptyAction(asOfWithout, optionsWith(AS_OF_CUSTOM))).toBeNull()
    })

    it('does not count a filter with no values as active', () => {
        expect(emptyAction(RANGE_SPEC, optionsWith(THIS_MONTH, { account: [] }))).toEqual({
            kind: 'preset',
            preset: 'this-fiscal-year',
            label: 'Show this fiscal year',
        })
        expect(emptyAction(RANGE_SPEC, optionsWith(THIS_FISCAL_YEAR, { account: [] }))).toBeNull()
    })
})

describe('controlRowItems', () => {
    it('gives period, method and add-filter on the range spec with no filter active', () => {
        expect(controlRowItems(RANGE_SPEC, optionsWith(THIS_MONTH))).toEqual([
            { kind: 'period' },
            { kind: 'method' },
            { kind: 'add-filter' },
        ])
    })

    it('puts an active filter between the method and add-filter', () => {
        expect(controlRowItems(RANGE_SPEC, optionsWith(THIS_MONTH, { account: ['a1'] }))).toEqual([
            { kind: 'period' },
            { kind: 'method' },
            { kind: 'filter', filter: ACCOUNT_FILTER },
            { kind: 'add-filter' },
        ])
    })

    it('drops add-filter when every filter is active, and keeps spec order', () => {
        expect(
            controlRowItems(
                RANGE_SPEC,
                optionsWith(THIS_MONTH, { status: ['open'], account: ['a1'] })
            )
        ).toEqual([
            { kind: 'period' },
            { kind: 'method' },
            { kind: 'filter', filter: ACCOUNT_FILTER },
            { kind: 'filter', filter: STATUS_FILTER },
        ])
    })

    it('has no method on the as-of spec, which has no basis', () => {
        expect(controlRowItems(AS_OF_SPEC, optionsWith(AS_OF_CUSTOM))).toEqual([
            { kind: 'period' },
            { kind: 'add-filter' },
        ])
    })

    it('gives the period alone on a spec with no basis and no filters', () => {
        expect(controlRowItems(BARE_SPEC, optionsWith(AS_OF_CUSTOM))).toEqual([{ kind: 'period' }])
    })
})

describe('customizeSections', () => {
    it('gives number-format, rows and columns on the range spec', () => {
        expect(customizeSections(RANGE_SPEC)).toEqual(['number-format', 'rows', 'columns'])
    })

    it('gives number-format and rows on the as-of spec', () => {
        expect(customizeSections(AS_OF_SPEC)).toEqual(['number-format', 'rows'])
    })

    it('gives number-format alone on the bare spec', () => {
        expect(customizeSections(BARE_SPEC)).toEqual(['number-format'])
    })

    it('gives columns for column toggles alone, but not for an empty toggle list', () => {
        const togglesOnly: ReportSpec = {
            ...BARE_SPEC,
            columnToggles: [{ id: 'previous-year', label: 'Previous year' }],
        }
        const emptyToggles: ReportSpec = { ...BARE_SPEC, columnToggles: [] }
        expect(customizeSections(togglesOnly)).toEqual(['number-format', 'columns'])
        expect(customizeSections(emptyToggles)).toEqual(['number-format'])
    })
})
