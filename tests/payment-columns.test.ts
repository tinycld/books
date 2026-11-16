import { describe, expect, it } from 'vitest'
import {
    BILL_PAYMENT_APPLIED_MIN_WIDTH,
    BILL_PAYMENT_COLUMNS,
    BILL_PAYMENT_GRID_MIN_WIDTH,
    PAYMENT_APPLIED_MIN_WIDTH,
    PAYMENT_CARDS_BELOW,
    PAYMENT_GRID_MIN_WIDTH,
} from '../tinycld/books/lib/payment-columns'

// The payment grids' widths: the invoice set stays as receive-payment shipped it, the bill
// set (Pay Bills, the bill payment read view) is its own.

describe('payment column widths', () => {
    it('keeps the invoice grids’ narrowest widths', () => {
        // 44 + 200 + 172 + 128 + 128 + 160, 5 gaps of 12, 2 × 8 padding.
        expect(PAYMENT_GRID_MIN_WIDTH).toBe(908)
        // 200 + 172 + 128 + 160, 3 gaps of 12, 2 × 8 padding.
        expect(PAYMENT_APPLIED_MIN_WIDTH).toBe(712)
        expect(PAYMENT_CARDS_BELOW).toBe(640)
    })

    it('gives the bill grid its own columns', () => {
        expect(BILL_PAYMENT_COLUMNS).toEqual({
            tick: 44,
            party: { flex: 1, minWidth: 130 },
            bill: { flex: 1, minWidth: 110 },
            dueDate: 168,
            original: 120,
            open: 128,
            payment: 130,
        })
    })

    it('makes the bill grid 918 wide at its narrowest', () => {
        // 44 + 130 + 110 + 168 + 120 + 128 + 130, 6 gaps of 12, 2 × 8 padding.
        expect(BILL_PAYMENT_GRID_MIN_WIDTH).toBe(918)
    })

    it('makes the Bills paid grid fit its five columns', () => {
        // Bill 130 · Vendor's bill no. 140 · Due date 168 · Bill total 128 · Paid 128, 4 gaps
        // of 12, 2 × 8 padding.
        expect(BILL_PAYMENT_APPLIED_MIN_WIDTH).toBe(130 + 140 + 168 + 128 + 128 + 4 * 12 + 16)
    })
})
