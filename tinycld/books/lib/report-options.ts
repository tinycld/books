import { z } from '@tinycld/core/ui/form'
import { isIsoDay } from './register-range'
import {
    DEFAULT_NUMBER_FORMAT,
    type PeriodPreset,
    type ReportBasis,
    type ReportNumberFormat,
    type ReportOptions,
    type ReportPeriod,
    type ReportSpec,
    type RowsChoice,
} from './report-definition'
import { normalizeFilters } from './report-filters'
import { monthsSpanned, type PeriodContext, resolvePreset } from './report-period'

// The form holds what the user types: any preset id, and dates that may be incomplete.
export type ReportFormValues = {
    preset: PeriodPreset
    from: string | null
    to: string | null
    basis: ReportBasis
    rows: RowsChoice
    columnsBy: string
    columnToggles: Record<string, boolean>
    filters: Record<string, string[]>
    divideBy1000: boolean
    withoutCents: boolean
    negative: 'minus' | 'parens'
    negativeRed: boolean
}

export const REPORT_PARAM_KEYS = [
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
] as const

export function filterParamKey(filterId: string): string {
    return `filter-${filterId}`
}

export type ReportParams = Record<string, string | string[] | undefined>

export type ReportParamValues = Record<string, string | undefined>

export const DATE_FORMAT_MESSAGE = 'Enter a date as YYYY-MM-DD.'
export const FROM_AFTER_TO_MESSAGE = 'From must be on or before To.'
const PRESET_MESSAGE = 'Choose a period this report offers.'
const COLUMNS_BY_MESSAGE = 'Choose a column layout this report offers.'
const BASIS_MESSAGE = 'This report shows the accrual basis only.'

export function maxMonthsMessage(months: number): string {
    return `Choose a period of ${months} months or less.`
}

const BASES: readonly ReportBasis[] = ['accrual', 'cash']
const ROWS_CHOICES: readonly RowsChoice[] = ['active', 'non-zero', 'all']
const NEGATIVE_STYLES: readonly ReportNumberFormat['negative'][] = ['minus', 'parens']
const FLAG_ON = '1'
const FLAG_OFF = '0'
const LIST_SEPARATOR = ','

function defaultPeriod(spec: ReportSpec, context: PeriodContext): ReportPeriod {
    return spec.period.kind === 'range'
        ? resolvePreset(spec.period.defaultPreset, 'range', context)
        : resolvePreset(spec.period.defaultPreset, 'as-of', context)
}

// Null when the spec does not list the preset, or for `custom`, which has no dates of its own.
function presetPeriod(
    spec: ReportSpec,
    value: string | undefined,
    context: PeriodContext
): ReportPeriod | null {
    if (spec.period.kind === 'range') {
        const preset = spec.period.presets.find(id => id === value)
        if (!preset || preset === 'custom') return null
        return resolvePreset(preset, 'range', context)
    }
    const preset = spec.period.presets.find(id => id === value)
    if (!preset || preset === 'custom') return null
    return resolvePreset(preset, 'as-of', context)
}

// Null unless the dates make a period the spec accepts.
function customPeriod(
    spec: ReportSpec,
    from: string | null | undefined,
    to: string | null | undefined
): ReportPeriod | null {
    if (!to || !isIsoDay(to)) return null
    if (spec.period.kind === 'as-of') return { kind: 'as-of', preset: 'custom', from: null, to }
    if (!from || !isIsoDay(from) || from > to) return null
    const { maxMonths } = spec.period
    if (maxMonths !== undefined && monthsSpanned(from, to) > maxMonths) return null
    return { kind: 'range', preset: 'custom', from, to }
}

function choiceDefaults(spec: ReportSpec): Omit<ReportOptions, 'period'> {
    return {
        basis: 'accrual',
        rows: spec.rowsChoice?.default ?? 'all',
        columnsBy: spec.columnsBy?.default ?? '',
        columns: [],
        filters: {},
        numberFormat: { ...DEFAULT_NUMBER_FORMAT },
    }
}

export function reportDefaults(spec: ReportSpec, context: PeriodContext): ReportOptions {
    return { period: defaultPeriod(spec, context), ...choiceDefaults(spec) }
}

function first(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value
}

function pick<T extends string>(choices: readonly T[], value: string | undefined): T | undefined {
    return choices.find(choice => choice === value)
}

function listItems(value: string | undefined): string[] {
    if (!value) return []
    return [...new Set(value.split(LIST_SEPARATOR).filter(item => item !== ''))]
}

