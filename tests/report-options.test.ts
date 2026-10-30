import { describe, expect, it } from 'vitest'
import {
    DEFAULT_NUMBER_FORMAT,
    type ReportOptions,
    type ReportSpec,
} from '../tinycld/books/lib/report-definition'
import {
    DATE_FORMAT_MESSAGE,
    FROM_AFTER_TO_MESSAGE,
    filterParamKey,
    formValuesFromOptions,
    maxMonthsMessage,
    optionsFromFormValues,
    parseNumberFormat,
    parseReportParams,
    REPORT_PARAM_KEYS,
    type ReportFormValues,
    type ReportParams,
    reportDefaults,
    reportFormSchema,
    serializeNumberFormat,
    serializeReportParams,
} from '../tinycld/books/lib/report-options'
import {
    AS_OF_PRESET_IDS,
    monthsSpanned,
    RANGE_PRESET_IDS,
    resolvePreset,
} from '../tinycld/books/lib/report-period'

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
    filters: [
        { id: 'account', label: 'Account', kind: 'accounts' },
        {
            id: 'status',
            label: 'Status',
            kind: 'choice',
            options: [
                { id: 'open', label: 'Open' },
                { id: 'paid', label: 'Paid' },
            ],
        },
    ],
}

const AS_OF_SPEC: ReportSpec = {
    id: 'as-of-report',
    title: 'As-of report',
    period: { kind: 'as-of', presets: AS_OF_PRESET_IDS, defaultPreset: 'end-of-last-month' },
    hasBasis: false,
    rowsChoice: { default: 'non-zero' },
    filters: [{ id: 'account', label: 'Account', kind: 'accounts' }],
}

const NO_ROWS_SPEC: ReportSpec = {
    id: 'no-rows-report',
    title: 'No rows report',
    period: AS_OF_SPEC.period,
    hasBasis: false,
    filters: AS_OF_SPEC.filters,
}

const context = { today: '2026-10-25', fiscalStartMonth: 1 }

const AS_OF_DEFAULTS: ReportOptions = {
    period: { kind: 'as-of', preset: 'end-of-last-month', from: null, to: '2026-09-30' },
    basis: 'accrual',
    rows: 'non-zero',
    columnsBy: '',
    columns: [],
    filters: {},
    numberFormat: DEFAULT_NUMBER_FORMAT,
}

const RANGE_DEFAULTS: ReportOptions = {
    period: {
        kind: 'range',
        preset: 'this-fiscal-year-to-date',
        from: '2026-01-01',
        to: '2026-10-25',
    },
    basis: 'accrual',
    rows: 'active',
    columnsBy: 'total',
    columns: [],
    filters: {},
    numberFormat: DEFAULT_NUMBER_FORMAT,
}

const ALL_FLAGS = {
    divideBy1000: true,
    withoutCents: true,
    negative: 'parens' as const,
    negativeRed: true,
}

describe('reportDefaults and parseReportParams with no params', () => {
    it('gives the as-of defaults', () => {
        expect(reportDefaults(AS_OF_SPEC, context)).toEqual(AS_OF_DEFAULTS)
        expect(parseReportParams(AS_OF_SPEC, {}, context)).toEqual(
            reportDefaults(AS_OF_SPEC, context)
        )
    })

    it('gives the range defaults', () => {
        expect(reportDefaults(RANGE_SPEC, context)).toEqual(RANGE_DEFAULTS)
        expect(parseReportParams(RANGE_SPEC, {}, context)).toEqual(RANGE_DEFAULTS)
    })
})

