import { describe, expect, it } from 'vitest'
import {
    mergeTransactions,
    TRANSACTION_PAGE,
    transactionTotalText,
} from '../tinycld/books/lib/party-transactions'
import {
    PURCHASE_ORDER_IDS,
    PURCHASE_ORDER_LINES,
    PURCHASE_ORDERS,
} from '../tinycld/books/lib/purchase-orders-fixture'
import {
    billPaymentRow,
    billRow,
    expenseRow,
    purchaseOrderRow,
    VENDOR_TRANSACTION_FILTERS,
    VENDOR_TRANSACTION_ROUTES,
    VENDOR_TRANSACTION_TEXTS,
    VENDOR_TRANSACTION_TYPE_LABELS,
    type VendorTransactionKind,
    type VendorTransactionRow,
    vendorCreditRow,
    vendorRefundRow,
    vendorTransactionHref,
} from '../tinycld/books/lib/vendor-transactions'

// Vendor pages §3.5: the five purchase kinds of the Transactions tab, their status rules,
// their routes and the empty sentences.

const TODAY = '2026-11-18'
// U+2212, not the ASCII hyphen formatMoney writes for a negative amount.
const MINUS = '−'

const BILL = {
    id: 'vptbill00000001',
    status: 'posted' as 'draft' | 'posted' | 'void',
    number: 'B-1001',
    date: '2026-11-01',
    due_date: '2026-12-01',
    total: 40_000,
    balance: 40_000,
    currency: 'USD',
    created: '2026-11-01 09:00:00.000Z',
    sequence: 1001,
    replaced_by: '',
}

const EXPENSE = {
    id: 'vptexpense00001',
    status: 'posted' as 'draft' | 'posted' | 'void',
    number: 'E-0007',
    date: '2026-11-04',
    total: 12_500,
    currency: 'USD',
    created: '2026-11-04 09:00:00.000Z',
    sequence: 7,
    replaced_by: '',
}

const BILL_PAYMENT = {
    id: 'vptbillpay00001',
    status: 'posted' as 'posted' | 'void',
    number: 'BP-0003',
    date: '2026-11-06',
    total: 15_000,
    currency: 'USD',
    created: '2026-11-06 09:00:00.000Z',
    sequence: 3,
    replaced_by: '',
}

const VENDOR_CREDIT = {
    id: 'vptvcredit00001',
    status: 'posted' as 'draft' | 'posted' | 'void',
    number: 'VC-0002',
    date: '2026-11-08',
    total: 25_000,
    balance: 25_000,
    currency: 'USD',
    created: '2026-11-08 09:00:00.000Z',
    sequence: 2,
    replaced_by: '',
}

const VENDOR_REFUND = {
    id: 'vptvrefund00001',
    status: 'posted' as 'draft' | 'posted' | 'void',
    number: 'VR-0001',
    date: '2026-11-10',
    amount: 9_900,
    currency: 'USD',
    created: '2026-11-10 09:00:00.000Z',
    sequence: 1,
    replaced_by: '',
}