type RawChoices = {
    basis: string | undefined
    rows: string | undefined
    columnsBy: string | undefined
    columns: readonly string[]
}

type Choices = Pick<ReportOptions, 'basis' | 'rows' | 'columnsBy' | 'columns'>

// The URL and the form both pass through here, so a value the spec does not offer
// gives the same default whichever way it arrives.
function normalizeChoices(spec: ReportSpec, raw: RawChoices): Choices {
    const defaults = choiceDefaults(spec)
    const basis = spec.hasBasis ? pick(BASES, raw.basis) : undefined
    const rows = spec.rowsChoice ? pick(ROWS_CHOICES, raw.rows) : undefined
    const columnsBy = spec.columnsBy?.choices.find(choice => choice.value === raw.columnsBy)?.value
    return {
        basis: basis ?? defaults.basis,
        rows: rows ?? defaults.rows,
        columnsBy: columnsBy ?? defaults.columnsBy,
        columns: (spec.columnToggles ?? [])
            .map(toggle => toggle.id)
            .filter(id => raw.columns.includes(id)),
    }
}

function parseFilters(spec: ReportSpec, params: ReportParams): Record<string, string[]> {
    const specs = spec.filters ?? []
    const raw = Object.fromEntries(
        specs.map(filter => [filter.id, listItems(first(params[filterParamKey(filter.id)]))])
    )
    return normalizeFilters(specs, raw)
}

function parseFlag(value: string | undefined, defaultValue: boolean): boolean {
    if (value === FLAG_ON) return true
    if (value === FLAG_OFF) return false
    return defaultValue
}

// Each flag is read against its default, so a link can turn off a flag that defaults to on.
export function parseNumberFormat(
    params: ReportParams,
    defaults: ReportNumberFormat
): ReportNumberFormat {
    return {
        divideBy1000: parseFlag(first(params.div1000), defaults.divideBy1000),
        withoutCents: parseFlag(first(params.nocents), defaults.withoutCents),
        negative: pick(NEGATIVE_STYLES, first(params.negative)) ?? defaults.negative,
        negativeRed: parseFlag(first(params.red), defaults.negativeRed),
    }
}

// Each param is checked alone, so one bad value falls back to its default and no other.
export function parseReportParams(
    spec: ReportSpec,
    params: ReportParams,
    context: PeriodContext
): ReportOptions {
    const defaults = choiceDefaults(spec)
    const period =
        customPeriod(spec, first(params.from), first(params.to)) ??
        presetPeriod(spec, first(params.preset), context) ??
        defaultPeriod(spec, context)
    return {
        period,
        ...normalizeChoices(spec, {
            basis: first(params.basis),
            rows: first(params.rows),
            columnsBy: first(params.colsBy),
            columns: listItems(first(params.cols)),
        }),
        filters: parseFilters(spec, params),
        numberFormat: parseNumberFormat(params, defaults.numberFormat),
    }
}

function changed<T>(value: T, defaultValue: T): T | undefined {
    return value === defaultValue ? undefined : value
}

function flag(on: boolean, defaultValue: boolean): string | undefined {
    if (on === defaultValue) return undefined
    return on ? FLAG_ON : FLAG_OFF
}

export function serializeNumberFormat(
    numberFormat: ReportNumberFormat,
    defaults: ReportNumberFormat
) {
    return {
        div1000: flag(numberFormat.divideBy1000, defaults.divideBy1000),
        nocents: flag(numberFormat.withoutCents, defaults.withoutCents),
        negative: changed(numberFormat.negative, defaults.negative),
        red: flag(numberFormat.negativeRed, defaults.negativeRed),
    }
}

function list(items: readonly string[] | undefined): string | undefined {
    return items?.length ? items.join(LIST_SEPARATOR) : undefined
}

// A preset is written by name, so a link re-resolves it on the day it is opened.
function periodParams(spec: ReportSpec, period: ReportPeriod): ReportParamValues {
    if (period.preset === 'custom') {
        return { preset: undefined, from: period.from ?? undefined, to: period.to }
    }
    return {
        preset: changed<string>(period.preset, spec.period.defaultPreset),
        from: undefined,
        to: undefined,
    }
}

