import type { BooksSettings } from '../types'

export type RangePreset =
    | 'this-month'
    | 'last-month'
    | 'this-quarter'
    | 'this-fiscal-year'
    | 'last-fiscal-year'

export const RANGE_PRESETS: readonly { id: RangePreset; label: string }[] = [
    { id: 'this-month', label: 'This month' },
    { id: 'last-month', label: 'Last month' },
    { id: 'this-quarter', label: 'This quarter' },
    { id: 'this-fiscal-year', label: 'This fiscal year' },
    { id: 'last-fiscal-year', label: 'Last fiscal year' },
]

export const isOtherPresetSelected = (preset: RangePreset) => preset !== 'this-fiscal-year'

export const defaultRangePreset: RangePreset = 'this-month'

export type RegisterRange = { start: string; end: string }

// Month arithmetic runs on a year * 12 + month index so no Date rollover or timezone applies.
function monthIndexOf(day: string): number {
    const [year, month] = day.split('-').map(Number)
    return year * 12 + (month - 1)
}

function pad(value: number, width: number): string {
    return String(value).padStart(width, '0')
}

function firstDayOf(monthIndex: number): string {
    const year = Math.floor(monthIndex / 12)
    return `${pad(year, 4)}-${pad((monthIndex % 12) + 1, 2)}-01`
}

function lastDayBefore(monthIndex: number): string {
    const previous = monthIndex - 1
    const year = Math.floor(previous / 12)
    const month = (previous % 12) + 1
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    const lengths = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return `${pad(year, 4)}-${pad(month, 2)}-${pad(lengths[month - 1], 2)}`
}

function fiscalYearStartIndex(todayIndex: number, startMonth: number): number {
    const year = Math.floor(todayIndex / 12)
    const month = (todayIndex % 12) + 1
    const startYear = month >= startMonth ? year : year - 1
    return startYear * 12 + (startMonth - 1)
}

export function rangeForPreset(
    preset: RangePreset,
    today: string,
    fiscalYearStartMonth: number
): RegisterRange {
    const todayIndex = monthIndexOf(today)
    const fiscalStart = fiscalYearStartIndex(todayIndex, fiscalYearStartMonth)
    switch (preset) {
        case 'this-month':
            return { start: firstDayOf(todayIndex), end: today }
        case 'last-month':
            return { start: firstDayOf(todayIndex - 1), end: lastDayBefore(todayIndex) }
        case 'this-quarter': {
            const quarterStart = fiscalStart + Math.floor((todayIndex - fiscalStart) / 3) * 3
            return { start: firstDayOf(quarterStart), end: today }
        }
        case 'this-fiscal-year':
            return { start: firstDayOf(fiscalStart), end: today }
        case 'last-fiscal-year':
            return { start: firstDayOf(fiscalStart - 12), end: lastDayBefore(fiscalStart) }
    }
}

export function monthStartOf(day: string): string {
    return firstDayOf(monthIndexOf(day))
}

export function periodOf(day: string): string {
    return monthStartOf(day).slice(0, 7)
}

export function formatDay(day: string): string {
    const [year, month, date] = day.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    })
}

export function fiscalStartMonth(
    row: Pick<BooksSettings, 'fiscal_year_start_month'> | undefined
): number {
    const value = row?.fiscal_year_start_month
    return Number.isInteger(value) && value !== undefined && value >= 1 && value <= 12 ? value : 1
}

export function todayIso(): string {
    const now = new Date()
    return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`
}
