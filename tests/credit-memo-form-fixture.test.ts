import { describe, expect, expectTypeOf, it } from 'vitest'
import {
    CREDIT_MEMO_LINES,
    CREDIT_MEMO_SEED_DRAFT_ID,
    CREDIT_MEMO_SEED_IDS,
    CREDIT_MEMO_TAX_LINES,
    CREDIT_MEMOS,
    type CreditMemoLineRecord,
    type CreditMemoRecord,
    type CreditMemoTaxLineRecord,
} from '../tinycld/books/lib/credit-memo-form-fixture'
import { type DocumentTax, documentTotals } from '../tinycld/books/lib/document-lines'
import { INVOICE_IDS, INVOICES } from '../tinycld/books/lib/invoice-form-fixture'
import { TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'
import type {
    BooksCreditMemoLines,
    BooksCreditMemos,
    BooksCreditMemoTaxLines,
} from '../tinycld/books/types'

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

function linesOf(memoId: string) {
    return CREDIT_MEMO_LINES.filter(line => line.credit_memo === memoId).sort(
        (a, b) => a.position - b.position
    )
}

describe('generated credit memo types', () => {
    it('the fixture types are the generated types', () => {
        // tsc fails here until the migration and the generated types exist.
        expectTypeOf<CreditMemoRecord>().toEqualTypeOf<BooksCreditMemos>()
        expectTypeOf<CreditMemoLineRecord>().toEqualTypeOf<BooksCreditMemoLines>()
        expectTypeOf<CreditMemoTaxLineRecord>().toEqualTypeOf<BooksCreditMemoTaxLines>()
        CREDIT_MEMOS satisfies BooksCreditMemos[]
        CREDIT_MEMO_LINES satisfies BooksCreditMemoLines[]
        CREDIT_MEMO_TAX_LINES satisfies BooksCreditMemoTaxLines[]
        const link: BooksCreditMemos['invoice'] = INVOICE_IDS.posted
        expect(link).toBe(INVOICE_IDS.posted)
    })
})

describe('CREDIT_MEMOS', () => {
    it('subtotal, tax_total and total equal documentTotals of the lines and the tax', () => {
        for (const row of CREDIT_MEMOS) {
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

    // Spec §4.3, Q5: a credit kind writes its tax snapshot negated.
    it('every tax line figure is 0 or below, and the rows of a memo sum to its negated tax_total', () => {
        for (const line of CREDIT_MEMO_TAX_LINES) {
            expect(line.gross_amount, line.id).toBeLessThanOrEqual(0)
            expect(line.taxable_amount, line.id).toBeLessThanOrEqual(0)
            expect(line.amount, line.id).toBeLessThanOrEqual(0)
        }
        const taxed = CREDIT_MEMOS.filter(row => row.status !== 'draft' && row.tax_rate !== '')
        expect(taxed.length).toBeGreaterThan(0)
        for (const row of taxed) {
            const rows = CREDIT_MEMO_TAX_LINES.filter(line => line.credit_memo === row.id)
            expect(rows.length, row.id).toBeGreaterThan(0)
            const sum = rows.reduce((total, line) => total + line.amount, 0)
            expect(sum, row.id).toBe(row.tax_total === 0 ? 0 : -row.tax_total)
        }
    })

    it('every id is 15 characters', () => {
        const ids = [
            ...CREDIT_MEMOS.map(row => row.id),
            ...CREDIT_MEMO_LINES.map(row => row.id),
            ...CREDIT_MEMO_TAX_LINES.map(row => row.id),
        ]
        expect(ids.length).toBeGreaterThan(0)
        expect(ids.filter(id => id.length !== 15)).toEqual([])
    })

    it('every date is after 2026-06-30', () => {
        expect(CREDIT_MEMOS.filter(row => !(row.date > '2026-06-30')).map(row => row.id)).toEqual(
            []
        )
    })

    it('the seed ids name rows that exist: posted memos and one draft', () => {
        const seeded = CREDIT_MEMO_SEED_IDS.map(id => CREDIT_MEMOS.find(row => row.id === id))
        expect(seeded.map(row => row?.status)).toEqual(CREDIT_MEMO_SEED_IDS.map(() => 'posted'))
        expect(CREDIT_MEMOS.find(row => row.id === CREDIT_MEMO_SEED_DRAFT_ID)?.status).toBe('draft')
    })

    // Spec §4.6: the posted seed memo is linked to the seeded posted invoice, of that
    // invoice's customer, so the server's link guard accepts it.
    it('the posted seed memo names INVOICE_IDS.posted and that invoice’s customer', () => {
        const invoice = INVOICES.find(row => row.id === INVOICE_IDS.posted)
        expect(invoice?.status).toBe('posted')
        const posted = CREDIT_MEMOS.find(row => row.id === CREDIT_MEMO_SEED_IDS[0])
        expect({ invoice: posted?.invoice, customer: posted?.customer }).toEqual({
            invoice: INVOICE_IDS.posted,
            customer: invoice?.customer,
        })
    })
})
