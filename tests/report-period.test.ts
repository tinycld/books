import { describe, expect, it } from 'vitest'
import { isIsoDay } from '../tinycld/books/lib/register-range'
import {
    AS_OF_PRESET_IDS,
    asOfSlices,
    dayWords,
    fiscalYearStartOf,
    monthSlices,
    monthsSpanned,
    PERIOD_PRESET_LABELS,
    periodChipLabel,
    periodWords,
    previousPeriod,
    RANGE_PRESET_IDS,
    resolvePreset,
} from '../tinycld/books/lib/report-period'

describe('resolvePreset, range kind, fiscal year starting in January', () => {
    const context = { today: '2026-10-25', fiscalStartMonth: 1 }

    it.each([
        ['today', '2026-10-25', '2026-10-25'],
        ['this-month', '2026-10-01', '2026-10-31'],
        ['this-month-to-date', '2026-10-01', '2026-10-25'],
        ['this-quarter', '2026-10-01', '2026-12-31'],
        ['this-quarter-to-date', '2026-10-01', '2026-10-25'],
        ['this-fiscal-year', '2026-01-01', '2026-12-31'],
        ['this-fiscal-year-to-date', '2026-01-01', '2026-10-25'],
        ['last-month', '2026-09-01', '2026-09-30'],
        ['last-quarter', '2026-07-01', '2026-09-30'],
        ['last-fiscal-year', '2025-01-01', '2025-12-31'],
        ['last-12-months', '2025-10-01', '2026-09-30'],
    ] as const)('%s is %s to %s', (preset, from, to) => {
        expect(resolvePreset(preset, 'range', context)).toEqual({ kind: 'range', preset, from, to })
    })
})

describe('resolvePreset, range kind, other fiscal year starts', () => {
    const july = { today: '2026-10-25', fiscalStartMonth: 7 }

    it.each([
        ['this-quarter', '2026-10-01', '2026-12-31'],
        ['this-fiscal-year', '2026-07-01', '2027-06-30'],
        ['last-quarter', '2026-07-01', '2026-09-30'],
        ['last-fiscal-year', '2025-07-01', '2026-06-30'],
    ] as const)('start month 7: %s is %s to %s', (preset, from, to) => {
        expect(resolvePreset(preset, 'range', july)).toEqual({ kind: 'range', preset, from, to })
    })

    it('start month 9 on 2026-03-10: the fiscal year to date starts on 2025-09-01', () => {
        const september = { today: '2026-03-10', fiscalStartMonth: 9 }
        expect(resolvePreset('this-fiscal-year-to-date', 'range', september)).toEqual({
            kind: 'range',
            preset: 'this-fiscal-year-to-date',
            from: '2025-09-01',
            to: '2026-03-10',
        })
    })

    it('start month 9 on 2026-03-10: this quarter is 2026-03-01 to 2026-05-31', () => {
        const september = { today: '2026-03-10', fiscalStartMonth: 9 }
        expect(resolvePreset('this-quarter', 'range', september)).toEqual({
            kind: 'range',
            preset: 'this-quarter',
            from: '2026-03-01',
            to: '2026-05-31',
        })
    })
})

describe('resolvePreset, as-of kind', () => {
    const january = { today: '2026-10-25', fiscalStartMonth: 1 }

    it.each([
        ['today', '2026-10-25'],
        ['end-of-last-month', '2026-09-30'],
        ['end-of-last-quarter', '2026-09-30'],
        ['end-of-last-fiscal-year', '2025-12-31'],
    ] as const)('start month 1: %s is as of %s with no from', (preset, to) => {
        expect(resolvePreset(preset, 'as-of', january)).toEqual({
            kind: 'as-of',
            preset,
            from: null,
            to,
        })
    })

    it('start month 7: end of last fiscal year is 2026-06-30', () => {
        expect(
            resolvePreset('end-of-last-fiscal-year', 'as-of', {
                today: '2026-10-25',
                fiscalStartMonth: 7,
            })
        ).toEqual({
            kind: 'as-of',
            preset: 'end-of-last-fiscal-year',
            from: null,
            to: '2026-06-30',
        })
    })

    it('end of last month on 2028-03-05 is the leap day 2028-02-29', () => {
        expect(
            resolvePreset('end-of-last-month', 'as-of', {
                today: '2028-03-05',
                fiscalStartMonth: 1,
            })
        ).toEqual({
            kind: 'as-of',
            preset: 'end-of-last-month',
            from: null,
            to: '2028-02-29',
        })
    })

    it('end of last month on 2026-01-15 is 2025-12-31', () => {
        expect(
            resolvePreset('end-of-last-month', 'as-of', {
                today: '2026-01-15',
                fiscalStartMonth: 1,
            })
        ).toEqual({
            kind: 'as-of',
            preset: 'end-of-last-month',
            from: null,
            to: '2025-12-31',
        })
    })
})

