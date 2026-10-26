import { describe, expect, it } from 'vitest'
import { maxStoredAmount } from '../tinycld/books/lib/money'
import {
    DEFAULT_NUMBER_FORMAT,
    type ReportColumn,
    type ReportNumberFormat,
} from '../tinycld/books/lib/report-definition'
import {
    cellDisplay,
    formatReportAmount,
    formatReportPercent,
    REPORT_AMOUNT_ERROR,
} from '../tinycld/books/lib/report-format'
import { CUSTOM_NUMBER_FORMAT } from '../tinycld/books/lib/report-shell-fixture'

const PARENS: ReportNumberFormat = { ...DEFAULT_NUMBER_FORMAT, negative: 'parens' }
const WITHOUT_CENTS: ReportNumberFormat = { ...DEFAULT_NUMBER_FORMAT, withoutCents: true }
const THOUSANDS: ReportNumberFormat = { ...DEFAULT_NUMBER_FORMAT, divideBy1000: true }
const THOUSANDS_WITHOUT_CENTS: ReportNumberFormat = {
    ...DEFAULT_NUMBER_FORMAT,
    divideBy1000: true,
    withoutCents: true,
}
const RED: ReportNumberFormat = { ...DEFAULT_NUMBER_FORMAT, negativeRed: true }

const plain = (cents: number, format: ReportNumberFormat = DEFAULT_NUMBER_FORMAT) =>
    formatReportAmount(cents, 'USD', format, { withSymbol: false })
const symbol = (cents: number, format: ReportNumberFormat = DEFAULT_NUMBER_FORMAT) =>
    formatReportAmount(cents, 'USD', format, { withSymbol: true })

const MONEY: ReportColumn = { id: 'total', label: 'Total', kind: 'money' }
const PERCENT: ReportColumn = { id: 'share', label: '% of income', kind: 'percent' }
const DATE: ReportColumn = { id: 'date', label: 'Date', kind: 'date' }
const TEXT: ReportColumn = { id: 'memo', label: 'Memo', kind: 'text' }

describe('formatReportAmount with the default format', () => {
    it('formats bare numbers without a symbol', () => {
        expect(plain(1234567)).toBe('12,345.67')
        expect(plain(-1234567)).toBe('-12,345.67')
        expect(plain(0)).toBe('0.00')
        expect(plain(-0.4)).toBe('0.00')
        expect(plain(5)).toBe('0.05')
    })

    it('puts the currency symbol after the minus sign', () => {
        expect(symbol(1234567)).toBe('$12,345.67')
        expect(symbol(-1234567)).toBe('-$12,345.67')
    })
})

describe('formatReportAmount with parentheses for negatives', () => {
    it('wraps a negative in parentheses and leaves a positive unchanged', () => {
        expect(plain(-1234567, PARENS)).toBe('(12,345.67)')
        expect(symbol(-1234567, PARENS)).toBe('($12,345.67)')
        expect(plain(1234567, PARENS)).toBe('12,345.67')
        expect(symbol(1234567, PARENS)).toBe('$12,345.67')
    })
})

describe('formatReportAmount without cents', () => {
    it('rounds half away from zero to whole units', () => {
        expect(plain(1234550, WITHOUT_CENTS)).toBe('12,346')
        expect(plain(-1234550, WITHOUT_CENTS)).toBe('-12,346')
        expect(plain(1234549, WITHOUT_CENTS)).toBe('12,345')
        expect(symbol(1234550, WITHOUT_CENTS)).toBe('$12,346')
    })
})

describe('formatReportAmount divided by 1000', () => {
    it('rounds the thousands to cents half away from zero', () => {
        expect(plain(1234567, THOUSANDS)).toBe('12.35')
        expect(plain(1234500, THOUSANDS)).toBe('12.35')
        expect(plain(-1234500, THOUSANDS)).toBe('-12.35')
    })

    it('combines with Without cents', () => {
        expect(plain(1234567, THOUSANDS_WITHOUT_CENTS)).toBe('12')
        expect(plain(-49999, THOUSANDS_WITHOUT_CENTS)).toBe('0')
    })

    it('rounds once, not to cents and then to units', () => {
        expect(plain(1234550, THOUSANDS_WITHOUT_CENTS)).toBe('12')
    })
})

describe('formatReportAmount at the stored limit', () => {
    it('is exact at 2^53-1 and refuses anything past it', () => {
        expect(REPORT_AMOUNT_ERROR).toBe('Too large')
        expect(plain(9007199254740991)).toBe('90,071,992,547,409.91')
        expect(plain(9007199254740992)).toBe(REPORT_AMOUNT_ERROR)
        expect(plain(Number.NaN)).toBe(REPORT_AMOUNT_ERROR)
        expect(plain(Number.POSITIVE_INFINITY)).toBe(REPORT_AMOUNT_ERROR)
    })
})

