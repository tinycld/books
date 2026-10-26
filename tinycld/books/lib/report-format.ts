import { formatMoney, maxStoredAmount, roundHalfAwayFromZero } from './money'
import { formatDay } from './register-range'
import type {
    ReportCellValue,
    ReportColumn,
    ReportNumberFormat,
    ReportRowKind,
} from './report-definition'

export const REPORT_AMOUNT_ERROR = 'Too large'

export type CellDisplay = {
    text: string
    align: 'left' | 'right'
    isRed: boolean
    isError: boolean
}

// Integer cents divided by `divisor`, half away from zero. A float division near 2^53
// can land on the wrong side of a half, so this splits off the remainder with `%`, which
// is exact for integers, and divides only an exact multiple of `divisor`.
function roundedQuotient(cents: number, divisor: number): number {
    const magnitude = Math.abs(cents)
    const remainder = magnitude % divisor
    const quotient = (magnitude - remainder) / divisor + (2 * remainder >= divisor ? 1 : 0)
    return cents < 0 ? -quotient : quotient
}

// Report amounts are whole cents; a fractional value is outside the model, so it gets a
// best-effort float rounding (roundHalfAwayFromZero's epsilon nudge) that can be off by
// one for a value just below a half, at any size.
function roundFraction(cents: number, divisor: number): number {
    return roundHalfAwayFromZero(cents / divisor)
}

// The one rounding of a report amount, to whole cents of the display unit. Null when
// the amount cannot be stored, so it cannot be shown either.
function displayUnits(cents: number, numberFormat: ReportNumberFormat): number | null {
    if (!Number.isFinite(cents) || Math.abs(cents) > maxStoredAmount) return null
    const centsPerUnit = numberFormat.withoutCents ? 100 : 1
    const divisor = (numberFormat.divideBy1000 ? 1000 : 1) * centsPerUnit
    const round = Number.isInteger(cents) ? roundedQuotient : roundFraction
    return round(cents, divisor) * centsPerUnit
}

// Built from the digits, as formatMoney does, so values near 2^53 stay exact.
function plainAmount(magnitude: number): string {
    const whole = String(Math.floor(magnitude / 100)).replace(/\B(?=(\d{3})+$)/g, ',')
    const fraction = String(magnitude % 100).padStart(2, '0')
    return `${whole}.${fraction}`
}

function unitsText(
    units: number,
    currency: string,
    numberFormat: ReportNumberFormat,
    withSymbol: boolean
): string {
    const magnitude = Math.abs(units)
    const amount = withSymbol ? formatMoney(magnitude, currency) : plainAmount(magnitude)
    const body = numberFormat.withoutCents ? amount.replace(/\.00(?=\D*$)/, '') : amount
    if (units >= 0) return body
    return numberFormat.negative === 'parens' ? `(${body})` : `-${body}`
}

export function formatReportAmount(
    cents: number,
    currency: string,
    numberFormat: ReportNumberFormat,
    options: { withSymbol: boolean }
): string {
    const units = displayUnits(cents, numberFormat)
    if (units === null) return REPORT_AMOUNT_ERROR
    return unitsText(units, currency, numberFormat, options.withSymbol)
}

// `value` is already a percent: 12.345 shows as 12.3%. A percent with no base (a share
// of zero income) has no figure, so it shows nothing rather than an error.
export function formatReportPercent(value: number): string {
    if (!Number.isFinite(value)) return ''
    return `${(roundHalfAwayFromZero(value * 10) / 10).toFixed(1)}%`
}

const SYMBOL_ROWS: readonly ReportRowKind[] = ['subtotal', 'total']

function moneyDisplay(
    rowKind: ReportRowKind,
    cents: number,
    currency: string,
    numberFormat: ReportNumberFormat
): CellDisplay {
    const units = displayUnits(cents, numberFormat)
    if (units === null) {
        return { text: REPORT_AMOUNT_ERROR, align: 'right', isRed: false, isError: true }
    }
    return {
        text: unitsText(units, currency, numberFormat, SYMBOL_ROWS.includes(rowKind)),
        align: 'right',
        isRed: numberFormat.negativeRed && units < 0,
        isError: false,
    }
}

function plainDisplay(text: string, align: CellDisplay['align']): CellDisplay {
    return { text, align, isRed: false, isError: false }
}

export function cellDisplay(
    column: ReportColumn,
    rowKind: ReportRowKind,
    value: ReportCellValue,
    currency: string,
    numberFormat: ReportNumberFormat
): CellDisplay {
    const isNumeric = column.kind === 'money' || column.kind === 'percent'
    const align = isNumeric ? 'right' : 'left'
    if (value === null) return plainDisplay('', align)
    if (column.kind === 'money' && typeof value === 'number') {
        return moneyDisplay(rowKind, value, currency, numberFormat)
    }
    if (column.kind === 'percent' && typeof value === 'number') {
        return plainDisplay(formatReportPercent(value), align)
    }
    if (column.kind === 'date' && typeof value === 'string') {
        return plainDisplay(formatDay(value), align)
    }
    return plainDisplay(String(value), align)
}