describe('resolvePreset, a preset that does not match the kind', () => {
    const context = { today: '2026-10-25', fiscalStartMonth: 1 }

    it('refuses a range preset for an as-of report, naming the preset and kind', () => {
        expect(() => resolvePreset('this-month' as never, 'as-of', context)).toThrow(
            /this-month[\s\S]*as-of|as-of[\s\S]*this-month/
        )
    })

    it('refuses an as-of preset for a range report, naming the preset and kind', () => {
        expect(() => resolvePreset('end-of-last-month' as never, 'range', context)).toThrow(
            /end-of-last-month[\s\S]*range|range[\s\S]*end-of-last-month/
        )
    })
})

describe('preset ids and labels', () => {
    it('range presets read in the spec order, Custom last', () => {
        expect(RANGE_PRESET_IDS.map(id => PERIOD_PRESET_LABELS[id])).toEqual([
            'Today',
            'This month',
            'This month to date',
            'This quarter',
            'This quarter to date',
            'This fiscal year',
            'This fiscal year to date',
            'Last month',
            'Last quarter',
            'Last fiscal year',
            'Last 12 months',
            'Custom',
        ])
    })

    it('as-of presets read in the spec order, Custom last', () => {
        expect(AS_OF_PRESET_IDS.map(id => PERIOD_PRESET_LABELS[id])).toEqual([
            'Today',
            'End of last month',
            'End of last quarter',
            'End of last fiscal year',
            'Custom',
        ])
    })
})

describe('isIsoDay', () => {
    it.each(['2026-02-28', '2028-02-29'])('%s is a real day', text => {
        expect(isIsoDay(text)).toBe(true)
    })

    it.each([
        '2026-02-29',
        '2026-13-01',
        '2026-1-01',
        '2026-10-251',
        '',
        '20261025',
    ])('"%s" is not a day', text => {
        expect(isIsoDay(text)).toBe(false)
    })
})

describe('isIsoDay, a real calendar day from the year 1900 on', () => {
    it.each([
        ['2026-02-28', true],
        ['2026-10-25', true],
        ['2026-12-31', true],
        ['2026-01-01', true],
        ['2028-02-29', true],
        ['2024-02-29', true],
        ['2000-02-29', true],
        ['1900-01-01', true],
        ['9999-12-31', true],
        ['1899-12-31', false],
        ['0026-10-25', false],
        ['2026-02-29', false],
        ['2025-02-29', false],
        ['2100-02-29', false],
        ['2026-13-01', false],
        ['2026-02-30', false],
        ['2025-12-00', false],
        ['', false],
        ['2026-1-01', false],
        ['31/12/2025', false],
    ] as const)('"%s" is a real day: %s', (text, real) => {
        expect(isIsoDay(text)).toBe(real)
    })
})

describe('monthsSpanned', () => {
    it.each([
        ['2026-01-15', '2026-03-02', 3],
        ['2026-10-01', '2026-10-31', 1],
        ['2025-11-01', '2026-10-31', 12],
    ] as const)('%s to %s touches %i months', (from, to, months) => {
        expect(monthsSpanned(from, to)).toBe(months)
    })
})

describe('monthsSpanned, inverted range', () => {
    it('a range whose from is after its to spans no months', () => {
        expect(monthsSpanned('2026-10-20', '2026-10-05')).toBe(0)
    })
})

