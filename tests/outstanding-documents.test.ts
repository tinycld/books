import { describe, expect, it } from 'vitest'
import {
    BILL_OUTSTANDING,
    CREDIT_OUTSTANDING,
    INVOICE_CREDITS_OUTSTANDING,
    INVOICE_OUTSTANDING,
    MEMO_INVOICES_OUTSTANDING,
    outstandingTexts,
    paymentCellLabel,
    REFUND_OUTSTANDING,
    rowTickLabel,
    totalTexts,
} from '../tinycld/books/lib/outstanding-documents'
import {
    BILL_PAYMENT_COLUMNS,
    BILL_PAYMENT_GRID_MIN_WIDTH,
    CREDIT_APPLY_COLUMNS,
    CREDIT_APPLY_GRID_MIN_WIDTH,
    MEMO_APPLY_COLUMNS,
    MEMO_APPLY_GRID_MIN_WIDTH,
    PAYMENT_CELL_GAP,
    PAYMENT_COLUMNS,
    PAYMENT_GRID_MIN_WIDTH,
    PAYMENT_ROW_PADDING,
    REFUND_APPLIED_MIN_WIDTH,
    REFUND_COLUMNS,
    REFUND_GRID_MIN_WIDTH,
} from '../tinycld/books/lib/payment-columns'
import {
    BILL_KIND,
    CREDIT_MEMO_KIND,
    INVOICE_KIND,
    VENDOR_CREDIT_KIND,
} from '../tinycld/books/lib/sales-document-kinds'

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

    it('keep their date and open column texts and the overdue mark', () => {
        for (const doc of [INVOICE_OUTSTANDING, BILL_OUTSTANDING, CREDIT_OUTSTANDING]) {
            expect(doc.dateHeader, doc.key).toBe('Due date')
            expect(doc.openHeader, doc.key).toBe('Open balance')
            expect(doc.openCardLabel, doc.key).toBe('Open balance')
            expect(doc.marksOverdue, doc.key).toBe(true)
        }
    })

    it('keep their row names', () => {
        expect(rowTickLabel(BILL_OUTSTANDING, '1003')).toBe('Pay bill 1003')
        expect(paymentCellLabel(BILL_OUTSTANDING, '1003')).toBe('Payment for bill 1003')
        expect(rowTickLabel(INVOICE_OUTSTANDING, '1004')).toBe('Pay invoice 1004')
        expect(paymentCellLabel(INVOICE_OUTSTANDING, '1004')).toBe('Payment for invoice 1004')
    })
})

