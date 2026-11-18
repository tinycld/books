import { describe, expect, expectTypeOf, it } from 'vitest'
import {
    CREDIT_MEMO_SEED_DRAFT_ID,
    CREDIT_MEMO_SEED_IDS,
    CREDIT_MEMOS,
} from '../tinycld/books/lib/credit-memo-form-fixture'
import { type DocumentTax, documentTotals } from '../tinycld/books/lib/document-lines'
import {
    REFUND_PAYOUT_NOTICE,
    REFUND_RECEIPT_CREDITS,
    REFUND_RECEIPT_IDS,
    REFUND_RECEIPT_LINES,
    REFUND_RECEIPT_REFUSALS,
    REFUND_RECEIPT_SEED_DRAFT_ID,
    REFUND_RECEIPT_SEED_IDS,
    REFUND_RECEIPT_TAX_LINES,
    REFUND_RECEIPTS,
    REFUND_SEED_CREDIT_MEMO,
    REFUND_SEED_CREDIT_MEMO_LINES,
    REFUND_SEED_PAYOUT,
    REFUND_SEED_PAYOUT_LINES,
    type RefundReceiptCreditRecord,
    type RefundReceiptLineRecord,
    type RefundReceiptRecord,
    type RefundReceiptTaxLineRecord,
} from '../tinycld/books/lib/refund-receipt-form-fixture'
import { TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'
import type {
    BooksCreditMemoLines,
    BooksCreditMemos,
    BooksRefundReceiptCredits,
    BooksRefundReceiptLines,
    BooksRefundReceipts,
    BooksRefundReceiptTaxLines,
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

type TotalsLine = Pick<
    RefundReceiptLineRecord,
    'kind' | 'quantity' | 'rate' | 'percent_ppm' | 'taxable' | 'position'
>

function totalsOf(lines: TotalsLine[], rateId: string) {
    const totals = documentTotals(
        [...lines]
            .sort((a, b) => a.position - b.position)
            .map(line => ({
                kind: line.kind,
                quantity: line.quantity,
                rate: line.rate,
                percentPpm: line.percent_ppm,
                taxable: line.taxable,
            })),
        taxOf(rateId)
    )
    return { subtotal: totals.subtotal, tax_total: totals.taxTotal, total: totals.total }
}

// Every refund the fixture holds: the reference rows and the seed-only payout
// (spec §4.6, plan decision "Seed pick").
function allRefunds(): RefundReceiptRecord[] {
    return [...REFUND_RECEIPTS, REFUND_SEED_PAYOUT]
}

function allRefundLines(): RefundReceiptLineRecord[] {
    return [...REFUND_RECEIPT_LINES, ...REFUND_SEED_PAYOUT_LINES]
}

describe('generated refund receipt types', () => {
    it('the fixture types are the generated types, and the rows satisfy them', () => {
        // tsc fails here until the migration and the generated types exist.
        expectTypeOf<RefundReceiptRecord>().toEqualTypeOf<BooksRefundReceipts>()
        expectTypeOf<RefundReceiptLineRecord>().toEqualTypeOf<BooksRefundReceiptLines>()
        expectTypeOf<RefundReceiptTaxLineRecord>().toEqualTypeOf<BooksRefundReceiptTaxLines>()
        expectTypeOf<RefundReceiptCreditRecord>().toEqualTypeOf<BooksRefundReceiptCredits>()
        REFUND_RECEIPTS satisfies BooksRefundReceipts[]
        REFUND_RECEIPT_LINES satisfies BooksRefundReceiptLines[]
        REFUND_RECEIPT_TAX_LINES satisfies BooksRefundReceiptTaxLines[]
        REFUND_RECEIPT_CREDITS satisfies BooksRefundReceiptCredits[]
        REFUND_SEED_PAYOUT satisfies BooksRefundReceipts
        REFUND_SEED_PAYOUT_LINES satisfies BooksRefundReceiptLines[]
        REFUND_SEED_CREDIT_MEMO satisfies BooksCreditMemos
        REFUND_SEED_CREDIT_MEMO_LINES satisfies BooksCreditMemoLines[]
        expect(REFUND_SEED_PAYOUT.credit_memo).toBe(REFUND_SEED_CREDIT_MEMO.id)
    })
})

describe('REFUND_RECEIPTS', () => {
    it('subtotal, tax_total and total equal documentTotals of each refund’s own lines and tax rate', () => {
        const lines = allRefundLines()
        for (const row of allRefunds()) {
            const own = lines.filter(line => line.refund_receipt === row.id)
            expect(own.length, row.id).toBeGreaterThan(0)
            expect(
                { subtotal: row.subtotal, tax_total: row.tax_total, total: row.total },
                row.id
            ).toEqual(totalsOf(own, row.tax_rate))
        }
    })

    it('the seed-only credit memo’s totals equal documentTotals of its own lines and tax rate', () => {
        const own = REFUND_SEED_CREDIT_MEMO_LINES.filter(
            line => line.credit_memo === REFUND_SEED_CREDIT_MEMO.id
        )
        expect(own.length).toBeGreaterThan(0)
        expect({
            subtotal: REFUND_SEED_CREDIT_MEMO.subtotal,
            tax_total: REFUND_SEED_CREDIT_MEMO.tax_total,
            total: REFUND_SEED_CREDIT_MEMO.total,
        }).toEqual(totalsOf(own, REFUND_SEED_CREDIT_MEMO.tax_rate))
    })

    // Spec §4.1, §4.3: a plain refund writes its tax snapshot negated.
    it('every tax line figure is 0 or below, and a plain refund’s rows sum to its negated tax_total', () => {
        for (const line of REFUND_RECEIPT_TAX_LINES) {
            expect(line.gross_amount, line.id).toBeLessThanOrEqual(0)
            expect(line.taxable_amount, line.id).toBeLessThanOrEqual(0)
            expect(line.amount, line.id).toBeLessThanOrEqual(0)
        }
        const taxed = allRefunds().filter(
            row => row.status !== 'draft' && row.tax_rate !== '' && row.credit_memo === ''
        )
        expect(taxed.length).toBeGreaterThan(0)
        for (const row of taxed) {
            const rows = REFUND_RECEIPT_TAX_LINES.filter(line => line.refund_receipt === row.id)
            expect(rows.length, row.id).toBeGreaterThan(0)
            const sum = rows.reduce((total, line) => total + line.amount, 0)
            expect(sum, row.id).toBe(row.tax_total === 0 ? 0 : -row.tax_total)
        }
    })

    // Spec §3.13, Q10: a payout writes no tax lines; its post writes one credits
    // row of its total.
    it('a payout has no tax line and one credits row of its total', () => {
        const payout = REFUND_RECEIPTS.find(row => row.id === REFUND_RECEIPT_IDS.payout)
        expect(payout?.credit_memo).not.toBe('')
        for (const row of allRefunds().filter(r => r.credit_memo !== '')) {
            expect(
                REFUND_RECEIPT_TAX_LINES.filter(line => line.refund_receipt === row.id),
                row.id
            ).toEqual([])
        }
        const credits = REFUND_RECEIPT_CREDITS.filter(row => row.refund_receipt === payout?.id)
        expect(credits.map(row => ({ credit_memo: row.credit_memo, amount: row.amount }))).toEqual([
            { credit_memo: payout?.credit_memo, amount: payout?.total },
        ])
    })

    it('every id is 15 characters', () => {
        const ids = [
            ...allRefunds().map(row => row.id),
            ...allRefundLines().map(row => row.id),
            ...REFUND_RECEIPT_TAX_LINES.map(row => row.id),
            ...REFUND_RECEIPT_CREDITS.map(row => row.id),
            REFUND_SEED_CREDIT_MEMO.id,
            ...REFUND_SEED_CREDIT_MEMO_LINES.map(row => row.id),
        ]
        expect(ids.length).toBeGreaterThan(0)
        expect(ids.filter(id => id.length !== 15)).toEqual([])
    })

    it('every date is after 2026-06-30', () => {
        const rows = [...allRefunds(), REFUND_SEED_CREDIT_MEMO]
        expect(rows.filter(row => !(row.date > '2026-06-30')).map(row => row.id)).toEqual([])
    })

    it('the seed ids name rows that exist: posted refunds and one draft', () => {
        const refunds = allRefunds()
        const seeded = REFUND_RECEIPT_SEED_IDS.map(id => refunds.find(row => row.id === id))
        expect(seeded.map(row => row?.status)).toEqual(REFUND_RECEIPT_SEED_IDS.map(() => 'posted'))
        expect(refunds.find(row => row.id === REFUND_RECEIPT_SEED_DRAFT_ID)?.status).toBe('draft')
        expect(REFUND_SEED_CREDIT_MEMO.status).toBe('posted')
        expect(REFUND_SEED_PAYOUT.status).toBe('posted')
    })

    // Plan decision "Seed pick": a payout of part of the seed-only memo, of the
    // memo's customer, not dated before it.
    it('the seed payout pays out part of the seed-only memo, for the memo’s customer', () => {
        expect(REFUND_SEED_PAYOUT.credit_memo).toBe(REFUND_SEED_CREDIT_MEMO.id)
        expect(REFUND_SEED_PAYOUT.total).toBeGreaterThan(0)
        expect(REFUND_SEED_PAYOUT.total).toBeLessThan(REFUND_SEED_CREDIT_MEMO.total)
        expect(REFUND_SEED_PAYOUT.customer).toBe(REFUND_SEED_CREDIT_MEMO.customer)
        expect(REFUND_SEED_PAYOUT.date >= REFUND_SEED_CREDIT_MEMO.date).toBe(true)
        expect(REFUND_SEED_CREDIT_MEMO.customer).not.toBe('')
    })

    // The seed must not touch a credit memo p2-credit-memo seeded: the memo it
    // pays out belongs to a customer none of those memos names.
    it('the seed-only memo’s customer is on no seeded credit memo of the credit memo fixture', () => {
        const seededMemoIds = [...CREDIT_MEMO_SEED_IDS, CREDIT_MEMO_SEED_DRAFT_ID]
        const customers = seededMemoIds.map(id => CREDIT_MEMOS.find(row => row.id === id)?.customer)
        expect(customers.every(c => c !== undefined)).toBe(true)
        expect(customers).not.toContain(REFUND_SEED_CREDIT_MEMO.customer)
        expect(seededMemoIds).not.toContain(REFUND_SEED_CREDIT_MEMO.id)
    })
})

// The texts of the plan's Decisions (Messages). From checkpoint 3 on this reads
// REFUND_RECEIPT_MESSAGES as well.
describe('REFUND_RECEIPT_REFUSALS and REFUND_PAYOUT_NOTICE', () => {
    it('equal the texts of the Decisions', () => {
        expect(REFUND_RECEIPT_REFUSALS).toMatchObject({
            refundFrom: 'Choose an active bank or Undeposited funds account',
            noRefundFrom:
                'Add a bank account or an Undeposited funds account to the chart of accounts',
            zeroTotal:
                'A refund receipt with a total of zero cannot be posted. Add an amount or keep it as a draft.',
            negativeTotal: 'A refund receipt total cannot be below zero. Use a sales receipt.',
            tooLarge: 'The refund receipt total is more than Books can store.',
            salesReceiptLink: 'Choose a posted sales receipt of this customer.',
            creditMemoLink: 'Choose a posted credit memo of this customer with unapplied credit.',
            noLines: 'Add at least one product or service line',
            noAccess: 'You need bookkeeper access to create refund receipts',
            notFound: 'This refund receipt does not exist',
            cannotEdit: 'This refund receipt cannot be edited',
            cannotRefundReceipt: 'This sales receipt cannot be refunded',
            cannotRefundMemo: 'This credit memo cannot be refunded',
            receiptCustomerLocked:
                'Refund receipts are made from this sales receipt, so its customer cannot change.',
            memoVoid: 'A refund receipt is recorded on this credit memo. Void the refund first.',
        })
        expect(REFUND_RECEIPT_REFUSALS.inactiveCustomer).toMatch(
            /^.+ is inactive\. Choose an active customer\.$/
        )
        expect(REFUND_RECEIPT_REFUSALS.payoutCap).toMatch(
            /^The refund is more than the unapplied credit of \$[\d,]+\.\d\d on credit memo \S+\.$/
        )
        expect(REFUND_RECEIPT_REFUSALS.payoutDate).toMatch(
            /^Date the refund on or after the credit memo's date, [A-Z][a-z]{2} \d{1,2}, \d{4}\.$/
        )
        expect(REFUND_RECEIPT_REFUSALS.customerOnRefunds).toMatch(
            /^.+ is on refund receipts\. Make it inactive instead\.$/
        )
        expect(REFUND_PAYOUT_NOTICE).toBe(
            'This refund pays out a credit. It lowers what Books owes the customer; income and sales tax were lowered by the credit memo.'
        )
    })
})
