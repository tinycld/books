import { describe, expect, it } from 'vitest'
import { mergeRefundable } from '../tinycld/books/lib/refundable-credits'

// The refund form's credits list (vendor refund spec §3.4): the vendor's posted credits
// with a balance above zero, oldest credit date first, then number; a draft or correction
// also lists each credit its stored lines name, even one whose balance has since become
// zero, once.
//
// Test-writer decision on the shape: an open credit is the query's row (`id`, `number`,
// `date`, `total`, `balance`, `ref_no`); a stored line is `{ credit, amount, isPosted }`,
// where `isPosted` says the line is a posted refund's (the correction's original), whose
// amount the credit's balance has already lost. A draft's line has not lowered the
// balance.

type OpenCredit = Parameters<typeof mergeRefundable>[0][number]

function credit(row: Partial<OpenCredit> & Pick<OpenCredit, 'id' | 'number' | 'date'>): OpenCredit {
    return { total: 10_000, balance: 10_000, ref_no: '', ...row }
}

const OLDER = credit({
    id: 'vcrdolder000001',
    number: '1009',
    date: '2026-11-02 00:00:00.000Z',
    total: 10_000,
    balance: 10_000,
    ref_no: 'CM-1',
})
const SAME_DAY_LOW = credit({
    id: 'vcrdsamelow0001',
    number: '1006',
    date: '2026-11-05 00:00:00.000Z',
    total: 25_000,
    balance: 25_000,
})
const SAME_DAY_HIGH = credit({
    id: 'vcrdsamehigh001',
    number: '1008',
    date: '2026-11-05 00:00:00.000Z',
    total: 30_000,
    balance: 12_000,
    ref_no: 'CM-8841',
})
// Refunded in full since the draft or the original was saved: no longer open.
const USED_UP = credit({
    id: 'vcrdusedup00001',
    number: '1004',
    date: '2026-11-01 00:00:00.000Z',
    total: 5_000,
    balance: 0,
    ref_no: 'CM-0',
})

function rowsOf(open: OpenCredit[], stored: Parameters<typeof mergeRefundable>[1]) {
    return mergeRefundable(open, stored).map(row => ({
        id: row.id,
        number: row.number,
        date: row.date,
        total: row.total,
        open: row.open,
        ref: row.ref,
    }))
}

describe('mergeRefundable', () => {
    it('orders the open credits by credit date, then number', () => {
        const rows = rowsOf([SAME_DAY_HIGH, OLDER, SAME_DAY_LOW], [])
        expect(rows.map(row => row.number)).toEqual(['1009', '1006', '1008'])
        expect(rows[0]).toEqual({
            id: OLDER.id,
            number: '1009',
            date: '2026-11-02',
            total: 10_000,
            open: 10_000,
            ref: 'CM-1',
        })
        // A row's open amount is the credit's unapplied balance.
        expect(rows[2].open).toBe(12_000)
        expect(rows[2].ref).toBe('CM-8841')
    })

    it("lists a draft's stored credit whose balance is 0, open for its own line", () => {
        const rows = rowsOf([OLDER], [{ credit: USED_UP, amount: 3_000, isPosted: false }])
        expect(rows.map(row => row.id)).toEqual([USED_UP.id, OLDER.id])
        expect(rows[0]).toMatchObject({ number: '1004', date: '2026-11-01', open: 3_000 })
    })

    it("lists a correction's stored credit with its balance plus its own line", () => {
        const rows = rowsOf([OLDER], [{ credit: USED_UP, amount: 5_000, isPosted: true }])
        expect(rows.find(row => row.id === USED_UP.id)?.open).toBe(5_000)
        // A credit still open: what the original refunded is free again for the correction.
        const both = rowsOf(
            [SAME_DAY_HIGH],
            [{ credit: SAME_DAY_HIGH, amount: 8_000, isPosted: true }]
        )
        expect(both).toHaveLength(1)
        expect(both[0].open).toBe(20_000)
    })

    it('lists a credit that is both open and stored once', () => {
        const rows = rowsOf(
            [OLDER, SAME_DAY_LOW],
            [{ credit: SAME_DAY_LOW, amount: 4_000, isPosted: false }]
        )
        expect(rows.map(row => row.id)).toEqual([OLDER.id, SAME_DAY_LOW.id])
        // A draft's line has not lowered the balance: the open amount is the balance.
        expect(rows[1].open).toBe(25_000)
    })
})
