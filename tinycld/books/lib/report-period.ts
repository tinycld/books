import {
    firstDayOf,
    fiscalYearStartIndex,
    lastDayBefore,
    monthIndexOf,
    periodOf,
} from './register-range'
import type {
    AsOfPeriod,
    AsOfPeriodPreset,
    PeriodKind,
    PeriodPreset,
    RangePeriod,
    RangePeriodPreset,
    ReportPeriod,
} from './report-definition'

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
    today: 'Today',
    'this-month': 'This month',
    'this-month-to-date': 'This month to date',
    'this-quarter': 'This quarter',
    'this-quarter-to-date': 'This quarter to date',
    'this-fiscal-year': 'This fiscal year',
    'this-fiscal-year-to-date': 'This fiscal year to date',
    'last-month': 'Last month',
    'last-quarter': 'Last quarter',
    'last-fiscal-year': 'Last fiscal year',
    'last-12-months': 'Last 12 months',
    'end-of-last-month': 'End of last month',
    'end-of-last-quarter': 'End of last quarter',
    'end-of-last-fiscal-year': 'End of last fiscal year',
    custom: 'Custom',
}

export const RANGE_PRESET_IDS: readonly RangePeriodPreset[] = [
    'today',
    'this-month',
    'this-month-to-date',
    'this-quarter',
    'this-quarter-to-date',
    'this-fiscal-year',
    'this-fiscal-year-to-date',
    'last-month',
    'last-quarter',
    'last-fiscal-year',
    'last-12-months',
    'custom',
]

export const AS_OF_PRESET_IDS: readonly AsOfPeriodPreset[] = [
    'today',
    'end-of-last-month',
    'end-of-last-quarter',
    'end-of-last-fiscal-year',
    'custom',
]

export type PeriodContext = { today: string; fiscalStartMonth: number }

// Month names are local so the words do not depend on the runtime's locale or Intl data.
const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
]

function lastDayOf(monthIndex: number): string {
    return lastDayBefore(monthIndex + 1)
}

const SHORT_MONTH_NAMES = MONTH_NAMES.map(name => name.slice(0, 3))

function periodOfIndex(monthIndex: number): string {
    return firstDayOf(monthIndex).slice(0, 7)
}

type MonthMarks = { todayIndex: number; fyStart: number; quarterStart: number }

function monthMarks({ today, fiscalStartMonth }: PeriodContext): MonthMarks {
    const todayIndex = monthIndexOf(today)
    const fyStart = fiscalYearStartIndex(todayIndex, fiscalStartMonth)
    const quarterStart = fyStart + Math.floor((todayIndex - fyStart) / 3) * 3
    return { todayIndex, fyStart, quarterStart }
}

function rangeDates(
    preset: Exclude<RangePeriodPreset, 'custom'>,
    today: string,
    { todayIndex, fyStart, quarterStart }: MonthMarks
): { from: string; to: string } {
    switch (preset) {
        case 'today':
            return { from: today, to: today }
        case 'this-month':
            return { from: firstDayOf(todayIndex), to: lastDayOf(todayIndex) }
        case 'this-month-to-date':
            return { from: firstDayOf(todayIndex), to: today }
        case 'this-quarter':
            return { from: firstDayOf(quarterStart), to: lastDayOf(quarterStart + 2) }
        case 'this-quarter-to-date':
            return { from: firstDayOf(quarterStart), to: today }
        case 'this-fiscal-year':
            return { from: firstDayOf(fyStart), to: lastDayOf(fyStart + 11) }
        case 'this-fiscal-year-to-date':
            return { from: firstDayOf(fyStart), to: today }
        case 'last-month':
            return { from: firstDayOf(todayIndex - 1), to: lastDayBefore(todayIndex) }
        case 'last-quarter':
            return { from: firstDayOf(quarterStart - 3), to: lastDayBefore(quarterStart) }
        case 'last-fiscal-year':
            return { from: firstDayOf(fyStart - 12), to: lastDayBefore(fyStart) }
        case 'last-12-months':
            return { from: firstDayOf(todayIndex - 12), to: lastDayBefore(todayIndex) }
    }
}

function asOfDay(
    preset: Exclude<AsOfPeriodPreset, 'custom'>,
    today: string,
    { todayIndex, fyStart, quarterStart }: MonthMarks
): string {
    switch (preset) {
        case 'today':
            return today
        case 'end-of-last-month':
            return lastDayBefore(todayIndex)
        case 'end-of-last-quarter':
            return lastDayBefore(quarterStart)
        case 'end-of-last-fiscal-year':
            return lastDayBefore(fyStart)
    }
}

