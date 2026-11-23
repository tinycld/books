import { describe, expect, it } from 'vitest'
import {
    earliestMonth,
    monthLabels,
    periodLabel,
    periodRange,
    yearBefore,
} from '../tinycld/books/lib/dashboard-periods'
import type { PeriodId, SalesPeriodId } from '../tinycld/books/lib/dashboard-prefs'

const TODAY = '2026-11-22'

function monthsOfYear(year: number): string[] {
    return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}-01`)
}

describe('periodRange with fiscal start 1', () => {
    it('this_month is the current month', () => {
        expect(periodRange('this_month', TODAY, 1)).toEqual({
            from: '2026-11-01',
            to: '2026-11-30',
            months: ['2026-11-01'],
        })
    })

    it('last_month is October 2026', () => {
        expect(periodRange('last_month', TODAY, 1)).toEqual({
            from: '2026-10-01',
            to: '2026-10-31',
            months: ['2026-10-01'],
        })
    })

    it('this_quarter is October to December 2026', () => {
        expect(periodRange('this_quarter', TODAY, 1)).toEqual({
            from: '2026-10-01',
            to: '2026-12-31',
            months: ['2026-10-01', '2026-11-01', '2026-12-01'],
        })
    })

    it('this_fiscal_year is the twelve months of 2026', () => {
        expect(periodRange('this_fiscal_year', TODAY, 1)).toEqual({
            from: '2026-01-01',
            to: '2026-12-31',
            months: monthsOfYear(2026),
        })
    })

    it('last_fiscal_year is the twelve months of 2025', () => {
        expect(periodRange('last_fiscal_year', TODAY, 1)).toEqual({
            from: '2025-01-01',
            to: '2025-12-31',
            months: monthsOfYear(2025),
        })
    })
})

describe('periodRange with fiscal start 7', () => {
    it('this_fiscal_year runs July 2026 to June 2027', () => {
        const range = periodRange('this_fiscal_year', TODAY, 7)
        expect(range.from).toBe('2026-07-01')
        expect(range.to).toBe('2027-06-30')
        expect(range.months).toHaveLength(12)
        expect(range.months[0]).toBe('2026-07-01')
        expect(range.months[11]).toBe('2027-06-01')
    })

    it('this_quarter is October to December 2026', () => {
        expect(periodRange('this_quarter', TODAY, 7)).toEqual({
            from: '2026-10-01',
            to: '2026-12-31',
            months: ['2026-10-01', '2026-11-01', '2026-12-01'],
        })
    })

    it('with today 2026-06-15, the fiscal year is July 2025 to June 2026 and the quarter April to June 2026', () => {
        const year = periodRange('this_fiscal_year', '2026-06-15', 7)
        expect(year.from).toBe('2025-07-01')
        expect(year.to).toBe('2026-06-30')
        expect(year.months).toHaveLength(12)
        expect(periodRange('this_quarter', '2026-06-15', 7)).toEqual({
            from: '2026-04-01',
            to: '2026-06-30',
            months: ['2026-04-01', '2026-05-01', '2026-06-01'],
        })
    })

    it('last_month with today 2026-01-10 is December 2025', () => {
        expect(periodRange('last_month', '2026-01-10', 7)).toEqual({
            from: '2025-12-01',
            to: '2025-12-31',
            months: ['2025-12-01'],
        })
    })
})

describe('periodRange of the Sales periods', () => {
    it('last_6_months is June to November 2026, in order', () => {
        expect(periodRange('last_6_months', TODAY, 1)).toEqual({
            from: '2026-06-01',
            to: '2026-11-30',
            months: [
                '2026-06-01',
                '2026-07-01',
                '2026-08-01',
                '2026-09-01',
                '2026-10-01',
                '2026-11-01',
            ],
        })
    })

    it('last_12_months is December 2025 to November 2026, twelve months', () => {
        const range = periodRange('last_12_months', TODAY, 1)
        expect(range.from).toBe('2025-12-01')
        expect(range.to).toBe('2026-11-30')
        expect(range.months).toEqual(['2025-12-01', ...monthsOfYear(2026).slice(0, 11)])
    })
})

describe('the last day of a range', () => {
    it("is the month's true last day (February 2028 has 29 days)", () => {
        expect(periodRange('this_month', '2028-02-10', 1).to).toBe('2028-02-29')
        expect(periodRange('this_month', '2026-02-10', 1).to).toBe('2026-02-28')
    })
})

describe('yearBefore', () => {
    it('of October to December 2026 is October to December 2025, the same count of months', () => {
        const range = periodRange('this_quarter', TODAY, 1)
        expect(yearBefore(range)).toEqual({
            from: '2025-10-01',
            to: '2025-12-31',
            months: ['2025-10-01', '2025-11-01', '2025-12-01'],
        })
    })
})

const ALL_PERIODS: readonly (PeriodId | SalesPeriodId)[] = [
    'this_month',
    'last_month',
    'this_quarter',
    'this_fiscal_year',
    'last_fiscal_year',
    'last_6_months',
    'last_12_months',
]

function monthIndex(day: string): number {
    const [year, month] = day.split('-').map(Number)
    return year * 12 + (month - 1)
}

describe('earliestMonth', () => {
    it('is the start of the year before the last fiscal year', () => {
        expect(earliestMonth('2026-11-22', 1)).toBe('2024-01-01')
        expect(earliestMonth('2026-11-22', 7)).toBe('2024-07-01')
        expect(earliestMonth('2026-01-10', 12)).toBe('2023-12-01')
    })

    it.each([
        [TODAY, 1],
        [TODAY, 7],
        [TODAY, 12],
        ['2026-06-15', 1],
        ['2026-06-15', 7],
        ['2026-06-15', 12],
        ['2026-01-10', 1],
        ['2026-01-10', 7],
        ['2026-01-10', 12],
    ])('with today %s and fiscal start %i holds every month a widget can sum, at most 36 months back', (today, fiscalStart) => {
        const earliest = earliestMonth(today, fiscalStart)
        for (const period of ALL_PERIODS) {
            const range = periodRange(period, today, fiscalStart)
            expect(range.from >= earliest, `${period} from ${range.from}`).toBe(true)
            expect(yearBefore(range).from >= earliest, `${period} year before`).toBe(true)
        }
        expect(monthIndex(today) - monthIndex(earliest)).toBeLessThanOrEqual(36)
    })
})

describe('labels', () => {
    it('periodLabel is the preset name', () => {
        expect(periodLabel('this_fiscal_year')).toBe('This fiscal year')
        expect(periodLabel('last_6_months')).toBe('Last 6 months')
    })

    it('monthLabels gives the short and long month names', () => {
        expect(monthLabels('2026-09-01')).toEqual({ shortLabel: 'Sep', longLabel: 'Sep 2026' })
    })
})