// The vendor refund's credits (vendor refund spec §3.4, §9): one vendor's unapplied vendor
// credits, no party column, a Credit total column, a header tick box and "Refund all",
// "Credit date" and "Unapplied credit" in place of the fixed due-date and open texts, and
// no overdue mark.
describe('REFUND_OUTSTANDING', () => {
    it('lists vendor credits of no party column, opening each credit', () => {
        expect(REFUND_OUTSTANDING.key).toBe('refund')
        expect(REFUND_OUTSTANDING.noun).toBe('Vendor credit')
        expect(REFUND_OUTSTANDING.openKind).toBe(VENDOR_CREDIT_KIND)
        expect(REFUND_OUTSTANDING.testIdPrefix).toBe('vendor-refund')
        expect(REFUND_OUTSTANDING.party).toBe('none')
        expect(REFUND_OUTSTANDING.columns.party).toBeNull()
    })

    it('has a header tick box and Refund as the last header', () => {
        expect(REFUND_OUTSTANDING.hasPayAll).toBe(true)
        expect(REFUND_OUTSTANDING.paymentHeader).toBe('Refund')
    })

    it('names its date and open columns, and draws no overdue mark', () => {
        expect(REFUND_OUTSTANDING.dateHeader).toBe('Credit date')
        expect(REFUND_OUTSTANDING.openHeader).toBe('Unapplied credit')
        expect(REFUND_OUTSTANDING.openCardLabel).toBe('Unapplied credit')
        expect(REFUND_OUTSTANDING.marksOverdue).toBe(false)
    })

    it('has the refund columns and least widths', () => {
        expect(REFUND_OUTSTANDING.gridMinWidth).toBe(REFUND_GRID_MIN_WIDTH)
        expect(REFUND_OUTSTANDING.appliedMinWidth).toBe(REFUND_APPLIED_MIN_WIDTH)
        const { columns } = REFUND_OUTSTANDING
        expect(columns.tick).toBe(44)
        expect(columns.original).not.toBeNull()
        for (const column of [
            columns.document,
            columns.dueDate,
            columns.original,
            columns.open,
            columns.payment,
        ]) {
            expect(column?.minWidth).toBe(95)
            expect(column?.flex).toBeGreaterThan(0)
        }
    })

    it('holds the refund texts: Credit total, Refund all, Vendor credits refunded, Refunded', () => {
        const texts = outstandingTexts(REFUND_OUTSTANDING)
        expect(texts.total?.header).toBe('Credit total')
        expect(totalTexts(REFUND_OUTSTANDING).header).toBe('Credit total')
        expect(texts.payAllLabel).toBe('Refund all')
        expect(texts.appliedHeading).toBe('Vendor credits refunded')
        expect(texts.appliedLabel).toBe('Refunded')
    })

    // The cards' visible tick box text; `payAllLabel` stays the accessible name.
    it('draws "Pay all" on the invoice and bill cards and "Refund all" on the refund cards', () => {
        expect(outstandingTexts(INVOICE_OUTSTANDING).payAllText).toBe('Pay all')
        expect(outstandingTexts(BILL_OUTSTANDING).payAllText).toBe('Pay all')
        expect(outstandingTexts(REFUND_OUTSTANDING).payAllText).toBe('Refund all')
    })

    it('names a row’s tick box and cell in the pattern of the bill’s', () => {
        expect(rowTickLabel(REFUND_OUTSTANDING, '1002')).toBe('Refund vendor credit 1002')
        expect(paymentCellLabel(REFUND_OUTSTANDING, '1002')).toBe('Refund for vendor credit 1002')
    })
})

// The apply dialog's two customer lists (apply credit spec §3.2, §3.3, §4.4, plan decision
// 14): the invoices under a credit memo, with their own column set (Due date 154 px, Credit
// to apply 114 px), and the credit memos under an invoice, with the vendor credit's columns.
// Neither has a total column or a header tick box.
describe('MEMO_INVOICES_OUTSTANDING', () => {
    it('lists invoices, opening each invoice', () => {
        expect(MEMO_INVOICES_OUTSTANDING.key).toBe('memo_invoices')
        expect(MEMO_INVOICES_OUTSTANDING.noun).toBe('Invoice')
        expect(MEMO_INVOICES_OUTSTANDING.openKind).toBe(INVOICE_KIND)
        expect(MEMO_INVOICES_OUTSTANDING.testIdPrefix).toBe('apply-credit')
        expect(MEMO_INVOICES_OUTSTANDING.party).toBe('none')
        expect(MEMO_INVOICES_OUTSTANDING.paymentHeader).toBe('Credit to apply')
    })

    it('has no total column and no header tick box', () => {
        expect(MEMO_INVOICES_OUTSTANDING.columns.original).toBeNull()
        expect(MEMO_INVOICES_OUTSTANDING.hasPayAll).toBe(false)
        expect(outstandingTexts(MEMO_INVOICES_OUTSTANDING).total).toBeNull()
        expect(outstandingTexts(MEMO_INVOICES_OUTSTANDING).payAllLabel).toBeNull()
    })

    it('keeps the due-date texts and the overdue mark', () => {
        expect(MEMO_INVOICES_OUTSTANDING.dateHeader).toBe('Due date')
        expect(MEMO_INVOICES_OUTSTANDING.openHeader).toBe('Open balance')
        expect(MEMO_INVOICES_OUTSTANDING.marksOverdue).toBe(true)
    })

    it('has the memo columns and a least width of 566, inside the xl dialog’s 598 px', () => {
        expect(MEMO_INVOICES_OUTSTANDING.columns).toEqual({
            tick: MEMO_APPLY_COLUMNS.tick,
            party: null,
            document: MEMO_APPLY_COLUMNS.invoice,
            dueDate: MEMO_APPLY_COLUMNS.dueDate,
            original: null,
            open: MEMO_APPLY_COLUMNS.open,
            payment: MEMO_APPLY_COLUMNS.payment,
        })
        expect(MEMO_INVOICES_OUTSTANDING.gridMinWidth).toBe(MEMO_APPLY_GRID_MIN_WIDTH)
        expect(MEMO_INVOICES_OUTSTANDING.gridMinWidth).toBe(566)
        expect(MEMO_INVOICES_OUTSTANDING.gridMinWidth).toBeLessThan(598)
    })
})