describe('billRow', () => {
    const cases: {
        name: string
        bill: typeof BILL
        status: { label: string; tone: string }
    }[] = [
        {
            name: 'a draft is Draft, muted',
            bill: { ...BILL, status: 'draft', number: '' },
            status: { label: 'Draft', tone: 'muted' },
        },
        {
            name: 'a void is Void, muted',
            bill: { ...BILL, status: 'void', balance: 0 },
            status: { label: 'Void', tone: 'muted' },
        },
        {
            name: 'posted with balance 0 is Paid, success',
            bill: { ...BILL, balance: 0 },
            status: { label: 'Paid', tone: 'success' },
        },
        {
            name: 'posted with balance 0 is Paid even when due before today',
            bill: { ...BILL, balance: 0, due_date: '2026-11-10' },
            status: { label: 'Paid', tone: 'success' },
        },
        {
            name: 'posted with balance below total is Partly paid, warning',
            bill: { ...BILL, balance: 10_000 },
            status: { label: 'Partly paid', tone: 'warning' },
        },
        {
            name: 'posted, part paid and due before today is still Partly paid',
            bill: { ...BILL, balance: 10_000, due_date: '2026-11-10' },
            status: { label: 'Partly paid', tone: 'warning' },
        },
        {
            name: 'posted, unpaid, due before today is Overdue, destructive',
            bill: { ...BILL, due_date: '2026-11-17' },
            status: { label: 'Overdue', tone: 'destructive' },
        },
        {
            name: 'posted, unpaid, due today is Open, warning',
            bill: { ...BILL, due_date: TODAY },
            status: { label: 'Open', tone: 'warning' },
        },
        {
            name: 'posted, unpaid, due after today is Open, warning',
            bill: { ...BILL, due_date: '2026-12-01' },
            status: { label: 'Open', tone: 'warning' },
        },
    ]

    for (const { name, bill, status } of cases) {
        it(name, () => {
            expect(billRow(bill, TODAY).status).toEqual(status)
        })
    }

    it('maps a bill to one row of kind bill, with its due date and a positive total', () => {
        expect(billRow(BILL, TODAY)).toMatchObject({
            id: BILL.id,
            key: '1001',
            kind: 'bill',
            number: 'B-1001',
            date: '2026-11-01',
            dueDate: '2026-12-01',
            total: 40_000,
            created: BILL.created,
        })
        expect(transactionTotalText(billRow(BILL, TODAY), 'USD')).toBe('$400.00')
    })
})

describe('expenseRow', () => {
    const cases: { status: typeof EXPENSE.status; label: string; tone: string }[] = [
        { status: 'draft', label: 'Draft', tone: 'muted' },
        { status: 'posted', label: 'Paid', tone: 'success' },
        { status: 'void', label: 'Void', tone: 'muted' },
    ]

    for (const { status, label, tone } of cases) {
        it(`a ${status} expense is ${label}`, () => {
            expect(expenseRow({ ...EXPENSE, status }).status).toEqual({ label, tone })
        })
    }

    it('maps an expense to one row of kind expense, with no due date and its total', () => {
        expect(expenseRow(EXPENSE)).toMatchObject({
            id: EXPENSE.id,
            kind: 'expense',
            number: 'E-0007',
            date: '2026-11-04',
            dueDate: '',
            total: 12_500,
        })
    })
})

describe('billPaymentRow', () => {
    const cases: { status: typeof BILL_PAYMENT.status; label: string; tone: string }[] = [
        { status: 'posted', label: 'Paid', tone: 'success' },
        { status: 'void', label: 'Void', tone: 'muted' },
    ]

    for (const { status, label, tone } of cases) {
        it(`a ${status} bill payment is ${label}`, () => {
            expect(billPaymentRow({ ...BILL_PAYMENT, status }).status).toEqual({ label, tone })
        })
    }

    it('maps a bill payment to one row of kind bill_payment, its total positive', () => {
        expect(billPaymentRow(BILL_PAYMENT)).toMatchObject({
            id: BILL_PAYMENT.id,
            kind: 'bill_payment',
            dueDate: '',
            total: 15_000,
        })
    })
})

describe('vendorCreditRow', () => {
    const cases: {
        name: string
        credit: typeof VENDOR_CREDIT
        status: { label: string; tone: string }
    }[] = [
        {
            name: 'a draft is Draft, muted',
            credit: { ...VENDOR_CREDIT, status: 'draft', number: '', balance: 0 },
            status: { label: 'Draft', tone: 'muted' },
        },
        {
            name: 'posted with balance above 0 is Unapplied, warning',
            credit: VENDOR_CREDIT,
            status: { label: 'Unapplied', tone: 'warning' },
        },
        {
            name: 'posted with balance 0 is Closed, success',
            credit: { ...VENDOR_CREDIT, balance: 0 },
            status: { label: 'Closed', tone: 'success' },
        },
        {
            name: 'a void is Void, muted',
            credit: { ...VENDOR_CREDIT, status: 'void', balance: 0 },
            status: { label: 'Void', tone: 'muted' },
        },
    ]

    for (const { name, credit, status } of cases) {
        it(name, () => {
            expect(vendorCreditRow(credit).status).toEqual(status)
        })
    }

    it('negates the credit total, and its total text starts with U+2212', () => {
        const row = vendorCreditRow(VENDOR_CREDIT)
        expect(row).toMatchObject({ kind: 'vendor_credit', dueDate: '', total: -25_000 })
        const text = transactionTotalText(row, 'USD')
        expect(text.startsWith(MINUS)).toBe(true)
        expect(text).toBe(`${MINUS}$250.00`)
    })
})