// Integer-exact reference for the sweep: half away from zero on BigInt cents.
function referenceRound(cents: bigint, divisor: bigint): bigint {
    const magnitude = cents < 0n ? -cents : cents
    const rounded = magnitude / divisor + (2n * (magnitude % divisor) >= divisor ? 1n : 0n)
    return cents < 0n ? -rounded : rounded
}

function referenceGroup(digits: bigint): string {
    return digits.toString().replace(/\B(?=(\d{3})+$)/g, ',')
}

function referenceSign(units: bigint, body: string): string {
    return units < 0n ? `-${body}` : body
}

function referenceWithoutCents(cents: number): string {
    const units = referenceRound(BigInt(cents), 100n)
    return referenceSign(units, referenceGroup(units < 0n ? -units : units))
}

function referenceThousands(cents: number): string {
    const units = referenceRound(BigInt(cents), 1000n)
    const magnitude = units < 0n ? -units : units
    const fraction = (magnitude % 100n).toString().padStart(2, '0')
    return referenceSign(units, `${referenceGroup(magnitude / 100n)}.${fraction}`)
}

function referenceThousandsWithoutCents(cents: number): string {
    const units = referenceRound(BigInt(cents), 100000n) * 100n
    const magnitude = units < 0n ? -units : units
    return referenceSign(units, referenceGroup(magnitude / 100n))
}

const SWEEP_SPAN = 200000

function sweepMismatches() {
    const mismatches: string[] = []
    let count = 0
    const record = (cents: number, format: string, actual: string, expected: string) => {
        count += 1
        if (mismatches.length < 5) mismatches.push(`${format} ${cents}: ${actual} != ${expected}`)
    }
    for (let offset = 0; offset <= SWEEP_SPAN; offset += 1) {
        for (const cents of [maxStoredAmount - offset, -(maxStoredAmount - offset)]) {
            const withoutCents = plain(cents, WITHOUT_CENTS)
            const withoutCentsExpected = referenceWithoutCents(cents)
            if (withoutCents !== withoutCentsExpected) {
                record(cents, 'WITHOUT_CENTS', withoutCents, withoutCentsExpected)
            }
            const thousands = plain(cents, THOUSANDS)
            const thousandsExpected = referenceThousands(cents)
            if (thousands !== thousandsExpected) {
                record(cents, 'THOUSANDS', thousands, thousandsExpected)
            }
            const thousandsWithoutCents = plain(cents, THOUSANDS_WITHOUT_CENTS)
            const thousandsWithoutCentsExpected = referenceThousandsWithoutCents(cents)
            if (thousandsWithoutCents !== thousandsWithoutCentsExpected) {
                record(
                    cents,
                    'THOUSANDS_WITHOUT_CENTS',
                    thousandsWithoutCents,
                    thousandsWithoutCentsExpected
                )
            }
        }
    }
    return { count, mismatches }
}

describe('formatReportAmount near the stored limit', () => {
    it('rounds whole units exactly for large integer cents', () => {
        expect(plain(9007199254740949, WITHOUT_CENTS)).toBe('90,071,992,547,409')
        expect(plain(4600000000000049, WITHOUT_CENTS)).toBe('46,000,000,000,000')
        expect(plain(-9007199254740949, WITHOUT_CENTS)).toBe('-90,071,992,547,409')
    })

    it('rounds thousands exactly for large integer cents', () => {
        expect(plain(9007199254740499, THOUSANDS)).toBe('90,071,992,547.40')
    })

    it('rounds whole thousands exactly for large integer cents', () => {
        expect(plain(9007199254649999, THOUSANDS_WITHOUT_CENTS)).toBe('90,071,992,546')
        expect(plain(-9007199254649999, THOUSANDS_WITHOUT_CENTS)).toBe('-90,071,992,546')
    })

    it('keeps half away from zero for small integer cents', () => {
        expect(plain(-50, WITHOUT_CENTS)).toBe('-1')
        expect(plain(49, WITHOUT_CENTS)).toBe('0')
    })

    it('matches an integer-exact reference for every cent near the limit', () => {
        expect(sweepMismatches()).toEqual({ count: 0, mismatches: [] })
    })
})

describe('formatReportPercent', () => {
    it('shows one decimal and a percent sign', () => {
        expect(formatReportPercent(12.345)).toBe('12.3%')
    })

    it('shows nothing for a percent with no base', () => {
        expect(formatReportPercent(Number.NaN)).toBe('')
        expect(formatReportPercent(Number.POSITIVE_INFINITY)).toBe('')
        expect(formatReportPercent(Number.NEGATIVE_INFINITY)).toBe('')
    })
})

