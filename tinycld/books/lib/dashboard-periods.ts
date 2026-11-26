// The periods of the dashboard widgets (the dashboard design spec §4 "Periods"):
// whole calendar months only, so the monthly balance rows answer every period. Month
// arithmetic runs on a year * 12 + month index of the ISO text, so no Date, time zone or
// rollover applies.

import {
    PERIOD_LABELS,
    type PeriodId,
    SALES_PERIOD_LABELS,
    type SalesPeriodId,
} from './dashboard-prefs'
import { monthStartOf, nextMonthStart } from './register-range'

// `from` and each of `months` is a month's first day; `to` is the last day of the last month.
export type MonthRange = { from: string; to: string; months: string[] }

const SHORT_MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
] as const

function monthIndexOf(day: string): number {
    const [year, month] = day.split('-').map(Number)
    return year * 12 + (month - 1)
}

// The first day of the month `index` counts.
function monthOf(index: number): string {
    const year = Math.floor(index / 12)
    const month = (index % 12) + 1
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`
}

function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

// The day before the next month's first day.
function lastDayOf(month: string): string {
    const [year, monthNumber] = month.split('-').map(Number)
    const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    const start = monthStartOf(month)
    return `${start.slice(0, 8)}${String(lengths[monthNumber - 1]).padStart(2, '0')}`
}

// `count` months from the month that holds `from`.
function rangeOf(from: string, count: number): MonthRange {
    const months: string[] = []
    let month = monthStartOf(from)
    for (let i = 0; i < count; i++) {
        months.push(month)
        month = nextMonthStart(month)
    }
    const last = months[months.length - 1]
    return { from: months[0], to: lastDayOf(last), months }
}

// The index of the first month of the fiscal year that holds today.
function fiscalYearStartIndex(todayIndex: number, fiscalStart: number): number {
    const year = Math.floor(todayIndex / 12)
    const month = (todayIndex % 12) + 1
    const startYear = month >= fiscalStart ? year : year - 1
    return startYear * 12 + (fiscalStart - 1)
}

export function periodRange(
    period: PeriodId | SalesPeriodId,
    today: string,
    fiscalStart: number
): MonthRange {
    const todayIndex = monthIndexOf(today)
    const yearStart = fiscalYearStartIndex(todayIndex, fiscalStart)
    switch (period) {
        case 'this_month':
            return rangeOf(monthOf(todayIndex), 1)
        case 'last_month':
            return rangeOf(monthOf(todayIndex - 1), 1)
        case 'this_quarter': {
            // The fiscal quarter that holds today: months counted from the fiscal start in threes.
            const quarterStart = yearStart + Math.floor((todayIndex - yearStart) / 3) * 3
            return rangeOf(monthOf(quarterStart), 3)
        }
        case 'this_fiscal_year':
            return rangeOf(monthOf(yearStart), 12)
        case 'last_fiscal_year':
            return rangeOf(monthOf(yearStart - 12), 12)
        case 'last_6_months':
            return rangeOf(monthOf(todayIndex - 5), 6)
        case 'last_12_months':
            return rangeOf(monthOf(todayIndex - 11), 12)
    }
}

// The same months one year earlier: the comparison period of Profit and loss.
export function yearBefore(range: MonthRange): MonthRange {
    return rangeOf(monthOf(monthIndexOf(range.from) - 12), range.months.length)
}

// The earliest month any period choice can sum, its year before included (plan D15): the
// start of the year before the last fiscal year, or of the year before the last 12 months
// when that is earlier. At most 35 months before today's month.
export function earliestMonth(today: string, fiscalStart: number): string {
    const todayIndex = monthIndexOf(today)
    const beforeLastFiscalYear = fiscalYearStartIndex(todayIndex, fiscalStart) - 24
    const beforeLastTwelveMonths = todayIndex - 11 - 12
    return monthOf(Math.min(beforeLastFiscalYear, beforeLastTwelveMonths))
}

const ALL_PERIOD_LABELS: Record<PeriodId | SalesPeriodId, string> = {
    ...PERIOD_LABELS,
    ...SALES_PERIOD_LABELS,
}

// The preset name; the empty text uses it in lower case.
export function periodLabel(period: PeriodId | SalesPeriodId): string {
    return ALL_PERIOD_LABELS[period]
}

// "Sep" and "Sep 2026": a fixed English table, as the app's other month text.
export function monthLabels(month: string): { shortLabel: string; longLabel: string } {
    const [year, monthNumber] = month.split('-').map(Number)
    const shortLabel = SHORT_MONTHS[monthNumber - 1]
    return { shortLabel, longLabel: `${shortLabel} ${year}` }
}