describe('vendorRefundRow', () => {
    const cases: { status: typeof VENDOR_REFUND.status; label: string; tone: string }[] = [
        { status: 'draft', label: 'Draft', tone: 'muted' },
        { status: 'posted', label: 'Received', tone: 'success' },
        { status: 'void', label: 'Void', tone: 'muted' },
    ]

    for (const { status, label, tone } of cases) {
        it(`a ${status} vendor refund is ${label}`, () => {
            expect(vendorRefundRow({ ...VENDOR_REFUND, status }).status).toEqual({ label, tone })
        })
    }

    it('reads the total from the refund amount', () => {
        expect(vendorRefundRow(VENDOR_REFUND)).toMatchObject({
            id: VENDOR_REFUND.id,
            kind: 'vendor_refund',
            dueDate: '',
            total: 9_900,
        })
    })
})

// Purchase order spec §3.9: a purchase order on the vendor page is a row of kind
// purchase_order with its number, date, no due date, its total and its badge (Open, Partly
// received, Closed: `purchaseOrderBadge` over the order's lines).
describe('purchaseOrderRow', () => {
    function orderRowOf(id: string): VendorTransactionRow {
        const order = PURCHASE_ORDERS.find(candidate => candidate.id === id)
        if (!order) throw new Error(`no fixture order ${id}`)
        const lines = PURCHASE_ORDER_LINES.filter(line => line.purchase_order === id)
        return purchaseOrderRow(order, lines)
    }

    it('maps an order to one row of kind purchase_order, with no due date and its total', () => {
        expect(orderRowOf(PURCHASE_ORDER_IDS.open)).toMatchObject({
            id: PURCHASE_ORDER_IDS.open,
            key: '1004',
            kind: 'purchase_order',
            number: '1004',
            date: '2026-11-06',
            dueDate: '',
            total: 157_740,
        })
        expect(transactionTotalText(orderRowOf(PURCHASE_ORDER_IDS.open), 'USD')).toBe('$1,577.40')
    })

    it.each([
        [PURCHASE_ORDER_IDS.open, { label: 'Open', tone: 'info' }],
        [PURCHASE_ORDER_IDS.draftBill, { label: 'Open', tone: 'info' }],
        [PURCHASE_ORDER_IDS.partly, { label: 'Partly received', tone: 'warning' }],
        [PURCHASE_ORDER_IDS.closedManual, { label: 'Closed', tone: 'muted' }],
        [PURCHASE_ORDER_IDS.closedReceived, { label: 'Closed', tone: 'muted' }],
    ])('gives %s the badge %o', (id, status) => {
        expect(orderRowOf(id).status).toEqual(status)
    })

    it('opens the order by its number at books/purchase-orders', () => {
        expect(vendorTransactionHref(orderRowOf(PURCHASE_ORDER_IDS.partly))).toBe(
            'books/purchase-orders/1003'
        )
    })

    it('types the row "Purchase order"', () => {
        expect(VENDOR_TRANSACTION_TYPE_LABELS.purchase_order).toBe('Purchase order')
    })
})

