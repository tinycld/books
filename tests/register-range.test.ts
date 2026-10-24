import { describe, expect, it } from 'vitest'
import {
    defaultRangePreset,
    fiscalStartMonth,
    formatDay,
    isOtherPresetSelected,
    monthStartOf,
    nextMonthStart,
    periodOf,
    RANGE_PRESETS,
    rangeForPreset,
} from '../tinycld/books/lib/register-range'

describe('rangeForPreset, fiscal year starting in January', () => {
    const today = '2026-10-23'

    it.each([
        ['this-month', '2026-10-01', '2026-10-23'],
        ['last-month', '2026-09-01', '2026-09-30'],
        ['this-quarter', '2026-10-01', '2026-10-23'],
        ['this-fiscal-year', '2026-01-01', '2026-10-23'],
        ['last-fiscal-year', '2025-01-01', '2025-12-31'],
    ] as const)('%s', (preset, start, end) => {
        expect(rangeForPreset(preset, today, 1)).toEqual({ start, end })
    })
})

describe('rangeForPreset, fiscal year starting in September', () => {
    it('this-fiscal-year starts on the latest September 1', () => {
        expect(rangeForPreset('this-fiscal-year', '2026-10-23', 9)).toEqual({
            start: '2026-09-01',
            end: '2026-10-23',
        })
    })

    it('last-fiscal-year ends the day before the current fiscal year', () => {
        expect(rangeForPreset('last-fiscal-year', '2026-10-23', 9)).toEqual({
            start: '2025-09-01',
            end: '2026-08-31',
        })
    })

    it('this-quarter counts quarters from the fiscal start', () => {
        expect(rangeForPreset('this-quarter', '2026-10-23', 9)).toEqual({
            start: '2026-09-01',
            end: '2026-10-23',
        })
    })

    it('starts a new quarter on the first day of its month', () => {
        expect(rangeForPreset('this-quarter', '2026-12-01', 9).start).toBe('2026-12-01')
    })

    it('uses the previous calendar year when today is before the start month', () => {
        expect(rangeForPreset('this-fiscal-year', '2026-03-10', 9).start).toBe('2025-09-01')
        expect(rangeForPreset('this-quarter', '2026-03-10', 9).start).toBe('2026-03-01')
    })
})

describe('rangeForPreset last-month', () => {
    it('crosses a year boundary', () => {
        expect(rangeForPreset('last-month', '2026-01-15', 1)).toEqual({
            start: '2025-12-01',
            end: '2025-12-31',
        })
    })

    it('ends on February 28 in a common year', () => {
        expect(rangeForPreset('last-month', '2026-03-31', 1)).toEqual({
            start: '2026-02-01',
            end: '2026-02-28',
        })
    })

    it('ends on February 29 in a leap year', () => {
        expect(rangeForPreset('last-month', '2028-03-05', 1).end).toBe('2028-02-29')
    })
})

describe('presets list', () => {
    it('lists the labels in spec order', () => {
        expect(RANGE_PRESETS).toEqual([
            { id: 'this-month', label: 'This month' },
            { id: 'last-month', label: 'Last month' },
            { id: 'this-quarter', label: 'This quarter' },
            { id: 'this-fiscal-year', label: 'This fiscal year' },
            { id: 'last-fiscal-year', label: 'Last fiscal year' },
        ])
    })

    it('defaults to this month', () => {
        expect(defaultRangePreset).toBe('this-month')
    })
})

describe('fiscalStartMonth', () => {
    it('is 1 when settings are missing', () => {
        expect(fiscalStartMonth(undefined)).toBe(1)
    })

    it('returns a valid stored month', () => {
        expect(fiscalStartMonth({ fiscal_year_start_month: 9 })).toBe(9)
    })

    it('falls back to 1 for a fractional month', () => {
        expect(fiscalStartMonth({ fiscal_year_start_month: 1.5 })).toBe(1)
    })

    it.each([0, 13])('falls back to 1 for %s', value => {
        expect(fiscalStartMonth({ fiscal_year_start_month: value })).toBe(1)
    })
})

describe('day helpers', () => {
    it('monthStartOf', () => {
        expect(monthStartOf('2026-10-17')).toBe('2026-10-01')
    })

    it('periodOf', () => {
        expect(periodOf('2026-10-23')).toBe('2026-10')
    })

    it('formatDay', () => {
        expect(formatDay('2026-10-23')).toBe('Oct 23, 2026')
    })
})

describe('isOtherPresetSelected', () => {
    it('is false for this-fiscal-year', () => {
        expect(isOtherPresetSelected('this-fiscal-year')).toBe(false)
    })

    it.each([
        'this-month',
        'last-month',
        'this-quarter',
        'last-fiscal-year',
    ] as const)('is true for %s', preset => {
        expect(isOtherPresetSelected(preset)).toBe(true)
    })
})

describe('nextMonthStart', () => {
    it.each([
        ['2026-10-15', '2026-11-01'],
        ['2026-10-31', '2026-11-01'],
        ['2026-12-15', '2027-01-01'],
        ['2026-12-31', '2027-01-01'],
        ['2026-01-31', '2026-02-01'],
    ])('%s -> %s', (day, expected) => {
        expect(nextMonthStart(day)).toBe(expected)
    })
})