describe('cellDisplay', () => {
    it('shows money on detail and section rows without a symbol, right aligned', () => {
        expect(cellDisplay(MONEY, 'detail', 1234567, 'USD', DEFAULT_NUMBER_FORMAT)).toEqual({
            text: '12,345.67',
            align: 'right',
            isRed: false,
            isError: false,
        })
        expect(cellDisplay(MONEY, 'section', 1234567, 'USD', DEFAULT_NUMBER_FORMAT)).toEqual({
            text: '12,345.67',
            align: 'right',
            isRed: false,
            isError: false,
        })
    })

    it('shows money on subtotal and total rows with the symbol', () => {
        expect(cellDisplay(MONEY, 'subtotal', 1234567, 'USD', DEFAULT_NUMBER_FORMAT).text).toBe(
            '$12,345.67'
        )
        expect(cellDisplay(MONEY, 'total', 1234567, 'USD', DEFAULT_NUMBER_FORMAT).text).toBe(
            '$12,345.67'
        )
        expect(cellDisplay(MONEY, 'total', -1234550, 'USD', CUSTOM_NUMBER_FORMAT).text).toBe(
            '($12,346)'
        )
    })

    it('shows an empty cell for null', () => {
        expect(cellDisplay(MONEY, 'detail', null, 'USD', DEFAULT_NUMBER_FORMAT)).toEqual({
            text: '',
            align: 'right',
            isRed: false,
            isError: false,
        })
    })

    it('marks a negative red only when the option is on and the shown value is negative', () => {
        expect(cellDisplay(MONEY, 'detail', -1234567, 'USD', RED)).toEqual({
            text: '-12,345.67',
            align: 'right',
            isRed: true,
            isError: false,
        })
        expect(cellDisplay(MONEY, 'detail', -1234550, 'USD', CUSTOM_NUMBER_FORMAT)).toEqual({
            text: '(12,346)',
            align: 'right',
            isRed: true,
            isError: false,
        })
        expect(cellDisplay(MONEY, 'detail', -1234567, 'USD', DEFAULT_NUMBER_FORMAT).isRed).toBe(
            false
        )
        expect(cellDisplay(MONEY, 'detail', -0.4, 'USD', RED)).toEqual({
            text: '0.00',
            align: 'right',
            isRed: false,
            isError: false,
        })
        expect(
            cellDisplay(MONEY, 'detail', -49999, 'USD', {
                ...THOUSANDS_WITHOUT_CENTS,
                negativeRed: true,
            })
        ).toEqual({ text: '0', align: 'right', isRed: false, isError: false })
    })

    it('marks a value over the limit as an error', () => {
        expect(cellDisplay(MONEY, 'total', 9007199254740992, 'USD', DEFAULT_NUMBER_FORMAT)).toEqual(
            {
                text: 'Too large',
                align: 'right',
                isRed: false,
                isError: true,
            }
        )
    })

    it('shows a percent with one decimal, right aligned', () => {
        expect(cellDisplay(PERCENT, 'detail', 12.345, 'USD', DEFAULT_NUMBER_FORMAT)).toEqual({
            text: '12.3%',
            align: 'right',
            isRed: false,
            isError: false,
        })
        expect(cellDisplay(PERCENT, 'detail', -0.05, 'USD', DEFAULT_NUMBER_FORMAT)).toEqual({
            text: '-0.1%',
            align: 'right',
            isRed: false,
            isError: false,
        })
    })

    it('shows an empty percent cell for a percent with no base', () => {
        const empty = { text: '', align: 'right', isRed: false, isError: false }
        expect(cellDisplay(PERCENT, 'detail', Number.NaN, 'USD', DEFAULT_NUMBER_FORMAT)).toEqual(
            empty
        )
        expect(
            cellDisplay(PERCENT, 'total', Number.POSITIVE_INFINITY, 'USD', DEFAULT_NUMBER_FORMAT)
        ).toEqual(empty)
        expect(
            cellDisplay(PERCENT, 'detail', Number.NEGATIVE_INFINITY, 'USD', DEFAULT_NUMBER_FORMAT)
        ).toEqual(empty)
    })

    it('shows a date as a day, left aligned', () => {
        expect(cellDisplay(DATE, 'detail', '2026-10-23', 'USD', DEFAULT_NUMBER_FORMAT)).toEqual({
            text: 'Oct 23, 2026',
            align: 'left',
            isRed: false,
            isError: false,
        })
    })

    it('shows text as given, left aligned', () => {
        expect(cellDisplay(TEXT, 'detail', 'Office move', 'USD', DEFAULT_NUMBER_FORMAT)).toEqual({
            text: 'Office move',
            align: 'left',
            isRed: false,
            isError: false,
        })
    })
})
