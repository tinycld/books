import { describe, expect, expectTypeOf, it } from 'vitest'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import {
    linesOfRefund,
    REFUND_ACCOUNTS,
    refundCreditById,
    VENDOR_REFUND_LINES,
    VENDOR_REFUND_SEED_CREDIT_IDS,
    VENDOR_REFUND_SEED_CREDIT_LINE,
    VENDOR_REFUND_SEED_IDS,
    VENDOR_REFUND_VENDOR_IDS,
    VENDOR_REFUNDS,
    type VendorRefundLineRecord,
    type VendorRefundRecord,
    vendorRefundVendorName,
} from '../tinycld/books/lib/vendor-refund-fixture'
import type { BooksVendorRefundLines, BooksVendorRefunds } from '../tinycld/books/types'

// The vendor refund fixture (vendor refund spec §4 Seed): the reference shots and the seed
// (seedVendorRefunds) read it, so a refund whose lines do not add up, or a seed row that is
// not the spec's, is a fixture bug.

function refundOf(id: string) {
    const row = VENDOR_REFUNDS.find(refund => refund.id === id)
    if (!row) throw new Error(`no fixture refund ${id}`)
    return row
}

function accountNumberOf(accountId: string) {
    return REFUND_ACCOUNTS.find(account => account.id === accountId)?.number
}

describe('generated vendor refund types', () => {
    it('the fixture types are the generated types, and the rows satisfy them', () => {
        // tsc fails here until the migration and the generated types exist.
        expectTypeOf<VendorRefundRecord>().toEqualTypeOf<BooksVendorRefunds>()
        expectTypeOf<VendorRefundLineRecord>().toEqualTypeOf<BooksVendorRefundLines>()
        VENDOR_REFUNDS satisfies BooksVendorRefunds[]
        VENDOR_REFUND_LINES satisfies BooksVendorRefundLines[]
        const amount: BooksVendorRefunds['amount'] = refundOf(VENDOR_REFUND_SEED_IDS[0]).amount
        expect(amount).toBe(15_000)
    })
})

describe('the seeded vendor refund rows', () => {
    it('seed one credit of 425.00 on 6100 for Cascade Fuel & Fleet', () => {
        expect(VENDOR_REFUND_SEED_CREDIT_IDS).toHaveLength(1)
        const credit = refundCreditById(VENDOR_REFUND_SEED_CREDIT_IDS[0])
        expect(vendorRefundVendorName(credit?.vendor ?? '')).toBe('Cascade Fuel & Fleet')
        expect(credit?.total).toBe(42_500)
        expect(VENDOR_REFUND_SEED_CREDIT_LINE).toMatchObject({
            vendor_credit: VENDOR_REFUND_SEED_CREDIT_IDS[0],
            account_number: '6100',
            amount: 42_500,
        })
        expect(SEED_ACCOUNTS.map(account => account.number)).toContain('6100')
    })

    it('seed a posted 150.00 to 1000, a void 100.00 and a draft 275.00 to 1200, in that order', () => {
        const rows = VENDOR_REFUND_SEED_IDS.map(refundOf)
        expect(
            rows.map(row => ({
                vendor: row.vendor,
                status: row.status,
                amount: row.amount,
                account: accountNumberOf(row.refunded_to),
            }))
        ).toEqual([
            {
                vendor: VENDOR_REFUND_VENDOR_IDS.cascade,
                status: 'posted',
                amount: 15_000,
                account: '1000',
            },
            {
                vendor: VENDOR_REFUND_VENDOR_IDS.cascade,
                status: 'void',
                amount: 10_000,
                account: '1000',
            },
            {
                vendor: VENDOR_REFUND_VENDOR_IDS.cascade,
                status: 'draft',
                amount: 27_500,
                account: '1200',
            },
        ])
        expect(rows.map(row => row.date).slice(0, 2)).toEqual(['2026-11-10', '2026-11-11'])
    })

    it('every refund’s lines add up to its amount, and a seeded refund refunds only the seeded credit', () => {
        for (const row of VENDOR_REFUNDS) {
            const lines = linesOfRefund(row.id)
            expect(lines.length, row.id).toBeGreaterThan(0)
            expect(
                lines.reduce((sum, line) => sum + line.amount, 0),
                row.id
            ).toBe(row.amount)
        }
        for (const id of VENDOR_REFUND_SEED_IDS) {
            expect(linesOfRefund(id).map(line => line.vendor_credit)).toEqual([
                VENDOR_REFUND_SEED_CREDIT_IDS[0],
            ])
        }
    })

    it('leaves the seeded credit 275.00 unapplied: its total less the posted refund', () => {
        const creditId = VENDOR_REFUND_SEED_CREDIT_IDS[0]
        const posted = VENDOR_REFUND_LINES.filter(
            line => line.vendor_credit === creditId && refundOf(line.refund).status === 'posted'
        ).reduce((sum, line) => sum + line.amount, 0)
        expect(42_500 - posted).toBe(27_500)
        expect(refundCreditById(creditId)?.balance).toBe(27_500)
    })
})
