import { describe, expect, expectTypeOf, it } from 'vitest'
import { type DocumentTax, documentTotals } from '../tinycld/books/lib/document-lines'
import {
    CONVERTED_INVOICE_ID,
    CONVERTED_INVOICE_LINES,
    type ConvertedInvoiceRecord,
    ESTIMATE_LINES,
    ESTIMATE_TODAY,
    ESTIMATES,
    type EstimateLineRecord,
    type EstimateRecord,
    type EstimateStatus,
} from '../tinycld/books/lib/estimate-form-fixture'
import { TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'
import type { BooksEstimateLines, BooksEstimates, BooksInvoices } from '../tinycld/books/types'

function taxOf(rateId: string): DocumentTax {
    if (rateId === '') return null
    const row = TAX_RATE_ROWS.find(r => r.id === rateId)
    if (!row) throw new Error(`unknown tax rate ${rateId}`)
    const ids = row.type === 'group' ? row.components : [row.id]
    return {
        components: ids.map(id => {
            const rate = TAX_RATE_ROWS.find(r => r.id === id)
            if (!rate) throw new Error(`unknown tax component ${id}`)
            return { id, ppm: rate.rate_ppm }
        }),
    }
}

function linesOf(estimateId: string) {
    return ESTIMATE_LINES.filter(line => line.estimate === estimateId).sort(
        (a, b) => a.position - b.position
    )
}

describe('generated estimate types', () => {
    it('the fixture types are the generated types', () => {
        // tsc fails here until the migration and the generated types exist.
        expectTypeOf<EstimateRecord>().toEqualTypeOf<BooksEstimates>()
        expectTypeOf<EstimateLineRecord>().toEqualTypeOf<BooksEstimateLines>()
        expectTypeOf<ConvertedInvoiceRecord>().toEqualTypeOf<BooksInvoices>()
        expectTypeOf<EstimateStatus>().toEqualTypeOf<BooksEstimates['status']>()
        const linked: BooksInvoices['estimate'] = CONVERTED_INVOICE_ID
        expect(linked).toBe(CONVERTED_INVOICE_ID)
    })
})

describe('ESTIMATES', () => {
    it('subtotal, tax_total and total equal documentTotals of the lines and the tax', () => {
        for (const row of ESTIMATES) {
            const totals = documentTotals(
                linesOf(row.id).map(line => ({
                    kind: line.kind,
                    quantity: line.quantity,
                    rate: line.rate,
                    percentPpm: line.percent_ppm,
                    taxable: line.taxable,
                })),
                taxOf(row.tax_rate)
            )
            expect(
                { subtotal: row.subtotal, tax_total: row.tax_total, total: row.total },
                row.id
            ).toEqual({
                subtotal: totals.subtotal,
                tax_total: totals.taxTotal,
                total: totals.total,
            })
        }
    })

    it('every id is 15 characters', () => {
        const ids = [
            ...ESTIMATES.map(row => row.id),
            ...ESTIMATE_LINES.map(row => row.id),
            ...CONVERTED_INVOICE_LINES.map(row => row.id),
            CONVERTED_INVOICE_ID,
        ]
        expect(ids.filter(id => id.length !== 15)).toEqual([])
    })

    it('holds each case of spec §4', () => {
        const pendingOpen = ESTIMATES.find(
            row =>
                row.status === 'pending' &&
                row.expiration_date !== '' &&
                row.expiration_date > ESTIMATE_TODAY
        )
        expect(pendingOpen, 'a Pending estimate expiring after today').toBeDefined()

        const pendingExpired = ESTIMATES.find(
            row =>
                row.status === 'pending' &&
                row.expiration_date !== '' &&
                row.expiration_date < ESTIMATE_TODAY
        )
        expect(pendingExpired, 'a Pending estimate already expired').toBeDefined()

        const accepted = ESTIMATES.find(row => row.status === 'accepted' && row.accepted_by !== '')
        expect(accepted, 'an Accepted estimate with Accepted by').toBeDefined()

        expect(
            ESTIMATES.some(row => row.status === 'rejected'),
            'a Rejected estimate'
        ).toBe(true)

        const closed = ESTIMATES.find(row => row.status === 'closed')
        expect(closed?.invoice, 'a Closed estimate naming the converted invoice').toBe(
            CONVERTED_INVOICE_ID
        )
    })

    it('dates every estimate after 2026-06-30', () => {
        expect(ESTIMATES.filter(row => !(row.date > '2026-06-30')).map(row => row.id)).toEqual([])
    })

    it('gives the Accepted and Closed rows an accepted date, and the others none', () => {
        for (const row of ESTIMATES) {
            const hasAcceptance = row.status === 'accepted' || row.status === 'closed'
            expect(row.accepted_date !== '', `${row.id} (${row.status})`).toBe(hasAcceptance)
        }
    })
})