describe('parseReportParams period', () => {
    it('resolves a preset by name against the context it is opened in', () => {
        expect(parseReportParams(AS_OF_SPEC, { preset: 'today' }, context).period).toEqual({
            kind: 'as-of',
            preset: 'today',
            from: null,
            to: '2026-10-25',
        })
        const later = { ...context, today: '2026-11-03' }
        expect(parseReportParams(AS_OF_SPEC, { preset: 'today' }, later).period).toEqual({
            kind: 'as-of',
            preset: 'today',
            from: null,
            to: '2026-11-03',
        })
        expect(parseReportParams(RANGE_SPEC, { preset: 'today' }, later).period).toEqual({
            kind: 'range',
            preset: 'today',
            from: '2026-11-03',
            to: '2026-11-03',
        })
    })

    it('reads a custom period of the spec kind', () => {
        expect(parseReportParams(AS_OF_SPEC, { to: '2000-01-31' }, context).period).toEqual({
            kind: 'as-of',
            preset: 'custom',
            from: null,
            to: '2000-01-31',
        })
        expect(
            parseReportParams(RANGE_SPEC, { from: '2026-01-15', to: '2026-03-02' }, context).period
        ).toEqual({ kind: 'range', preset: 'custom', from: '2026-01-15', to: '2026-03-02' })
        expect(
            parseReportParams(RANGE_SPEC, { from: '2025-10-01', to: '2026-09-30' }, context).period
        ).toEqual({ kind: 'range', preset: 'custom', from: '2025-10-01', to: '2026-09-30' })
    })

    it('falls back to the default before the year-1900 bound', () => {
        expect(parseReportParams(AS_OF_SPEC, { to: '1899-12-31' }, context).period).toEqual(
            AS_OF_DEFAULTS.period
        )
    })

    it('ignores a preset beside a valid custom date', () => {
        expect(
            parseReportParams(AS_OF_SPEC, { preset: 'today', to: '2000-01-31' }, context).period
        ).toEqual({ kind: 'as-of', preset: 'custom', from: null, to: '2000-01-31' })
        expect(
            parseReportParams(
                RANGE_SPEC,
                { preset: 'today', from: '2026-01-15', to: '2026-03-02' },
                context
            ).period
        ).toEqual({ kind: 'range', preset: 'custom', from: '2026-01-15', to: '2026-03-02' })
    })

    it('reads the first item of an array value', () => {
        expect(
            parseReportParams(RANGE_SPEC, { preset: ['today', 'this-month'] }, context).period
        ).toEqual({ kind: 'range', preset: 'today', from: '2026-10-25', to: '2026-10-25' })
    })
})

describe('parseReportParams fallbacks', () => {
    // Every option set away from its default, so one bad param shows it falls back alone.
    const RANGE_PARAMS: ReportParams = {
        basis: 'cash',
        rows: 'all',
        colsBy: 'months',
        cols: 'percent-of-income',
        div1000: '1',
        nocents: '1',
        negative: 'parens',
        red: '1',
        'filter-account': 'a1',
    }
    const RANGE_PARSED: ReportOptions = {
        period: RANGE_DEFAULTS.period,
        basis: 'cash',
        rows: 'all',
        columnsBy: 'months',
        columns: ['percent-of-income'],
        filters: { account: ['a1'] },
        numberFormat: ALL_FLAGS,
    }
    const LAST_MONTH: ReportOptions['period'] = {
        kind: 'range',
        preset: 'last-month',
        from: '2026-09-01',
        to: '2026-09-30',
    }

    it('parses the full non-default set', () => {
        expect(parseReportParams(RANGE_SPEC, RANGE_PARAMS, context)).toEqual(RANGE_PARSED)
        expect(
            parseReportParams(RANGE_SPEC, { ...RANGE_PARAMS, preset: 'last-month' }, context)
        ).toEqual({ ...RANGE_PARSED, period: LAST_MONTH })
    })

    it.each([
        ['an unknown preset', { preset: 'bogus' }],
        ['an impossible day', { from: '2026-02-01', to: '2026-02-30' }],
        ['from after to', { from: '2026-03-02', to: '2026-01-15' }],
        ['a range of 13 months', { from: '2025-09-01', to: '2026-09-30' }],
    ])('falls back to the default period for %s', (_name, periodParams) => {
        expect(
            parseReportParams(RANGE_SPEC, { ...RANGE_PARAMS, ...periodParams }, context)
        ).toEqual(RANGE_PARSED)
    })

    it.each([
        ['basis barter', { basis: 'barter' }, { basis: 'accrual' }],
        ['rows some', { rows: 'some' }, { rows: 'active' }],
        ['colsBy weeks', { colsBy: 'weeks' }, { columnsBy: 'total' }],
        [
            'cols with an unknown id',
            { cols: 'previous-year,unknown' },
            { columns: ['previous-year'] },
        ],
        [
            'negative brackets',
            { negative: 'brackets' },
            { numberFormat: { ...ALL_FLAGS, negative: 'minus' } },
        ],
        [
            'div1000 yes',
            { div1000: 'yes' },
            { numberFormat: { ...ALL_FLAGS, divideBy1000: false } },
        ],
    ] satisfies [
        string,
        ReportParams,
        Partial<ReportOptions>,
    ][])('falls back for %s and keeps the rest', (_name, bad, fallback) => {
        const params = { ...RANGE_PARAMS, preset: 'last-month', ...bad }
        expect(parseReportParams(RANGE_SPEC, params, context)).toEqual({
            ...RANGE_PARSED,
            period: LAST_MONTH,
            ...fallback,
        })
    })

    const AS_OF_PARAMS: ReportParams = { preset: 'today', rows: 'all', nocents: '1' }
    const AS_OF_PARSED: ReportOptions = {
        ...AS_OF_DEFAULTS,
        period: { kind: 'as-of', preset: 'today', from: null, to: '2026-10-25' },
        rows: 'all',
        numberFormat: { ...DEFAULT_NUMBER_FORMAT, withoutCents: true },
    }

    it('falls back for a preset the as-of spec does not list', () => {
        expect(parseReportParams(AS_OF_SPEC, AS_OF_PARAMS, context)).toEqual(AS_OF_PARSED)
        expect(
            parseReportParams(AS_OF_SPEC, { ...AS_OF_PARAMS, preset: 'this-month' }, context)
        ).toEqual({ ...AS_OF_PARSED, period: AS_OF_DEFAULTS.period })
    })

    it('falls back for a basis on a spec without basis', () => {
        expect(parseReportParams(AS_OF_SPEC, { ...AS_OF_PARAMS, basis: 'cash' }, context)).toEqual(
            AS_OF_PARSED
        )
    })
})