function isRangePreset(preset: string): preset is Exclude<RangePeriodPreset, 'custom'> {
    return preset !== 'custom' && (RANGE_PRESET_IDS as readonly string[]).includes(preset)
}

function isAsOfPreset(preset: string): preset is Exclude<AsOfPeriodPreset, 'custom'> {
    return preset !== 'custom' && (AS_OF_PRESET_IDS as readonly string[]).includes(preset)
}

// A preset that does not belong to the kind is a bug in a report definition, never user input.
export function resolvePreset(
    preset: Exclude<RangePeriodPreset, 'custom'>,
    kind: 'range',
    context: PeriodContext
): RangePeriod
export function resolvePreset(
    preset: Exclude<AsOfPeriodPreset, 'custom'>,
    kind: 'as-of',
    context: PeriodContext
): AsOfPeriod
export function resolvePreset(
    preset: Exclude<PeriodPreset, 'custom'>,
    kind: PeriodKind,
    context: PeriodContext
): ReportPeriod {
    const marks = monthMarks(context)
    if (kind === 'range' && isRangePreset(preset)) {
        return { kind, preset, ...rangeDates(preset, context.today, marks) }
    }
    if (kind === 'as-of' && isAsOfPreset(preset)) {
        return { kind, preset, from: null, to: asOfDay(preset, context.today, marks) }
    }
    throw new Error(`Period preset "${preset}" does not belong to kind "${kind}"`)
}

export function monthsSpanned(from: string, to: string): number {
    if (from > to) return 0
    return monthIndexOf(to) - monthIndexOf(from) + 1
}

export function fiscalYearStartOf(day: string, fiscalStartMonth: number): string {
    return firstDayOf(fiscalYearStartIndex(monthIndexOf(day), fiscalStartMonth))
}

export function previousPeriod(period: string): string {
    return periodOfIndex(monthIndexOf(period) - 1)
}

export type MonthSlices = {
    months: { first: string; last: string } | null
    edges: { from: string; to: string }[]
}

// Whole months are read from balance rows; the partial months at either end from posted lines.
export function monthSlices(from: string, to: string): MonthSlices {
    if (from > to) return { months: null, edges: [] }
    const fromIndex = monthIndexOf(from)
    const toIndex = monthIndexOf(to)
    const startsOnFirst = from === firstDayOf(fromIndex)
    const endsOnLast = to === lastDayOf(toIndex)
    const first = startsOnFirst ? fromIndex : fromIndex + 1
    const last = endsOnLast ? toIndex : toIndex - 1
    const months = first <= last ? { first: periodOfIndex(first), last: periodOfIndex(last) } : null
    const edges: { from: string; to: string }[] = []
    if (!startsOnFirst) {
        const monthEnd = lastDayOf(fromIndex)
        edges.push({ from, to: to < monthEnd ? to : monthEnd })
    }
    if (!endsOnLast && (startsOnFirst || toIndex > fromIndex)) {
        const monthStart = firstDayOf(toIndex)
        edges.push({ from: from > monthStart ? from : monthStart, to })
    }
    return { months, edges }
}

export type AsOfSlices = { through: string; edge: { from: string; to: string } | null }

export function asOfSlices(date: string): AsOfSlices {
    const index = monthIndexOf(date)
    if (date === lastDayOf(index)) return { through: periodOf(date), edge: null }
    return { through: previousPeriod(periodOf(date)), edge: { from: firstDayOf(index), to: date } }
}

function monthDayWords(day: string): string {
    return `${MONTH_NAMES[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`
}

export function dayWords(day: string): string {
    return `${monthDayWords(day)}, ${day.slice(0, 4)}`
}

function shortMonthDay(day: string): string {
    return `${SHORT_MONTH_NAMES[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`
}

function shortDay(day: string): string {
    return `${shortMonthDay(day)}, ${day.slice(0, 4)}`
}

// One date for a one-day range; the first year is dropped when both ends share it.
function rangeText(
    from: string,
    to: string,
    withYear: (day: string) => string,
    withoutYear: (day: string) => string
): string {
    if (from === to) return withYear(to)
    const start = from.slice(0, 4) === to.slice(0, 4) ? withoutYear(from) : withYear(from)
    return `${start} – ${withYear(to)}`
}

export function periodWords(period: ReportPeriod): string {
    if (period.kind === 'as-of') return `As of ${dayWords(period.to)}`
    return rangeText(period.from, period.to, dayWords, monthDayWords)
}

export function periodChipLabel(period: ReportPeriod): string {
    const dates =
        period.kind === 'as-of'
            ? shortDay(period.to)
            : rangeText(period.from, period.to, shortDay, shortMonthDay)
    return `${PERIOD_PRESET_LABELS[period.preset]} · ${dates}`
}