describe('INVOICE_CREDITS_OUTSTANDING', () => {
    it('lists credit memos, opening each memo', () => {
        expect(INVOICE_CREDITS_OUTSTANDING.key).toBe('invoice_credits')
        expect(INVOICE_CREDITS_OUTSTANDING.noun).toBe('Credit memo')
        expect(INVOICE_CREDITS_OUTSTANDING.openKind).toBe(CREDIT_MEMO_KIND)
        expect(INVOICE_CREDITS_OUTSTANDING.testIdPrefix).toBe('apply-credit')
        expect(INVOICE_CREDITS_OUTSTANDING.party).toBe('none')
        expect(INVOICE_CREDITS_OUTSTANDING.paymentHeader).toBe('Credit to apply')
    })

    it('names its date and open columns, and draws no overdue mark', () => {
        expect(INVOICE_CREDITS_OUTSTANDING.dateHeader).toBe('Credit date')
        expect(INVOICE_CREDITS_OUTSTANDING.openHeader).toBe('Unapplied credit')
        expect(INVOICE_CREDITS_OUTSTANDING.openCardLabel).toBe('Unapplied credit')
        expect(INVOICE_CREDITS_OUTSTANDING.marksOverdue).toBe(false)
    })

    it('has no total column and no header tick box', () => {
        expect(INVOICE_CREDITS_OUTSTANDING.columns.original).toBeNull()
        expect(INVOICE_CREDITS_OUTSTANDING.hasPayAll).toBe(false)
        expect(outstandingTexts(INVOICE_CREDITS_OUTSTANDING).total).toBeNull()
        expect(outstandingTexts(INVOICE_CREDITS_OUTSTANDING).payAllLabel).toBeNull()
    })

    it('has the columns of CREDIT_APPLY_COLUMNS', () => {
        expect(INVOICE_CREDITS_OUTSTANDING.columns).toEqual({
            tick: CREDIT_APPLY_COLUMNS.tick,
            party: null,
            document: CREDIT_APPLY_COLUMNS.bill,
            dueDate: CREDIT_APPLY_COLUMNS.dueDate,
            original: null,
            open: CREDIT_APPLY_COLUMNS.open,
            payment: CREDIT_APPLY_COLUMNS.payment,
        })
        expect(INVOICE_CREDITS_OUTSTANDING.gridMinWidth).toBe(CREDIT_APPLY_GRID_MIN_WIDTH)
    })
})

describe('the refund grid’s least widths', () => {
    it('is a 44 px tick column and five flex columns of least width 95', () => {
        const { tick, ...data } = REFUND_COLUMNS
        expect(tick).toBe(44)
        const flex = Object.values(data)
        expect(flex).toHaveLength(5)
        for (const column of flex) expect(column.minWidth).toBe(95)
    })

    it('is 595 px: the sum of its columns, the gaps between them and the row padding', () => {
        const { tick, ...data } = REFUND_COLUMNS
        const widths = [tick, ...Object.values(data).map(column => column.minWidth)]
        const sum =
            widths.reduce((total, width) => total + width, 0) +
            (widths.length - 1) * PAYMENT_CELL_GAP +
            2 * PAYMENT_ROW_PADDING
        expect(REFUND_GRID_MIN_WIDTH).toBe(sum)
        expect(REFUND_GRID_MIN_WIDTH).toBe(595)
    })

    it('is 432 px for the read view’s refunded credits', () => {
        // Vendor credit, Credit date, Credit total, Refunded: 4 × 95, 3 gaps of 12, 2 × 8.
        expect(REFUND_APPLIED_MIN_WIDTH).toBe(
            4 * 95 + 3 * PAYMENT_CELL_GAP + 2 * PAYMENT_ROW_PADDING
        )
        expect(REFUND_APPLIED_MIN_WIDTH).toBe(432)
    })
})