describe('vendorTransactionHref', () => {
    const rows: [VendorTransactionRow, string][] = [
        [billRow(BILL, TODAY), 'books/bills/1001'],
        [expenseRow(EXPENSE), 'books/expenses/7'],
        [billPaymentRow(BILL_PAYMENT), 'books/bill-payments/3'],
        [vendorCreditRow(VENDOR_CREDIT), 'books/vendor-credits/2'],
        [vendorRefundRow(VENDOR_REFUND), 'books/vendor-refunds/1'],
    ]

    for (const [row, href] of rows) {
        it(`opens a ${row.kind} on ${href}`, () => {
            expect(vendorTransactionHref(row)).toBe(href)
        })
    }

    it('opens a draft and a replaced original by its id', () => {
        const draft = { ...BILL, status: 'draft' as const, number: '', sequence: 0 }
        expect(vendorTransactionHref(billRow(draft, TODAY))).toBe(`books/bills/${BILL.id}`)
        const replaced = { ...EXPENSE, status: 'void' as const, replaced_by: 'vptexpense00009' }
        expect(vendorTransactionHref(expenseRow(replaced))).toBe(`books/expenses/${EXPENSE.id}`)
    })

    it('names one route per kind', () => {
        expect(VENDOR_TRANSACTION_ROUTES).toEqual({
            bill: 'books/bills',
            purchase_order: 'books/purchase-orders',
            expense: 'books/expenses',
            bill_payment: 'books/bill-payments',
            vendor_credit: 'books/vendor-credits',
            vendor_refund: 'books/vendor-refunds',
        })
    })
})

describe('VENDOR_TRANSACTION_TEXTS', () => {
    it('names the empty list', () => {
        expect(VENDOR_TRANSACTION_TEXTS.empty).toBe('No transactions for this vendor yet')
    })

    const sentences: [VendorTransactionKind, string][] = [
        ['bill', 'No bills for this vendor'],
        ['purchase_order', 'No purchase orders for this vendor'],
        ['expense', 'No expenses for this vendor'],
        ['bill_payment', 'No bill payments for this vendor'],
        ['vendor_credit', 'No vendor credits for this vendor'],
        ['vendor_refund', 'No vendor refunds for this vendor'],
    ]

    for (const [kind, sentence] of sentences) {
        it(`names the empty ${kind} chip`, () => {
            expect(VENDOR_TRANSACTION_TEXTS.noMatch(kind)).toBe(sentence)
        })
    }
})

describe('VENDOR_TRANSACTION_FILTERS', () => {
    // Purchase order spec §3.9: the chip Purchase orders, after Bills as the tab is.
    it('lists the chips in strip order', () => {
        expect(VENDOR_TRANSACTION_FILTERS).toEqual([
            { key: 'all', label: 'All' },
            { key: 'bill', label: 'Bills' },
            { key: 'purchase_order', label: 'Purchase orders' },
            { key: 'expense', label: 'Expenses' },
            { key: 'bill_payment', label: 'Bill payments' },
            { key: 'vendor_credit', label: 'Vendor credits' },
            { key: 'vendor_refund', label: 'Vendor refunds' },
        ])
    })
})

describe('mergeTransactions over vendor rows', () => {
    const bills = [
        billRow({ ...BILL, id: 'vptbill00000002', date: '2026-11-05' }, TODAY),
        billRow({ ...BILL, id: 'vptbill00000001', date: '2026-11-01' }, TODAY),
    ]
    // Same date as the newer bill, created later: it sorts first.
    const expenses = [
        expenseRow({
            ...EXPENSE,
            id: 'vptexpense00002',
            date: '2026-11-05',
            created: '2026-11-05 15:00:00.000Z',
        }),
        expenseRow({ ...EXPENSE, id: 'vptexpense00001', date: '2026-11-03' }),
    ]

    it('orders by date desc, then created desc', () => {
        const bill2 = { ...bills[0], created: '2026-11-05 09:00:00.000Z' }
        const { rows, hasMore } = mergeTransactions([[bill2, bills[1]], expenses], TRANSACTION_PAGE)
        expect(rows.map(r => r.id)).toEqual([
            'vptexpense00002',
            'vptbill00000002',
            'vptexpense00001',
            'vptbill00000001',
        ])
        expect(hasMore).toBe(false)
    })

    it('cuts to n and reports more when a kind returned n rows', () => {
        const merged = mergeTransactions([bills, expenses], 2)
        expect(merged.rows).toHaveLength(2)
        expect(merged.rows.map(r => r.id)).toEqual(['vptexpense00002', 'vptbill00000002'])
        expect(merged.hasMore).toBe(true)
        expect(mergeTransactions([bills.slice(0, 1), expenses.slice(0, 1)], 2).hasMore).toBe(false)
    })
})