describe('parseReportParams filters', () => {
    it('reads one param per declared filter', () => {
        expect(
            parseReportParams(RANGE_SPEC, { 'filter-account': 'a1,group:income' }, context).filters
        ).toEqual({ account: ['a1', 'group:income'] })
        expect(parseReportParams(RANGE_SPEC, { 'filter-account': '' }, context).filters).toEqual({})
        expect(parseReportParams(RANGE_SPEC, { 'filter-account': ',' }, context).filters).toEqual(
            {}
        )
        expect(
            parseReportParams(RANGE_SPEC, { 'filter-status': 'open,void' }, context).filters
        ).toEqual({ status: ['open'] })
        expect(parseReportParams(RANGE_SPEC, { 'filter-vendor': 'v1' }, context).filters).toEqual(
            {}
        )
        expect(parseReportParams(AS_OF_SPEC, { 'filter-status': 'open' }, context).filters).toEqual(
            {}
        )
    })

    it('drops a group value that names no account group', () => {
        expect(
            parseReportParams(RANGE_SPEC, { 'filter-account': 'group:nope' }, context).filters
        ).toEqual({})
        expect(
            parseReportParams(RANGE_SPEC, { 'filter-account': 'group:nope,a1' }, context).filters
        ).toEqual({ account: ['a1'] })
    })
})

function allUndefined(spec: ReportSpec): Record<string, undefined> {
    const filterKeys = (spec.filters ?? []).map(filter => filterParamKey(filter.id))
    return Object.fromEntries([...REPORT_PARAM_KEYS, ...filterKeys].map(key => [key, undefined]))
}