describe('monthSlices', () => {
    it('whole months only: months and no edges', () => {
        expect(monthSlices('2026-01-01', '2026-10-31')).toEqual({
            months: { first: '2026-01', last: '2026-10' },
            edges: [],
        })
    })

    it('partial months at both ends: whole months between and two edges', () => {
        expect(monthSlices('2026-01-15', '2026-10-20')).toEqual({
            months: { first: '2026-02', last: '2026-09' },
            edges: [
                { from: '2026-01-15', to: '2026-01-31' },
                { from: '2026-10-01', to: '2026-10-20' },
            ],
        })
    })

    it('inside one month: no months and one edge', () => {
        expect(monthSlices('2026-10-05', '2026-10-20')).toEqual({
            months: null,
            edges: [{ from: '2026-10-05', to: '2026-10-20' }],
        })
    })

    it('first day to mid month: no months and one edge', () => {
        expect(monthSlices('2026-10-01', '2026-10-20')).toEqual({
            months: null,
            edges: [{ from: '2026-10-01', to: '2026-10-20' }],
        })
    })

    it('mid month to a month end: one whole month and one leading edge', () => {
        expect(monthSlices('2026-09-15', '2026-10-31')).toEqual({
            months: { first: '2026-10', last: '2026-10' },
            edges: [{ from: '2026-09-15', to: '2026-09-30' }],
        })
    })

    it('mid month to mid next month: no whole month and two edges', () => {
        expect(monthSlices('2026-09-15', '2026-10-20')).toEqual({
            months: null,
            edges: [
                { from: '2026-09-15', to: '2026-09-30' },
                { from: '2026-10-01', to: '2026-10-20' },
            ],
        })
    })

    it('an inverted range (from after to): no months and no edges', () => {
        expect(monthSlices('2026-10-20', '2026-10-05')).toEqual({ months: null, edges: [] })
    })

    it('a whole leap February: one month and no edges', () => {
        expect(monthSlices('2028-02-01', '2028-02-29')).toEqual({
            months: { first: '2028-02', last: '2028-02' },
            edges: [],
        })
    })
})

describe('asOfSlices', () => {
    it('mid month: through the previous month plus an edge from the first', () => {
        expect(asOfSlices('2026-10-25')).toEqual({
            through: '2026-09',
            edge: { from: '2026-10-01', to: '2026-10-25' },
        })
    })

    it('a month end: through that month and no edge', () => {
        expect(asOfSlices('2026-09-30')).toEqual({ through: '2026-09', edge: null })
    })

    it('January 1: through the previous December plus a one-day edge', () => {
        expect(asOfSlices('2026-01-01')).toEqual({
            through: '2025-12',
            edge: { from: '2026-01-01', to: '2026-01-01' },
        })
    })
})

describe('fiscalYearStartOf and previousPeriod', () => {
    it.each([
        ['2026-10-25', 1, '2026-01-01'],
        ['2026-03-10', 7, '2025-07-01'],
        ['2026-07-01', 7, '2026-07-01'],
    ] as const)('fiscal year holding %s with start month %i starts %s', (day, month, start) => {
        expect(fiscalYearStartOf(day, month)).toBe(start)
    })

    it.each([
        ['2026-01', '2025-12'],
        ['2026-10', '2026-09'],
    ])('the period before %s is %s', (period, previous) => {
        expect(previousPeriod(period)).toBe(previous)
    })
})

describe('period words', () => {
    it('dayWords spells the month', () => {
        expect(dayWords('2026-10-25')).toBe('October 25, 2026')
    })

    it('a same-year range drops the first year', () => {
        expect(
            periodWords({
                kind: 'range',
                preset: 'this-month-to-date',
                from: '2026-10-01',
                to: '2026-10-25',
            })
        ).toBe('October 1 – October 25, 2026')
    })

    it('a range across years keeps both years', () => {
        expect(
            periodWords({ kind: 'range', preset: 'custom', from: '2025-12-01', to: '2026-01-31' })
        ).toBe('December 1, 2025 – January 31, 2026')
    })

    it('a one-day range is one date', () => {
        expect(
            periodWords({ kind: 'range', preset: 'today', from: '2026-10-25', to: '2026-10-25' })
        ).toBe('October 25, 2026')
    })

    it('an as-of period reads "As of"', () => {
        expect(periodWords({ kind: 'as-of', preset: 'today', from: null, to: '2026-10-25' })).toBe(
            'As of October 25, 2026'
        )
    })
})

describe('periodChipLabel', () => {
    it('a same-year range: preset label, then short dates with one year', () => {
        expect(
            periodChipLabel({
                kind: 'range',
                preset: 'this-fiscal-year-to-date',
                from: '2026-01-01',
                to: '2026-10-25',
            })
        ).toBe('This fiscal year to date · Jan 1 – Oct 25, 2026')
    })

    it('an as-of period: preset label, then one short date', () => {
        expect(
            periodChipLabel({
                kind: 'as-of',
                preset: 'end-of-last-month',
                from: null,
                to: '2026-09-30',
            })
        ).toBe('End of last month · Sep 30, 2026')
    })

    it('a range across years keeps both years', () => {
        expect(
            periodChipLabel({
                kind: 'range',
                preset: 'custom',
                from: '2025-12-01',
                to: '2026-01-31',
            })
        ).toBe('Custom · Dec 1, 2025 – Jan 31, 2026')
    })

    it('a one-day range shows one short date', () => {
        expect(
            periodChipLabel({
                kind: 'range',
                preset: 'today',
                from: '2026-10-25',
                to: '2026-10-25',
            })
        ).toBe('Today · Oct 25, 2026')
    })
})
