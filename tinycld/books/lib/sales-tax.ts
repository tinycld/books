// The one sales tax helper. Every document with tax computes it per rate on
// its total taxable amount for that rate (not per line); each component of a
// group is rounded separately, half away from zero, and the group's tax is
// their sum. The server recomputes with the Go mirror in
// server/sales_tax_math.go; server/testdata/sales_tax_vectors.json is run by
// both sides so the two stay equal.

import { maxStoredAmount } from './money'

export const PPM_PER_PERCENT = 10_000
export const MAX_RATE_PPM = 1_000_000

const PPM_PER_UNIT = 1_000_000
const FRACTION_DIGITS = 4
const RATE_TEXT = /^(\d{1,3})(?:\.(\d{1,4}))?(?:\s*%)?$/

// String arithmetic keeps "8.875" exactly 88 750; a float multiply would not.
export function parseRatePercent(text: string) {
    const match = RATE_TEXT.exec(text.trim())
    if (!match) return null
    const whole = Number(match[1])
    const fraction = Number((match[2] ?? '').padEnd(FRACTION_DIGITS, '0'))
    const ppm = whole * PPM_PER_PERCENT + fraction
    return ppm > MAX_RATE_PPM ? null : ppm
}

export function ratePercentText(ppm: number) {
    const whole = Math.floor(ppm / PPM_PER_PERCENT)
    const fraction = String(ppm % PPM_PER_PERCENT)
        .padStart(FRACTION_DIGITS, '0')
        .replace(/0+$/, '')
    return fraction ? `${whole}.${fraction}%` : `${whole}%`
}

// Splitting the amount into q·1 000 000 + r keeps every product below 2^53,
// so the result is exact for any stored amount.
export function taxOn(taxableCents: number, ppm: number) {
    if (!Number.isInteger(taxableCents) || Math.abs(taxableCents) > maxStoredAmount) {
        throw new RangeError(
            `Taxable amount ${taxableCents} is not a whole number of cents up to 2^53-1.`
        )
    }
    if (!Number.isInteger(ppm) || ppm < 0 || ppm > MAX_RATE_PPM) {
        throw new RangeError(`Rate ${ppm} is not a whole ppm from 0 to ${MAX_RATE_PPM}.`)
    }
    const amount = Math.abs(taxableCents)
    const q = Math.floor(amount / PPM_PER_UNIT)
    const r = amount - q * PPM_PER_UNIT
    const n = r * ppm
    const roundUp = 2 * (n % PPM_PER_UNIT) >= PPM_PER_UNIT ? 1 : 0
    const tax = q * ppm + Math.floor(n / PPM_PER_UNIT) + roundUp
    // A negative amount whose tax rounds to zero must give 0, not -0, as Go does.
    return taxableCents < 0 && tax > 0 ? -tax : tax
}

export function groupTax(taxableCents: number, componentPpms: readonly number[]) {
    return componentPpms.map(ppm => taxOn(taxableCents, ppm))
}

export function groupPpm(componentPpms: readonly number[]) {
    return componentPpms.reduce((sum, ppm) => sum + ppm, 0)
}