describe('serializeReportParams', () => {
    it('names the param keys', () => {
        expect(REPORT_PARAM_KEYS).toEqual([
            'preset',
            'from',
            'to',
            'basis',
            'rows',
            'colsBy',
            'cols',
            'div1000',
            'nocents',
            'negative',
            'red',
        ])
        expect(filterParamKey('account')).toBe('filter-account')
    })

    it('writes every key as undefined for the defaults', () => {
        expect(serializeReportParams(RANGE_SPEC, RANGE_DEFAULTS)).toStrictEqual(
            allUndefined(RANGE_SPEC)
        )
        expect(Object.keys(allUndefined(RANGE_SPEC))).toContain('filter-status')
        expect(serializeReportParams(AS_OF_SPEC, AS_OF_DEFAULTS)).toStrictEqual(
            allUndefined(AS_OF_SPEC)
        )
    })

    it('writes the period by preset name, or as dates when custom', () => {
        const today: ReportOptions = {
            ...RANGE_DEFAULTS,
            period: { kind: 'range', preset: 'today', from: '2026-10-25', to: '2026-10-25' },
        }
        expect(serializeReportParams(RANGE_SPEC, today)).toStrictEqual({
            ...allUndefined(RANGE_SPEC),
            preset: 'today',
        })
        const customAsOf: ReportOptions = {
            ...AS_OF_DEFAULTS,
            period: { kind: 'as-of', preset: 'custom', from: null, to: '2000-01-31' },
        }
        expect(serializeReportParams(AS_OF_SPEC, customAsOf)).toStrictEqual({
            ...allUndefined(AS_OF_SPEC),
            to: '2000-01-31',
        })
        const customRange: ReportOptions = {
            ...RANGE_DEFAULTS,
            period: { kind: 'range', preset: 'custom', from: '2026-01-15', to: '2026-03-02' },
        }
        expect(serializeReportParams(RANGE_SPEC, customRange)).toStrictEqual({
            ...allUndefined(RANGE_SPEC),
            from: '2026-01-15',
            to: '2026-03-02',
        })
    })

    it('writes each non-default option', () => {
        const write = (options: Partial<ReportOptions>) =>
            serializeReportParams(RANGE_SPEC, { ...RANGE_DEFAULTS, ...options })
        const blank = allUndefined(RANGE_SPEC)
        expect(write({ basis: 'cash' })).toStrictEqual({ ...blank, basis: 'cash' })
        expect(write({ rows: 'all' })).toStrictEqual({ ...blank, rows: 'all' })
        expect(write({ columnsBy: 'months' })).toStrictEqual({ ...blank, colsBy: 'months' })
        expect(write({ columns: ['percent-of-income', 'previous-year'] })).toStrictEqual({
            ...blank,
            cols: 'percent-of-income,previous-year',
        })
        expect(write({ numberFormat: ALL_FLAGS })).toStrictEqual({
            ...blank,
            div1000: '1',
            nocents: '1',
            negative: 'parens',
            red: '1',
        })
        expect(write({ filters: { account: ['a1', 'group:income'] } })).toStrictEqual({
            ...blank,
            'filter-account': 'a1,group:income',
        })
    })

    it('never writes a basis for a spec without basis', () => {
        expect(
            serializeReportParams(AS_OF_SPEC, { ...AS_OF_DEFAULTS, basis: 'cash' })
        ).toStrictEqual(allUndefined(AS_OF_SPEC))
    })

    it('never writes rows for a spec without a rows choice', () => {
        const options: ReportOptions = {
            ...reportDefaults(NO_ROWS_SPEC, context),
            rows: 'non-zero',
        }
        expect(serializeReportParams(NO_ROWS_SPEC, options)).toStrictEqual(
            allUndefined(NO_ROWS_SPEC)
        )
    })

    it('never writes a columnsBy the spec does not offer', () => {
        expect(
            serializeReportParams(AS_OF_SPEC, { ...AS_OF_DEFAULTS, columnsBy: 'months' })
        ).toStrictEqual(allUndefined(AS_OF_SPEC))
        expect(
            serializeReportParams(RANGE_SPEC, { ...RANGE_DEFAULTS, columnsBy: 'weeks' })
        ).toStrictEqual(allUndefined(RANGE_SPEC))
    })

    it('writes only the declared column toggles', () => {
        expect(
            serializeReportParams(RANGE_SPEC, {
                ...RANGE_DEFAULTS,
                columns: ['unknown', 'previous-year'],
            })
        ).toStrictEqual({ ...allUndefined(RANGE_SPEC), cols: 'previous-year' })
    })
})

