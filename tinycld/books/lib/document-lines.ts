// Line amounts and totals of a sales document (an invoice). The server recomputes
// them with the Go mirror in server/document_totals.go at every draft write;
// server/testdata/document_totals.json is run by both sides so the two stay equal.
//
// Money is integer cents. A quantity has at most 2 decimals and is held as
// hundredths; a percent is parts per million of the line above (-10% = -100 000).
// Qty x Rate and Percent x the amount above are computed in BigInt and rounded half
// away from zero: 10^8 hundredths x 10^15 cents passes 2^53 (and int64 in Go)
// before the division.
//
// Plain functions over numbers: the seed graph and the vector test run this in node.

import { maxLineAmount, maxStoredAmount } from './money-text'
import { MAX_RATE_PPM, taxOn } from './sales-tax'

export type DocumentLineKind = 'item' | 'description' | 'subtotal' | 'percent'

export type DocumentLineInput = {
    kind: DocumentLineKind
    quantity: number
    rate: number
    percentPpm: number
    taxable: boolean
}

// The header tax: the rate, or each component of the group, in parts per million.
export type DocumentTax = { components: readonly { id: string; ppm: number }[] } | null

export type DocumentTotals = {
    // One per line: null for a description line and for a percent line with no
    // item or subtotal right above it.
    amounts: (number | null)[]
    // Indexes of the percent lines with no item or subtotal right above them.
    percentTargetErrors: number[]
    taxableTotal: number
    subtotal: number
    taxLines: { componentId: string; ppm: number; amount: number }[]
    taxTotal: number
    total: number
    // A line amount past maxLineAmount, or a header tax that cannot be computed (a
    // taxable total past 2^53-1, or a rate outside 0..100%). The total's own limit
    // (maxStoredAmount) is the caller's check.
    isTooLarge: boolean
}

// The server's bound (server/invoices.go); the form checks it before it saves.
export const MAX_DOCUMENT_LINES = 250

const HUNDREDTHS = 100n
const PPM_PER_UNIT = 1_000_000n
const MAX_LINE = BigInt(maxLineAmount)
const MAX_STORED = BigInt(maxStoredAmount)

function divideHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
    const negative = numerator < 0n
    const magnitude = negative ? -numerator : numerator
    const quotient = magnitude / denominator
    const rest = magnitude - quotient * denominator
    const rounded = 2n * rest >= denominator ? quotient + 1n : quotient
    return negative ? -rounded : rounded
}

function wholeCents(value: number, what: string): bigint {
    if (!Number.isSafeInteger(value)) {
        throw new RangeError(`${what} ${value} is not a whole number of cents.`)
    }
    return BigInt(value)
}

// Half away from zero, as Go's math.Round, so a quantity rounds the same on both sides.
function quantityHundredths(quantity: number): bigint {
    if (!Number.isFinite(quantity)) throw new RangeError(`Quantity ${quantity} is not a number.`)
    return BigInt(Math.sign(quantity) * Math.round(Math.abs(quantity) * 100))
}

function lineAmountBig(quantity: number, rateCents: number): bigint {
    const product = quantityHundredths(quantity) * wholeCents(rateCents, 'Rate')
    return divideHalfAwayFromZero(product, HUNDREDTHS)
}

function percentAmountBig(percentPpm: number, base: bigint): bigint {
    return divideHalfAwayFromZero(base * wholeCents(percentPpm, 'Percent'), PPM_PER_UNIT)
}

// Qty x Rate in cents, rounded half away from zero. Past 2^53 the result is not exact;
// documentTotals flags anything past maxLineAmount first.
export function lineAmount(quantity: number, rateCents: number): number {
    return Number(lineAmountBig(quantity, rateCents))
}

// Percent (ppm) of a base amount in cents, rounded half away from zero.
export function percentAmount(percentPpm: number, baseCents: number): number {
    return Number(percentAmountBig(percentPpm, wholeCents(baseCents, 'Base')))
}

function isValidPpm(ppm: number) {
    return Number.isInteger(ppm) && ppm >= 0 && ppm <= MAX_RATE_PPM
}

function absolute(value: bigint) {
    return value < 0n ? -value : value
}

// The amount of each line in order: an item is Qty x Rate; a subtotal sums the item
// and percent amounts since the previous subtotal; a percent line takes its percent
// of the item or subtotal right above it.
function lineAmounts(lines: readonly DocumentLineInput[]) {
    const amounts: (bigint | null)[] = []
    const percentTargetErrors: number[] = []
    let sinceSubtotal = 0n
    lines.forEach((line, index) => {
        if (line.kind === 'item') {
            const amount = lineAmountBig(line.quantity, line.rate)
            sinceSubtotal += amount
            amounts.push(amount)
            return
        }
        if (line.kind === 'subtotal') {
            amounts.push(sinceSubtotal)
            sinceSubtotal = 0n
            return
        }
        if (line.kind === 'percent') {
            const above = lines[index - 1]?.kind
            const base = amounts[index - 1]
            if ((above !== 'item' && above !== 'subtotal') || base === null || base === undefined) {
                percentTargetErrors.push(index)
                amounts.push(null)
                return
            }
            const amount = percentAmountBig(line.percentPpm, base)
            sinceSubtotal += amount
            amounts.push(amount)
            return
        }
        amounts.push(null)
    })
    return { amounts, percentTargetErrors }
}

export function documentTotals(
    lines: readonly DocumentLineInput[],
    tax: DocumentTax
): DocumentTotals {
    const { amounts, percentTargetErrors } = lineAmounts(lines)
    let subtotal = 0n
    let taxable = 0n
    let isTooLarge = false
    lines.forEach((line, index) => {
        const amount = amounts[index]
        if (amount === null || amount === undefined) return
        if (absolute(amount) > MAX_LINE) isTooLarge = true
        if (line.kind !== 'item' && line.kind !== 'percent') return
        subtotal += amount
        if (line.taxable) taxable += amount
    })

    const components = tax?.components ?? []
    const canTax =
        components.length === 0 ||
        (absolute(taxable) <= MAX_STORED && components.every(c => isValidPpm(c.ppm)))
    if (!canTax) isTooLarge = true
    const taxLines = canTax
        ? components.map(c => ({
              componentId: c.id,
              ppm: c.ppm,
              amount: taxOn(Number(taxable), c.ppm),
          }))
        : []
    const taxTotal = taxLines.reduce((sum, line) => sum + BigInt(line.amount), 0n)

    return {
        amounts: amounts.map(amount => (amount === null ? null : Number(amount))),
        percentTargetErrors,
        taxableTotal: Number(taxable),
        subtotal: Number(subtotal),
        taxLines,
        taxTotal: Number(taxTotal),
        total: Number(subtotal + taxTotal),
        isTooLarge,
    }
}