// Every key is present; a default is undefined so `router.setParams` removes it from the URL.
// The choices are normalized first, so a value the spec does not offer is never written.
export function serializeReportParams(spec: ReportSpec, options: ReportOptions): ReportParamValues {
    const defaults = choiceDefaults(spec)
    const choices = normalizeChoices(spec, options)
    const filterParams = Object.fromEntries(
        (spec.filters ?? []).map(filter => [
            filterParamKey(filter.id),
            list(options.filters[filter.id]),
        ])
    )
    return {
        ...periodParams(spec, options.period),
        basis: changed(choices.basis, defaults.basis),
        rows: changed(choices.rows, defaults.rows),
        colsBy: changed(choices.columnsBy, defaults.columnsBy),
        cols: list(choices.columns),
        ...serializeNumberFormat(options.numberFormat, defaults.numberFormat),
        ...filterParams,
    }
}

export function formValuesFromOptions(spec: ReportSpec, options: ReportOptions): ReportFormValues {
    const columnToggles = Object.fromEntries(
        (spec.columnToggles ?? []).map(toggle => [toggle.id, options.columns.includes(toggle.id)])
    )
    return {
        preset: options.period.preset,
        from: options.period.from,
        to: options.period.to,
        basis: options.basis,
        rows: options.rows,
        columnsBy: options.columnsBy,
        columnToggles,
        filters: options.filters,
        ...options.numberFormat,
    }
}

// The values have passed `reportFormSchema`; the default period only guards a caller that skipped it.
export function optionsFromFormValues(
    spec: ReportSpec,
    values: ReportFormValues,
    context: PeriodContext
): ReportOptions {
    const period =
        values.preset === 'custom'
            ? customPeriod(spec, values.from, values.to)
            : presetPeriod(spec, values.preset, context)
    return {
        period: period ?? defaultPeriod(spec, context),
        ...normalizeChoices(spec, {
            basis: values.basis,
            rows: values.rows,
            columnsBy: values.columnsBy,
            columns: Object.keys(values.columnToggles).filter(id => values.columnToggles[id]),
        }),
        filters: normalizeFilters(spec.filters ?? [], values.filters),
        numberFormat: {
            divideBy1000: values.divideBy1000,
            withoutCents: values.withoutCents,
            negative: values.negative,
            negativeRed: values.negativeRed,
        },
    }
}

function isDay(value: string | null): value is string {
    return value !== null && isIsoDay(value)
}

export function reportFormSchema(spec: ReportSpec) {
    const presets: readonly PeriodPreset[] = spec.period.presets
    // '' is the only columnsBy a spec without columnsBy gives (choiceDefaults).
    const columnsByChoices = spec.columnsBy?.choices.map(choice => choice.value) ?? ['']
    const schema = z
        .object({
            preset: z.custom<PeriodPreset>(
                value => presets.some(preset => preset === value),
                PRESET_MESSAGE
            ),
            from: z.string().nullable(),
            to: z.string().nullable(),
            basis: z
                .enum(['accrual', 'cash'])
                .refine(basis => spec.hasBasis || basis === 'accrual', BASIS_MESSAGE),
            rows: z.enum(['active', 'non-zero', 'all']),
            columnsBy: z
                .string()
                .refine(columnsBy => columnsByChoices.includes(columnsBy), COLUMNS_BY_MESSAGE),
            columnToggles: z.record(z.string(), z.boolean()),
            filters: z.record(z.string(), z.array(z.string())),
            divideBy1000: z.boolean(),
            withoutCents: z.boolean(),
            negative: z.enum(['minus', 'parens']),
            negativeRed: z.boolean(),
        })
        .superRefine(({ preset, from, to }, ctx) => {
            // A listed preset resolves its own dates (optionsFromFormValues), so the typed
            // dates matter only for Custom; a stale bad date must not block a preset pick.
            if (preset !== 'custom') return
            if (!isDay(to)) {
                ctx.addIssue({ code: 'custom', path: ['to'], message: DATE_FORMAT_MESSAGE })
            }
            if (spec.period.kind === 'range' && !isDay(from)) {
                ctx.addIssue({ code: 'custom', path: ['from'], message: DATE_FORMAT_MESSAGE })
            }
            // An invalid date already carries its own issue; comparing it would add a second.
            if (!isDay(from) || !isDay(to)) return
            if (from > to) {
                ctx.addIssue({ code: 'custom', path: ['from'], message: FROM_AFTER_TO_MESSAGE })
                return
            }
            if (spec.period.kind !== 'range') return
            const { maxMonths } = spec.period
            if (maxMonths !== undefined && monthsSpanned(from, to) > maxMonths) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['from'],
                    message: maxMonthsMessage(maxMonths),
                })
            }
        })
    return schema satisfies z.ZodType<ReportFormValues, ReportFormValues>
}