// No spec sets its own number format, so the comparison is tested with injected defaults.
describe('number-format flags against their defaults', () => {
    const ALL_ON = ALL_FLAGS
    const ALL_OFF = DEFAULT_NUMBER_FORMAT

    it('parses 1 as on, 0 as off and anything else as the default', () => {
        expect(parseNumberFormat({}, ALL_ON)).toEqual(ALL_ON)
        expect(
            parseNumberFormat({ div1000: '0', nocents: '0', negative: 'minus', red: '0' }, ALL_ON)
        ).toEqual(ALL_OFF)
        expect(
            parseNumberFormat(
                { div1000: 'yes', nocents: '', negative: 'brackets', red: 'true' },
                ALL_ON
            )
        ).toEqual(ALL_ON)
        expect(
            parseNumberFormat({ div1000: '1', nocents: '1', negative: 'parens', red: '1' }, ALL_OFF)
        ).toEqual(ALL_ON)
        expect(
            parseNumberFormat(
                { div1000: 'yes', nocents: '', negative: 'brackets', red: 'true' },
                ALL_OFF
            )
        ).toEqual(ALL_OFF)
        expect(parseNumberFormat({ div1000: '0' }, ALL_OFF)).toEqual(ALL_OFF)
    })

    it('writes 1 or 0 only for a flag that differs from its default', () => {
        expect(serializeNumberFormat(ALL_ON, ALL_ON)).toStrictEqual({
            div1000: undefined,
            nocents: undefined,
            negative: undefined,
            red: undefined,
        })
        expect(serializeNumberFormat(ALL_OFF, ALL_ON)).toStrictEqual({
            div1000: '0',
            nocents: '0',
            negative: 'minus',
            red: '0',
        })
        expect(serializeNumberFormat(ALL_ON, ALL_OFF)).toStrictEqual({
            div1000: '1',
            nocents: '1',
            negative: 'parens',
            red: '1',
        })
        const mixed = { ...ALL_ON, withoutCents: false }
        expect(serializeNumberFormat(mixed, ALL_ON)).toStrictEqual({
            div1000: undefined,
            nocents: '0',
            negative: undefined,
            red: undefined,
        })
    })

    it.each([
        ['every flag off on an all-on default', ALL_OFF, ALL_ON],
        ['one flag off on an all-on default', { ...ALL_ON, withoutCents: false }, ALL_ON],
        ['every flag on on an all-off default', ALL_ON, ALL_OFF],
    ])('keeps %s through serialize then parse', (_name, numberFormat, defaults) => {
        expect(parseNumberFormat(serializeNumberFormat(numberFormat, defaults), defaults)).toEqual(
            numberFormat
        )
    })
})

describe('serialize then parse', () => {
    const OPTION_SETS: [string, ReportSpec, ReportOptions][] = [
        ['range defaults', RANGE_SPEC, RANGE_DEFAULTS],
        [
            'a custom range on the default dates',
            RANGE_SPEC,
            {
                ...RANGE_DEFAULTS,
                period: { kind: 'range', preset: 'custom', from: '2026-01-01', to: '2026-10-25' },
            },
        ],
        [
            'a custom range with every option changed',
            RANGE_SPEC,
            {
                period: { kind: 'range', preset: 'custom', from: '2026-02-03', to: '2026-04-30' },
                basis: 'cash',
                rows: 'all',
                columnsBy: 'quarters',
                columns: ['percent-of-income', 'previous-year'],
                filters: { account: ['a1', 'group:expense'], status: ['open', 'paid'] },
                numberFormat: ALL_FLAGS,
            },
        ],
        [
            'a range preset with some options',
            RANGE_SPEC,
            {
                ...RANGE_DEFAULTS,
                period: {
                    kind: 'range',
                    preset: 'last-quarter',
                    from: '2026-07-01',
                    to: '2026-09-30',
                },
                columns: ['previous-year'],
                filters: { status: ['paid'] },
                numberFormat: { ...DEFAULT_NUMBER_FORMAT, negative: 'parens' },
            },
        ],
        [
            'a custom as-of date with filters',
            AS_OF_SPEC,
            {
                ...AS_OF_DEFAULTS,
                period: { kind: 'as-of', preset: 'custom', from: null, to: '2000-01-31' },
                rows: 'active',
                filters: { account: ['group:income', 'rpt_acct_1010'] },
                numberFormat: { ...DEFAULT_NUMBER_FORMAT, negativeRed: true },
            },
        ],
        [
            'an as-of preset',
            AS_OF_SPEC,
            {
                ...AS_OF_DEFAULTS,
                period: { kind: 'as-of', preset: 'today', from: null, to: '2026-10-25' },
                rows: 'all',
                numberFormat: { ...DEFAULT_NUMBER_FORMAT, divideBy1000: true, withoutCents: true },
            },
        ],
    ]

    it.each(OPTION_SETS)('keeps %s', (_name, spec, options) => {
        expect(parseReportParams(spec, serializeReportParams(spec, options), context)).toEqual(
            options
        )
    })
})

