import { describe, expect, it } from 'vitest'
import {
    BILL_OUTSTANDING,
    CREDIT_OUTSTANDING,
    INVOICE_OUTSTANDING,
    paymentCellLabel,
    rowTickLabel,
} from '../tinycld/books/lib/outstanding-documents'
import {
    BILL_PAYMENT_COLUMNS,
    BILL_PAYMENT_GRID_MIN_WIDTH,
    PAYMENT_CELL_GAP,
    PAYMENT_COLUMNS,
    PAYMENT_GRID_MIN_WIDTH,
    PAYMENT_ROW_PADDING,
} from '../tinycld/books/lib/payment-columns'
import { BILL_KIND } from '../tinycld/books/lib/sales-document-kinds'

// The outstanding grid's third descriptor (vendor credit spec §3.9): the apply dialog's
// bills, with no Bill total column, no header tick box or Pay all, and "Credit to apply"
// as the last header and the cell's name. The invoice and bill descriptors keep theirs.

const DATA_COLUMN = { flex: 1, minWidth: 95 }

describe('CREDIT_OUTSTANDING', () => {
    it('lists bills of no party column, opening each bill', () => {
        expect(CREDIT_OUTSTANDING.key).toBe('credit')
        expect(CREDIT_OUTSTANDING.noun).toBe('Bill')
        expect(CREDIT_OUTSTANDING.openKind).toBe(BILL_KIND)
        expect(CREDIT_OUTSTANDING.testIdPrefix).toBe('apply-credit')
        expect(CREDIT_OUTSTANDING.party).toBe('none')
        expect(CREDIT_OUTSTANDING.columns.party).toBeNull()
    })

    it('has no original (Bill total) column', () => {
        expect(CREDIT_OUTSTANDING.columns.original).toBeNull()
    })

    it('has no header tick box or Pay all, and "Credit to apply" as the last header', () => {
        expect(CREDIT_OUTSTANDING.hasPayAll).toBe(false)
        expect(CREDIT_OUTSTANDING.paymentHeader).toBe('Credit to apply')
    })

    it('has a 44 px tick column and every data column flex 1 with a least width of 95', () => {
        const { columns } = CREDIT_OUTSTANDING
        expect(columns.tick).toBe(44)
        expect(columns.document).toEqual(DATA_COLUMN)
        expect(columns.dueDate).toEqual(DATA_COLUMN)
        expect(columns.open).toEqual(DATA_COLUMN)
        expect(columns.payment).toEqual(DATA_COLUMN)
    })

    it('has a least width of its columns, the gaps between them and the row padding', () => {
        // Tick, Bill, Due date, Open balance, Credit to apply: five cells, four gaps.
        const cells = 44 + 4 * 95
        expect(CREDIT_OUTSTANDING.gridMinWidth).toBe(
            cells + 4 * PAYMENT_CELL_GAP + 2 * PAYMENT_ROW_PADDING
        )
        expect(CREDIT_OUTSTANDING.gridMinWidth).toBe(488)
    })

    it('keeps the bill payment read view’s applied width', () => {
        expect(CREDIT_OUTSTANDING.appliedMinWidth).toBe(BILL_OUTSTANDING.appliedMinWidth)
    })

    it('names a row’s tick box "Apply to bill 1003" and its cell "Credit to apply to bill 1003"', () => {
        expect(rowTickLabel(CREDIT_OUTSTANDING, '1003')).toBe('Apply to bill 1003')
        expect(paymentCellLabel(CREDIT_OUTSTANDING, '1003')).toBe('Credit to apply to bill 1003')
    })
})

describe('BILL_OUTSTANDING and INVOICE_OUTSTANDING keep their grid', () => {
    it('keep the header tick box and Pay all, and the "Payment" header', () => {
        for (const doc of [BILL_OUTSTANDING, INVOICE_OUTSTANDING]) {
            expect(doc.hasPayAll, doc.noun).toBe(true)
            expect(doc.paymentHeader, doc.noun).toBe('Payment')
        }
        expect(BILL_OUTSTANDING.key).toBe('bill')
        expect(INVOICE_OUTSTANDING.key).toBe('invoice')
    })

    it('keep their columns and least widths', () => {
        expect(BILL_OUTSTANDING.columns).toEqual({
            tick: BILL_PAYMENT_COLUMNS.tick,
            party: BILL_PAYMENT_COLUMNS.party,
            document: BILL_PAYMENT_COLUMNS.bill,
            dueDate: BILL_PAYMENT_COLUMNS.dueDate,
            original: BILL_PAYMENT_COLUMNS.original,
            open: BILL_PAYMENT_COLUMNS.open,
            payment: BILL_PAYMENT_COLUMNS.payment,
        })
        expect(BILL_OUTSTANDING.gridMinWidth).toBe(BILL_PAYMENT_GRID_MIN_WIDTH)
        expect(INVOICE_OUTSTANDING.columns).toEqual({
            tick: PAYMENT_COLUMNS.tick,
            party: null,
            document: PAYMENT_COLUMNS.invoice,
            dueDate: PAYMENT_COLUMNS.dueDate,
            original: PAYMENT_COLUMNS.original,
            open: PAYMENT_COLUMNS.open,
            payment: PAYMENT_COLUMNS.payment,
        })
        expect(INVOICE_OUTSTANDING.gridMinWidth).toBe(PAYMENT_GRID_MIN_WIDTH)
    })

    it('keep their row names', () => {
        expect(rowTickLabel(BILL_OUTSTANDING, '1003')).toBe('Pay bill 1003')
        expect(paymentCellLabel(BILL_OUTSTANDING, '1003')).toBe('Payment for bill 1003')
        expect(rowTickLabel(INVOICE_OUTSTANDING, '1004')).toBe('Pay invoice 1004')
        expect(paymentCellLabel(INVOICE_OUTSTANDING, '1004')).toBe('Payment for invoice 1004')
    })
})
