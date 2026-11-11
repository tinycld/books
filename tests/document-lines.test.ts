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
import { TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'

type VectorCase = {
    name: string
    lines: {
        kind: DocumentLineInput['kind']
        quantity: number
        rate: number
        percent_ppm: number
        taxable: boolean
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