function schemaIssues(spec: ReportSpec, overrides: Partial<ReportFormValues>) {
    const values = { ...formValuesFromOptions(spec, reportDefaults(spec, context)), ...overrides }
    const result = reportFormSchema(spec).safeParse(values)
    if (result.success) return []
    return result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
    }))
}

describe('reportFormSchema', () => {
    it('words its messages', () => {
        expect(DATE_FORMAT_MESSAGE).toBe('Enter a date as YYYY-MM-DD.')
        expect(FROM_AFTER_TO_MESSAGE).toBe('From must be on or before To.')
        expect(maxMonthsMessage(12)).toBe('Choose a period of 12 months or less.')
    })

    it('checks the as-of date', () => {
        expect(schemaIssues(AS_OF_SPEC, { preset: 'custom', to: '2026-10-2' })).toEqual([
            { path: 'to', message: DATE_FORMAT_MESSAGE },
        ])
        expect(schemaIssues(AS_OF_SPEC, { preset: 'custom', to: null })).toEqual([
            { path: 'to', message: DATE_FORMAT_MESSAGE },
        ])
        expect(schemaIssues(AS_OF_SPEC, { preset: 'custom', to: '2026-10-25' })).toEqual([])
        const values: ReportFormValues = {
            ...formValuesFromOptions(AS_OF_SPEC, AS_OF_DEFAULTS),
            preset: 'custom',
            to: '2026-10-25',
        }
        expect(reportFormSchema(AS_OF_SPEC).parse(values)).toEqual(values)
    })

    it('checks the range dates', () => {
        expect(
            schemaIssues(RANGE_SPEC, { preset: 'custom', from: '2026-11-01', to: '2026-10-25' })
        ).toEqual([{ path: 'from', message: FROM_AFTER_TO_MESSAGE }])
        expect(
            schemaIssues(RANGE_SPEC, { preset: 'custom', from: '2025-01-01', to: '2026-10-25' })
        ).toEqual([{ path: 'from', message: 'Choose a period of 12 months or less.' }])
        const invalidFrom = schemaIssues(RANGE_SPEC, {
            preset: 'custom',
            from: '2026-13-01',
            to: '2026-10-25',
        })
        expect(invalidFrom).toContainEqual({ path: 'from', message: DATE_FORMAT_MESSAGE })
        expect(new Set(invalidFrom.map(issue => issue.path))).toEqual(new Set(['from']))
        expect(
            schemaIssues(RANGE_SPEC, { preset: 'custom', from: '2025-11-01', to: '2026-10-25' })
        ).toEqual([])
    })

    it('ignores the dates when a listed preset is picked', () => {
        expect(schemaIssues(RANGE_SPEC, { preset: 'today', to: '2026-10-2' })).toEqual([])
        expect(schemaIssues(RANGE_SPEC, { preset: 'today', to: null })).toEqual([])
        expect(schemaIssues(RANGE_SPEC, { preset: 'today', from: '2026-13-01' })).toEqual([])
        expect(
            schemaIssues(RANGE_SPEC, { preset: 'today', from: '2026-11-01', to: '2026-10-25' })
        ).toEqual([])
        expect(schemaIssues(AS_OF_SPEC, { preset: 'today', to: '2026-10-2' })).toEqual([])
        expect(schemaIssues(AS_OF_SPEC, { preset: 'today', to: null })).toEqual([])
    })

    it('does not apply maxMonths to a listed preset', () => {
        const shortSpec: ReportSpec = {
            ...RANGE_SPEC,
            period: {
                kind: 'range',
                presets: RANGE_PRESET_IDS,
                defaultPreset: 'this-month',
                maxMonths: 3,
            },
        }
        expect(RANGE_PRESET_IDS).toContain('this-fiscal-year')
        const fiscalYear = resolvePreset('this-fiscal-year', 'range', context)
        expect(monthsSpanned(fiscalYear.from, fiscalYear.to)).toBeGreaterThan(3)
        expect(
            schemaIssues(shortSpec, {
                preset: 'this-fiscal-year',
                from: fiscalYear.from,
                to: fiscalYear.to,
            })
        ).toEqual([])
        expect(
            schemaIssues(shortSpec, {
                preset: 'custom',
                from: fiscalYear.from,
                to: fiscalYear.to,
            })
        ).toEqual([{ path: 'from', message: maxMonthsMessage(3) }])
    })

    it('refuses a preset the spec does not list', () => {
        expect(schemaIssues(AS_OF_SPEC, { preset: 'this-month' }).map(i => i.path)).toEqual([
            'preset',
        ])
        expect(schemaIssues(AS_OF_SPEC, { preset: 'end-of-last-quarter' })).toEqual([])
    })

    it('refuses a columnsBy the spec does not offer', () => {
        expect(schemaIssues(RANGE_SPEC, { columnsBy: 'weeks' }).map(i => i.path)).toEqual([
            'columnsBy',
        ])
        expect(schemaIssues(AS_OF_SPEC, { columnsBy: 'months' }).map(i => i.path)).toEqual([
            'columnsBy',
        ])
        expect(schemaIssues(RANGE_SPEC, { columnsBy: 'quarters' })).toEqual([])
        expect(schemaIssues(AS_OF_SPEC, { columnsBy: '' })).toEqual([])
    })

    it('refuses a basis other than accrual on a spec without basis', () => {
        expect(schemaIssues(AS_OF_SPEC, { basis: 'cash' }).map(i => i.path)).toEqual(['basis'])
        expect(schemaIssues(AS_OF_SPEC, { basis: 'accrual' })).toEqual([])
        expect(schemaIssues(RANGE_SPEC, { basis: 'cash' })).toEqual([])
    })
})

