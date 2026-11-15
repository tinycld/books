import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    type DocumentLineInput,
    type DocumentTax,
    documentTotals,
    lineAmount,
    MAX_DOCUMENT_LINES,
    percentAmount,
} from '../tinycld/books/lib/document-lines'
import { INVOICE_LINES, INVOICES } from '../tinycld/books/lib/invoice-form-fixture'
import { maxLineAmount, maxStoredAmount } from '../tinycld/books/lib/money-text'
import { TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'

type VectorCase = {
    name: string
    lines: {
        kind: DocumentLineInput['kind']
        quantity: number
        rate: number
        percent_ppm: number
        taxable: boolean
        // An account line's typed amount; other kinds leave it out.
        amount?: number
    }[]
    components: number[]
    amounts: (number | null)[]
    percentTargetErrors: number[]
    subtotal: number
    taxable_total: number
    tax: number[]
    total: number
    too_large: boolean
}

// The Go mirror (server/document_totals_test.go) runs the same file, so the two stay equal.
const vectors: { cases: VectorCase[] } = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'document_totals.json'), 'utf8')
)

function componentId(index: number) {
    return `component${String.fromCharCode(97 + index)}`
}

function taxOf(ppms: readonly number[]): DocumentTax {
    if (ppms.length === 0) return null
    return { components: ppms.map((ppm, index) => ({ id: componentId(index), ppm })) }
}

describe('documentTotals: the shared vectors', () => {
    it('has cases', () => {
        expect(vectors.cases.length).toBeGreaterThan(10)
    })

    for (const tc of vectors.cases) {
        it(tc.name, () => {
            const lines: DocumentLineInput[] = tc.lines.map(line => ({
                kind: line.kind,
                quantity: line.quantity,
                rate: line.rate,
                percentPpm: line.percent_ppm,
                taxable: line.taxable,
                amount: line.amount,
            }))
            const got = documentTotals(lines, taxOf(tc.components))
            expect(got.amounts).toEqual(tc.amounts)
            expect(got.percentTargetErrors).toEqual(tc.percentTargetErrors)
            expect(got.subtotal).toBe(tc.subtotal)
            expect(got.taxableTotal).toBe(tc.taxable_total)
            expect(got.taxLines).toEqual(
                tc.tax.map((amount, index) => ({
                    componentId: componentId(index),
                    ppm: tc.components[index],
                    amount,
                }))
            )
            expect(got.taxTotal).toBe(tc.tax.reduce((sum, amount) => sum + amount, 0))
            expect(got.total).toBe(tc.total)
            expect(got.isTooLarge).toBe(tc.too_large)
        })
    }
})

// The bill's account line (plan Decisions "lib/document-lines.ts"): its amount is the typed
// amount (may be negative), summed into the subtotal as an item's is.
describe('documentTotals: account lines', () => {
    const lines = [
        { kind: 'account' as const, amount: 18_745 },
        { kind: 'account' as const, amount: -3_890 },
        { kind: 'item' as const, quantity: 3, rate: 12_140 },
    ]

    it('sums account lines, negative ones included, with item lines', () => {
        const got = documentTotals(lines, null)
        expect(got.subtotal).toBe(51_275)
        expect(got.total).toBe(51_275)
        expect(got.isTooLarge).toBe(false)
    })

    it('adds nothing for an account line of 0', () => {
        const got = documentTotals([...lines, { kind: 'account' as const, amount: 0 }], null)
        expect(got.subtotal).toBe(51_275)
        expect(got.total).toBe(51_275)
    })

    it('reports isTooLarge when the total passes maxStoredAmount', () => {
        // Each line is inside the per-line limit; only their sum passes the stored limit.
        const big = Array.from({ length: 10 }, () => ({
            kind: 'account' as const,
            amount: maxLineAmount,
        }))
        expect(maxLineAmount * 10).toBeGreaterThan(maxStoredAmount)
        expect(documentTotals(big, null).isTooLarge).toBe(true)
    })
})

describe('lineAmount and percentAmount', () => {
    it('round half away from zero', () => {
        expect(lineAmount(0.5, 1)).toBe(1)
        expect(lineAmount(0.5, -1)).toBe(-1)
        expect(lineAmount(0.07, 875)).toBe(61)
        expect(percentAmount(-500_000, 1)).toBe(-1)
        expect(percentAmount(500_000, 1)).toBe(1)
        expect(percentAmount(-100_000, 183_300)).toBe(-18_330)
    })

    it('stay exact where the product passes 2^53', () => {
        expect(lineAmount(1_000_000, 1_000_000_000)).toBe(1_000_000_000_000_000)
        expect(lineAmount(1_000_000, 1_000_000_001)).toBe(1_000_000_001_000_000)
        expect(percentAmount(10_000_000, 1_000_000_000_000_000)).toBe(10_000_000_000_000_000)
    })

    it('MAX_DOCUMENT_LINES is the server bound of 250', () => {
        expect(MAX_DOCUMENT_LINES).toBe(250)
    })
})

function fixtureTax(taxRateId: string): DocumentTax {
    if (taxRateId === '') return null
    const row = TAX_RATE_ROWS.find(rate => rate.id === taxRateId)
    if (!row) throw new Error(`no tax rate ${taxRateId}`)
    if (row.type === 'rate') return { components: [{ id: row.id, ppm: row.rate_ppm }] }
    return {
        components: row.components.map(id => {
            const component = TAX_RATE_ROWS.find(rate => rate.id === id)
            if (!component) throw new Error(`no tax rate ${id}`)
            return { id, ppm: component.rate_ppm }
        }),
    }
}

describe('the invoice fixture holds the numbers documentTotals gives', () => {
    for (const invoice of INVOICES) {
        it(`${invoice.id} (${invoice.status})`, () => {
            const lines = INVOICE_LINES.filter(line => line.invoice === invoice.id).sort(
                (a, b) => a.position - b.position
            )
            expect(lines.length).toBeGreaterThan(0)
            const got = documentTotals(
                lines.map(line => ({
                    kind: line.kind,
                    quantity: line.quantity,
                    rate: line.rate,
                    percentPpm: line.percent_ppm,
                    taxable: line.taxable,
                })),
                fixtureTax(invoice.tax_rate)
            )
            expect(got.percentTargetErrors).toEqual([])
            expect(got.isTooLarge).toBe(false)
            expect({ subtotal: got.subtotal, tax: got.taxTotal, total: got.total }).toEqual({
                subtotal: invoice.subtotal,
                tax: invoice.tax_total,
                total: invoice.total,
            })
            lines.forEach((line, index) => {
                if (line.kind === 'description') {
                    expect(got.amounts[index], `line ${index} (description)`).toBeNull()
                    return
                }
                expect(got.amounts[index], `line ${index} (${line.kind})`).toBe(line.amount)
            })
        })
    }
})
