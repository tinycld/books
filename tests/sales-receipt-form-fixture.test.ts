import { describe, expect, expectTypeOf, it } from 'vitest'
import { CUSTOMER_IDS } from '../tinycld/books/lib/customer-form-fixture'
import { type DocumentTax, documentTotals } from '../tinycld/books/lib/document-lines'
import {
    DEPOSIT_ACCOUNT_IDS,
    DEPOSIT_ACCOUNTS,
    LONG_REFERENCE,
    SALES_RECEIPT_LINES,
    SALES_RECEIPT_SEED_DRAFT_ID,
    SALES_RECEIPT_SEED_IDS,
    SALES_RECEIPT_TAX_LINES,
    SALES_RECEIPTS,
    type SalesReceiptLineRecord,
    type SalesReceiptRecord,
    type SalesReceiptTaxLineRecord,
} from '../tinycld/books/lib/sales-receipt-form-fixture'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import { CUSTOMER_TAX_PATCHES, TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'
import type {
    BooksSalesReceiptLines,
    BooksSalesReceipts,
    BooksSalesReceiptTaxLines,
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

function linesOf(receiptId: string) {
    return SALES_RECEIPT_LINES.filter(line => line.sales_receipt === receiptId).sort(
        (a, b) => a.position - b.position
    )
}

describe('generated sales receipt types', () => {
    it('the fixture types are the generated types', () => {
        // tsc fails here until the migration and the generated types exist.
        expectTypeOf<SalesReceiptRecord>().toEqualTypeOf<BooksSalesReceipts>()
        expectTypeOf<SalesReceiptLineRecord>().toEqualTypeOf<BooksSalesReceiptLines>()
        expectTypeOf<SalesReceiptTaxLineRecord>().toEqualTypeOf<BooksSalesReceiptTaxLines>()
        const method: BooksSalesReceipts['payment_method'] = 'bank_transfer'
        expect(method).toBe('bank_transfer')
    })
})

describe('SALES_RECEIPTS', () => {
    it('subtotal, tax_total and total equal documentTotals of the lines and the tax', () => {
        for (const row of SALES_RECEIPTS) {
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
            ...SALES_RECEIPTS.map(row => row.id),
            ...SALES_RECEIPT_LINES.map(row => row.id),
            ...SALES_RECEIPT_TAX_LINES.map(row => row.id),
            ...Object.values(DEPOSIT_ACCOUNT_IDS),
        ]
        expect(ids.filter(id => id.length !== 15)).toEqual([])
    })

    it('every deposit_to is a deposit account of the e2e book', () => {
        const depositIds = new Set<string>(Object.values(DEPOSIT_ACCOUNT_IDS))
        expect(
            SALES_RECEIPTS.filter(row => !depositIds.has(row.deposit_to)).map(row => row.id)
        ).toEqual([])
        // The fixture's deposit accounts are accounts the seed creates (lib/seed-accounts.ts),
        // so the seed can resolve each one by its number.
        for (const account of DEPOSIT_ACCOUNTS) {
            const seeded = SEED_ACCOUNTS.find(row => row.number === account.number)
            expect(
                seeded && {
                    name: seeded.name,
                    type: seeded.type,
                    detail_type: seeded.detail_type,
                },
                account.number
            ).toEqual({ name: account.name, type: account.type, detail_type: account.detail_type })
        }
    })

    it('SALES_RECEIPT_SEED_IDS name posted receipts dated after 2026-06-30; the seed draft is a draft', () => {
        const rows = SALES_RECEIPT_SEED_IDS.map(id => SALES_RECEIPTS.find(row => row.id === id))
        expect(rows.map(row => row?.status)).toEqual(['posted', 'posted'])
        for (const row of rows) {
            expect(row?.date && row.date > '2026-06-30', row?.id).toBe(true)
        }
        expect(SALES_RECEIPTS.find(row => row.id === SALES_RECEIPT_SEED_DRAFT_ID)?.status).toBe(
            'draft'
        )
    })

    it('holds each case of spec §4.6', () => {
        const checkToUndeposited = SALES_RECEIPTS.find(
            row =>
                row.status === 'posted' &&
                row.payment_method === 'check' &&
                row.deposit_to === DEPOSIT_ACCOUNT_IDS.undeposited &&
                row.customer !== ''
        )
        expect(
            checkToUndeposited,
            'a posted Check receipt to Undeposited funds with a customer'
        ).toBeDefined()

        const walkIn = SALES_RECEIPTS.find(
            row =>
                row.status === 'posted' &&
                row.payment_method === 'cash' &&
                row.deposit_to === DEPOSIT_ACCOUNT_IDS.checking &&
                row.customer === ''
        )
        expect(walkIn, 'a walk-in Cash receipt to 1000 with no customer').toBeDefined()

        expect(SALES_RECEIPTS.some(row => row.status === 'draft')).toBe(true)

        const voided = SALES_RECEIPTS.find(row => row.status === 'void' && row.replaced_by !== '')
        const correction = SALES_RECEIPTS.find(row => row.id === voided?.replaced_by)
        expect(
            correction && {
                status: correction.status,
                replaces: correction.replaces,
                number: correction.number,
            },
            'a void with its correction'
        ).toEqual({ status: 'posted', replaces: voided?.id, number: voided?.number })

        expect(new Set(SALES_RECEIPT_LINES.map(line => line.kind))).toEqual(
            new Set(['item', 'description', 'subtotal', 'percent'])
        )

        expect(SALES_RECEIPT_LINES.some(line => line.description.length > 200)).toBe(true)
        expect(LONG_REFERENCE.length).toBe(40)
        expect(SALES_RECEIPTS.some(row => row.reference_no === LONG_REFERENCE)).toBe(true)

        const exemptIds = new Set<string>(
            CUSTOMER_TAX_PATCHES.filter(p => p.tax_exempt).map(p => p.id)
        )
        const exempt = SALES_RECEIPTS.find(row => exemptIds.has(row.customer))
        expect(exempt?.customer, "the exempt customer's receipt").toBe(CUSTOMER_IDS.northwind)
        expect(exempt?.tax_total).toBe(0)
        expect(linesOf(exempt?.id ?? '').every(line => !line.taxable)).toBe(true)
    })
})