describe('form values and options', () => {
    const CUSTOM_RANGE: ReportOptions = {
        period: { kind: 'range', preset: 'custom', from: '2026-02-03', to: '2026-04-30' },
        basis: 'cash',
        rows: 'all',
        columnsBy: 'months',
        columns: ['previous-year'],
        filters: { account: ['a1'], status: ['paid'] },
        numberFormat: ALL_FLAGS,
    }

    it('flattens the options into form values', () => {
        expect(formValuesFromOptions(RANGE_SPEC, CUSTOM_RANGE)).toEqual({
            preset: 'custom',
            from: '2026-02-03',
            to: '2026-04-30',
            basis: 'cash',
            rows: 'all',
            columnsBy: 'months',
            columnToggles: { 'percent-of-income': false, 'previous-year': true },
            filters: { account: ['a1'], status: ['paid'] },
            divideBy1000: true,
            withoutCents: true,
            negative: 'parens',
            negativeRed: true,
        } satisfies ReportFormValues)
    })

    it('turns form values back into the same options', () => {
        expect(
            optionsFromFormValues(
                RANGE_SPEC,
                formValuesFromOptions(RANGE_SPEC, CUSTOM_RANGE),
                context
            )
        ).toEqual(CUSTOM_RANGE)
        const asOfPreset: ReportOptions = {
            ...AS_OF_DEFAULTS,
            period: { kind: 'as-of', preset: 'end-of-last-quarter', from: null, to: '2026-09-30' },
        }
        expect(
            optionsFromFormValues(
                AS_OF_SPEC,
                formValuesFromOptions(AS_OF_SPEC, asOfPreset),
                context
            )
        ).toEqual(asOfPreset)
        expect(
            optionsFromFormValues(
                RANGE_SPEC,
                formValuesFromOptions(RANGE_SPEC, RANGE_DEFAULTS),
                context
            )
        ).toEqual(RANGE_DEFAULTS)
    })

    it('reads the column toggles that are on', () => {
        const values: ReportFormValues = {
            ...formValuesFromOptions(RANGE_SPEC, RANGE_DEFAULTS),
            columnToggles: { 'percent-of-income': true, 'previous-year': false },
        }
        expect(optionsFromFormValues(RANGE_SPEC, values, context).columns).toEqual([
            'percent-of-income',
        ])
    })

    it('drops undeclared column toggles and keeps the spec order', () => {
        const base = formValuesFromOptions(RANGE_SPEC, RANGE_DEFAULTS)
        const unknown: ReportFormValues = { ...base, columnToggles: { unknown: true } }
        expect(optionsFromFormValues(RANGE_SPEC, unknown, context).columns).toEqual([])
        const reversed: ReportFormValues = {
            ...base,
            columnToggles: { 'previous-year': true, 'percent-of-income': true },
        }
        expect(optionsFromFormValues(RANGE_SPEC, reversed, context).columns).toEqual([
            'percent-of-income',
            'previous-year',
        ])
    })

    it('normalizes the filters the same way the URL does', () => {
        const base = formValuesFromOptions(RANGE_SPEC, RANGE_DEFAULTS)
        const messy: ReportFormValues = {
            ...base,
            filters: { account: [], vendor: ['v1'], status: ['void', 'open', 'open'] },
        }
        expect(optionsFromFormValues(RANGE_SPEC, messy, context).filters).toEqual({
            status: ['open'],
        })
        const formFilters: ReportFormValues = {
            ...base,
            filters: { account: ['a1', 'group:nope', 'a1'], status: ['paid', 'open'] },
        }
        const urlFilters = parseReportParams(
            RANGE_SPEC,
            { 'filter-account': 'a1,group:nope,a1', 'filter-status': 'paid,open' },
            context
        ).filters
        expect(urlFilters).toEqual({ account: ['a1'], status: ['open', 'paid'] })
        expect(optionsFromFormValues(RANGE_SPEC, formFilters, context).filters).toEqual(urlFilters)
    })
})

