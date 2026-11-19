import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from '@tinycld/core/ui/form'
import { describe, expect, it } from 'vitest'
import { REFUND_RECEIPT_MESSAGES } from '../tinycld/books/lib/document-texts'
import {
    payoutRefusal,
    payoutVoidBodyOf,
    refundPayoutRule,
} from '../tinycld/books/lib/refund-payout'

// A payout's cap and date rule (refund receipt spec §3.3). The case table is the one the
// Go test runs against `refundPayoutRefusal` (server/refund_receipt_payout_test.go), so
// the client and the server refuse the same refund with the same field and text.

type PayoutCase = {
    name: string
    total: number
    unapplied: number
    memoNumber: string
    memoDate: string
    refundDate: string
    currency: string
    want: { field: string; message: string } | null
}

const CASES = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'refund_payout_cases.json'), 'utf8')
) as PayoutCase[]

describe('payoutRefusal', () => {
    it('reads the shared case table', () => {
        expect(CASES.length).toBeGreaterThanOrEqual(9)
        expect(CASES.some(c => c.want === null)).toBe(true)
        expect(CASES.some(c => c.want?.field === 'credit_memo')).toBe(true)
        expect(CASES.some(c => c.want?.field === 'date')).toBe(true)
    })

    it.each(CASES.map(c => [c.name, c] as const))('%s', (_name, c) => {
        const { total, unapplied, memoNumber, memoDate, refundDate, currency } = c
        expect(
            payoutRefusal({ total, unapplied, memoNumber, memoDate, refundDate, currency })
        ).toEqual(c.want)
    })
})

// A form's values whose total is $300.00 whatever the header tax: one Item line of
// 1 × 300.00 that is not taxable.
function payoutValues(date: string) {
    return {
        date,
        tax_rate: '',
        lines: [
            {
                id: 'rrlinepayout001',
                kind: 'item',
                product: 'prodpayout00001',
                description: 'Refund of the unused credit',
                quantity: 1,
                rate: '300.00',
                amount: null,
                taxable: false,
            },
        ],
    }
}

function issuesOf(
    limits: Parameters<typeof refundPayoutRule>[0],
    values: ReturnType<typeof payoutValues>
) {
    const schema = z.object({}).passthrough().superRefine(refundPayoutRule(limits))
    const result = schema.safeParse(values)
    if (result.success) return []
    return result.error.issues.map(issue => ({ path: issue.path, message: issue.message }))
}

const MEMO = { memoNumber: '1001', memoDate: '2026-11-12', currency: 'USD' }

describe('refundPayoutRule', () => {
    it('adds no issue without payout limits (a refund that is no payout)', () => {
        expect(issuesOf(null, payoutValues('2026-11-01'))).toEqual([])
    })

    it('adds no issue for a total within the unapplied credit, dated on the memo day', () => {
        expect(issuesOf({ unapplied: 30_000, ...MEMO }, payoutValues('2026-11-12'))).toEqual([])
    })

    it('puts the cap on credit_memo when the total is above the unapplied credit', () => {
        expect(issuesOf({ unapplied: 25_000, ...MEMO }, payoutValues('2026-11-12'))).toEqual([
            {
                path: ['credit_memo'],
                message:
                    'The refund is more than the unapplied credit of $250.00 on credit memo 1001.',
            },
        ])
    })

    it("puts the date rule on date when the refund is dated before the memo's date", () => {
        expect(issuesOf({ unapplied: 30_000, ...MEMO }, payoutValues('2026-11-11'))).toEqual([
            {
                path: ['date'],
                message: "Date the refund on or after the credit memo's date, Nov 12, 2026.",
            },
        ])
    })
})

// The void dialog's body of a refund receipt (spec §3.3): a payout's says its credit is
// unapplied again; a refund that names no credit memo keeps the kind's own body.
describe('payoutVoidBodyOf', () => {
    it('gives no body for a refund that names no credit memo', () => {
        expect(payoutVoidBodyOf('')).toBeUndefined()
    })

    it("gives the payout's void body for a refund that names a credit memo", () => {
        expect(payoutVoidBodyOf('cmemopayout0001')).toBe(REFUND_RECEIPT_MESSAGES.payoutVoidBody)
    })
})
