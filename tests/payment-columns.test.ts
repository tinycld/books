import { describe, expect, it } from 'vitest'
import { BILL_OUTSTANDING, INVOICE_OUTSTANDING } from '../tinycld/books/lib/outstanding-documents'
import {
    BILL_PAYMENT_APPLIED_COLUMNS,
    BILL_PAYMENT_APPLIED_MIN_WIDTH,
    BILL_PAYMENT_COLUMNS,
    BILL_PAYMENT_GRID_MIN_WIDTH,
    PAYMENT_APPLIED_MIN_WIDTH,
    PAYMENT_COLUMNS,
    PAYMENT_GRID_MIN_WIDTH,
} from '../tinycld/books/lib/payment-columns'

// The payment grids' columns (human, eval revise 1): every data column flexes with a least
// width of 95; the tick column stays 44. A grid's least width is its columns, a 12 px gap
// between two cells and 8 px of row padding on each side; below it the list shows cards.
// The document (Invoice / Bill) and Due date columns take two shares of the free width
// (human, eval revise 2), so the link label and "· Overdue" fit at 1280 px.

const DATA = { flex: 1, minWidth: 95 }
const WIDE = { flex: 2, minWidth: 95 }

describe('payment column widths', () => {
    it('makes every invoice data column flex with a least width of 95', () => {
        expect(PAYMENT_COLUMNS).toEqual({
            tick: 44,
            invoice: WIDE,
            dueDate: WIDE,
            original: DATA,
            open: DATA,
            payment: DATA,
        })
    })

    it('makes every bill data column flex with a least width of 95', () => {
        expect(BILL_PAYMENT_COLUMNS).toEqual({
            tick: 44,
            party: DATA,
            bill: WIDE,
            dueDate: WIDE,
            original: DATA,
            open: DATA,
            payment: DATA,
        })
        expect(BILL_PAYMENT_APPLIED_COLUMNS).toEqual({
            bill: WIDE,
            ref: DATA,
            dueDate: WIDE,
            original: DATA,
            paid: DATA,
        })
    })

    it('computes the Receive Payment grids’ least widths from their columns', () => {
        // Tick 44 + 5 × 95, 5 gaps of 12, 2 × 8 padding.
        expect(PAYMENT_GRID_MIN_WIDTH).toBe(595)
        // 4 × 95 (Invoice, Due date, Original, Applied), 3 gaps of 12, 2 × 8 padding.
        expect(PAYMENT_APPLIED_MIN_WIDTH).toBe(432)
    })

    it('computes the Pay Bills grids’ least widths from their columns', () => {
        // Tick 44 + 6 × 95, 6 gaps of 12, 2 × 8 padding.
        expect(BILL_PAYMENT_GRID_MIN_WIDTH).toBe(702)
        // 5 × 95 (Bill, Vendor's bill no., Due date, Bill total, Paid), 4 gaps of 12, 2 × 8.
        expect(BILL_PAYMENT_APPLIED_MIN_WIDTH).toBe(539)
    })

    it('gives each descriptor its grids’ least widths for the grid/card switch', () => {
        expect(INVOICE_OUTSTANDING.gridMinWidth).toBe(595)
        expect(INVOICE_OUTSTANDING.appliedMinWidth).toBe(432)
        expect(BILL_OUTSTANDING.gridMinWidth).toBe(702)
        expect(BILL_OUTSTANDING.appliedMinWidth).toBe(539)
    })
})