describe('form values limited to the spec as the URL is', () => {
    function fromForm(spec: ReportSpec, overrides: Partial<ReportFormValues>) {
        const base = formValuesFromOptions(spec, reportDefaults(spec, context))
        return optionsFromFormValues(spec, { ...base, ...overrides }, context)
    }

    it('gives accrual for a basis on a spec without basis', () => {
        const fromUrl = parseReportParams(AS_OF_SPEC, { basis: 'cash' }, context)
        expect(fromUrl.basis).toBe('accrual')
        expect(fromForm(AS_OF_SPEC, { basis: 'cash' })).toEqual(fromUrl)
    })

    it('gives the default rows on a spec without a rows choice', () => {
        const fromUrl = parseReportParams(NO_ROWS_SPEC, { rows: 'non-zero' }, context)
        expect(fromUrl.rows).toBe('all')
        expect(fromForm(NO_ROWS_SPEC, { rows: 'non-zero' })).toEqual(fromUrl)
        expect(fromForm(NO_ROWS_SPEC, { rows: 'all' })).toEqual(
            parseReportParams(NO_ROWS_SPEC, { rows: 'all' }, context)
        )
    })

    it('gives the default columnsBy for a value the spec does not offer', () => {
        const fromUrl = parseReportParams(RANGE_SPEC, { colsBy: 'weeks' }, context)
        expect(fromUrl.columnsBy).toBe('total')
        expect(fromForm(RANGE_SPEC, { columnsBy: 'weeks' })).toEqual(fromUrl)
    })

    it('gives an empty columnsBy on a spec without columnsBy', () => {
        const fromUrl = parseReportParams(AS_OF_SPEC, { colsBy: 'months' }, context)
        expect(fromUrl.columnsBy).toBe('')
        expect(fromForm(AS_OF_SPEC, { columnsBy: 'months' })).toEqual(fromUrl)
    })
})
