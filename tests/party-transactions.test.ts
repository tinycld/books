import { describe, expect, it } from 'vitest'
import {
    CUSTOMER_PAGE_ESTIMATES,
    CUSTOMER_PAGE_INVOICES,
    CUSTOMER_PAGE_SALES_RECEIPTS,
    CUSTOMER_PAGE_TODAY,
} from '../tinycld/books/lib/customer-page-fixture'
import { statusBadgeOf } from '../tinycld/books/lib/document-lifecycle'
import {
    emptyText,
    estimateRow,
    filterTestId,
    invoiceRow,
    isListedTransaction,
    mergeTransactions,
    paymentRow,
    salesReceiptRow,
    TRANSACTION_DOC_KINDS,
    TRANSACTION_FILTERS,
    TRANSACTION_PAGE,
    TRANSACTION_TYPE_LABELS,
} from '../tinycld/books/lib/party-transactions'
import { PAYMENT_IDS, PAYMENTS } from '../tinycld/books/lib/receive-payment-fixture'
import {
    ESTIMATE_KIND,
    INVOICE_KIND,
    SALES_RECEIPT_KIND,
} from '../tinycld/books/lib/sales-document-kinds'

const today = CUSTOMER_PAGE_TODAY

function byId<T extends { id: string }>(rows: readonly T[], id: string): T {
    const row = rows.find(r => r.id === id)
    if (!row) throw new Error(`no fixture row ${id}`)
    return row
}

function byNumber<T extends { number: string }>(rows: readonly T[], number: string): T {
    const row = rows.find(r => r.number === number)
    if (!row) throw new Error(`no fixture row ${number}`)
    return row
}

const invoice = (id: string) => byId(CUSTOMER_PAGE_INVOICES, id)
const estimate = (number: string) => byNumber(CUSTOMER_PAGE_ESTIMATES, number)
const receipt = (number: string) => byNumber(CUSTOMER_PAGE_SALES_RECEIPTS, number)

// The three lists one customer's page reads, as the hook feeds them to the merge: the
// replaced originals are left out of invoices and sales receipts.
function harborviewLists() {
    const harbor = CUSTOMER_PAGE_INVOICES[0].customer
    return [
        CUSTOMER_PAGE_INVOICES.filter(r => r.customer === harbor)
            .filter(isListedTransaction)
            .map(r => invoiceRow(r, today)),
        CUSTOMER_PAGE_ESTIMATES.filter(r => r.customer === harbor).map(r => estimateRow(r, today)),
        CUSTOMER_PAGE_SALES_RECEIPTS.filter(r => r.customer === harbor)
            .filter(isListedTransaction)
            .map(r => salesReceiptRow(r)),
    ]
}

describe('invoiceRow', () => {
    it('maps an open posted invoice to one transaction row', () => {
        expect(invoiceRow(invoice('cpinv0000001041'), today)).toMatchObject({
            id: 'cpinv0000001041',
            kind: 'invoice',
            number: 'INV-1041',
            date: '2026-11-03',
            dueDate: '2026-12-03',
            total: 1_250_000,
            currency: 'USD',
            created: '2026-11-03 10:15:00.000Z',
            status: { label: 'Open', tone: 'warning' },
        })
    })

    it('a draft is Draft, muted', () => {
        expect(invoiceRow(invoice('cpinv0000001042'), today).status).toEqual({
            label: 'Draft',
            tone: 'muted',
        })
    })

    it('a plain void is Void, muted', () => {
        expect(invoiceRow(invoice('cpinv0000001027'), today).status).toEqual({
            label: 'Void',
            tone: 'muted',
        })
    })

    it('a posted invoice due before today is Overdue, destructive', () => {
        const row = invoice('cpinv0000001035')
        expect(row.due_date).toBe('2026-10-28')
        expect(invoiceRow(row, today).status).toEqual({ label: 'Overdue', tone: 'destructive' })
    })

    it('a posted invoice due after today is Open, warning', () => {
        const row = invoice('cpinv0000001041')
        expect(row.due_date).toBe('2026-12-03')
        expect(invoiceRow(row, today).status).toEqual({ label: 'Open', tone: 'warning' })
    })

    it('a posted invoice due today is not overdue', () => {
        const row = invoice('cpinv0000001035')
        expect(invoiceRow(row, row.due_date).status).toEqual({ label: 'Open', tone: 'warning' })
    })
})

// Receive payment §3.9: a posted invoice's status follows its open balance. The first rule
// that applies wins, in the spec's order: Paid, Partly paid, Overdue, Open.
describe('invoiceRow with payments applied', () => {
    const overdue = invoice('cpinv0000001035')
    const notDue = invoice('cpinv0000001041')

    it('a posted invoice with no balance is Paid, success, even when due before today', () => {
        expect(overdue.due_date < today).toBe(true)
        expect(invoiceRow({ ...overdue, balance: 0 }, today).status).toEqual({
            label: 'Paid',
            tone: 'success',
        })
        expect(invoiceRow({ ...notDue, balance: 0 }, today).status).toEqual({
            label: 'Paid',
            tone: 'success',
        })
    })

    it('a posted invoice partly paid is Partly paid, warning, before the overdue check', () => {
        expect(invoiceRow({ ...overdue, balance: 100_000 }, today).status).toEqual({
            label: 'Partly paid',
            tone: 'warning',
        })
        expect(invoiceRow({ ...notDue, balance: 1 }, today).status).toEqual({
            label: 'Partly paid',
            tone: 'warning',
        })
    })

    it('a posted invoice with its whole total open and due before today is Overdue', () => {
        expect(invoiceRow({ ...overdue, balance: overdue.total }, today).status).toEqual({
            label: 'Overdue',
            tone: 'destructive',
        })
    })

    it('a posted invoice with its whole total open and not yet due is Open', () => {
        expect(invoiceRow({ ...notDue, balance: notDue.total }, today).status).toEqual({
            label: 'Open',
            tone: 'warning',
        })
    })

    it('a draft or a void invoice keeps its status whatever the balance', () => {
        expect(invoiceRow({ ...invoice('cpinv0000001042'), balance: 0 }, today).status).toEqual({
            label: 'Draft',
            tone: 'muted',
        })
        expect(invoiceRow({ ...invoice('cpinv0000001027'), balance: 0 }, today).status).toEqual({
            label: 'Void',
            tone: 'muted',
        })
    })
})

// The customer page's fourth kind (receive-payment spec §3.9).
describe('paymentRow', () => {
    function payment(id: string) {
        const row = PAYMENTS.find(p => p.id === id)
        if (!row) throw new Error(`no fixture payment ${id}`)
        return row
    }

    it('maps a payment to one transaction row of kind payment, its amount as the total', () => {
        const row = payment(PAYMENT_IDS.paidInFull)
        expect(paymentRow(row)).toMatchObject({
            id: row.id,
            kind: 'payment',
            number: row.number,
            date: row.date,
            dueDate: '',
            total: row.amount,
            currency: row.currency,
            created: row.created,
        })
    })

    it('a draft payment is Draft, muted', () => {
        expect(paymentRow(payment(PAYMENT_IDS.draft)).status).toEqual({
            label: 'Draft',
            tone: 'muted',
        })
    })

    it('a posted payment with nothing credited is Applied, success', () => {
        const row = payment(PAYMENT_IDS.paidInFull)
        expect(row.credited).toBe(0)
        expect(paymentRow(row).status).toEqual({ label: 'Applied', tone: 'success' })
    })

    it('a posted payment with an amount credited is Credit $x, warning', () => {
        const row = { ...payment(PAYMENT_IDS.overpayment), credited: 1500 }
        expect(paymentRow(row).status).toEqual({ label: 'Credit $15.00', tone: 'warning' })
    })

    it('a void payment is Void, muted', () => {
        expect(paymentRow(payment(PAYMENT_IDS.voided)).status).toEqual({
            label: 'Void',
            tone: 'muted',
        })
    })

    it('has the type label Payment and the chip Payments', () => {
        expect(TRANSACTION_TYPE_LABELS.payment).toBe('Payment')
        expect(TRANSACTION_FILTERS).toContainEqual({ key: 'payment', label: 'Payments' })
        expect(filterTestId('payment')).toBe('customer-transactions-filter-payment')
    })

    it('opens books/payments/<id>', () => {
        expect(TRANSACTION_DOC_KINDS.payment.routeBase).toBe('books/payments')
    })
})

describe('estimateRow', () => {
    it('a pending estimate past its expiration date is Expired, muted', () => {
        const row = estimate('EST-0205')
        expect(row.status).toBe('pending')
        expect(estimateRow(row, today).status).toEqual({ label: 'Expired', tone: 'muted' })
    })

    it('an accepted estimate not yet expired reads Accepted', () => {
        expect(estimateRow(estimate('EST-0211'), today).status.label).toBe('Accepted')
    })

    it('every estimate that is not expired takes the quote badge', () => {
        for (const number of ['EST-0218', 'EST-0211', 'EST-0199', 'EST-0190']) {
            const row = estimate(number)
            expect(estimateRow(row, today).status).toEqual(statusBadgeOf('quote', row.status))
        }
    })

    it('maps an estimate to one transaction row of kind estimate', () => {
        expect(estimateRow(estimate('EST-0211'), today)).toMatchObject({
            id: 'cpest0000000211',
            kind: 'estimate',
            number: 'EST-0211',
            date: '2026-11-03',
            total: 1_250_000,
            currency: 'USD',
            created: '2026-11-03 09:40:00.000Z',
        })
    })
})

describe('salesReceiptRow', () => {
    it('a posted receipt is Paid, success', () => {
        expect(salesReceiptRow(receipt('SR-0077')).status).toEqual({
            label: 'Paid',
            tone: 'success',
        })
    })

    it('a draft receipt is Draft, muted', () => {
        expect(salesReceiptRow(receipt('SR-0071')).status).toEqual({
            label: 'Draft',
            tone: 'muted',
        })
    })

    it('a void receipt is Void, muted', () => {
        expect(salesReceiptRow(receipt('SR-0064')).status).toEqual({
            label: 'Void',
            tone: 'muted',
        })
    })

    it('maps a receipt to one transaction row of kind sales_receipt', () => {
        expect(salesReceiptRow(receipt('SR-0077'))).toMatchObject({
            id: 'cpsr00000000077',
            kind: 'sales_receipt',
            number: 'SR-0077',
            date: '2026-11-07',
            total: 45_900,
            currency: 'USD',
        })
    })
})

describe('isListedTransaction', () => {
    it('drops a void original that a correction replaced', () => {
        expect(isListedTransaction(invoice('cpinv0001038old'))).toBe(false)
    })

    it('keeps a plain void and its correction', () => {
        expect(isListedTransaction(invoice('cpinv0000001027'))).toBe(true)
        expect(isListedTransaction(invoice('cpinv0001038fix'))).toBe(true)
    })
})

describe('mergeTransactions', () => {
    it('lists the corrected invoice once, by its correction', () => {
        const { rows } = mergeTransactions(harborviewLists(), TRANSACTION_PAGE)
        const ids = rows.map(r => r.id)
        expect(ids).not.toContain('cpinv0001038old')
        expect(ids).toContain('cpinv0001038fix')
        expect(ids).toContain('cpinv0000001027')
        expect(rows.filter(r => r.number === 'INV-1038')).toHaveLength(1)
    })

    it('orders by date, newest first, then by created, newest first', () => {
        const { rows } = mergeTransactions(harborviewLists(), TRANSACTION_PAGE)
        expect(rows.slice(0, 5).map(r => r.number)).toEqual([
            'INV-1042',
            'EST-0218',
            'SR-0077',
            'INV-1041',
            'EST-0211',
        ])
        for (let i = 1; i < rows.length; i++) {
            const before = rows[i - 1]
            const after = rows[i]
            expect(`${before.date} ${before.created}` >= `${after.date} ${after.created}`).toBe(
                true
            )
        }
    })

    it('breaks a date tie by created whichever list the rows come from', () => {
        const [invoices, estimates, receipts] = harborviewLists()
        const { rows } = mergeTransactions([estimates, receipts, invoices], TRANSACTION_PAGE)
        const numbers = rows.map(r => r.number)
        expect(numbers.indexOf('INV-1041')).toBe(numbers.indexOf('EST-0211') - 1)
    })

    it('keeps every row and reports no more when no list reached n', () => {
        const lists = harborviewLists()
        const total = lists.reduce((sum, list) => sum + list.length, 0)
        const merged = mergeTransactions(lists, TRANSACTION_PAGE)
        expect(merged.rows).toHaveLength(total)
        expect(merged.hasMore).toBe(false)
    })

    it('cuts to the first n rows and reports more', () => {
        const merged = mergeTransactions(harborviewLists(), 3)
        expect(merged.rows.map(r => r.number)).toEqual(['INV-1042', 'EST-0218', 'SR-0077'])
        expect(merged.hasMore).toBe(true)
    })

    it('reports more when one list has n rows, even with no more rows in all', () => {
        const [, , receipts] = harborviewLists()
        expect(receipts).toHaveLength(3)
        const merged = mergeTransactions([[], [], receipts], 3)
        expect(merged.rows).toHaveLength(3)
        expect(merged.hasMore).toBe(true)
    })

    it('starts with a window of 50', () => {
        expect(TRANSACTION_PAGE).toBe(50)
    })
})

describe('emptyText', () => {
    it('names the empty list and each kind with no rows', () => {
        expect(emptyText('all')).toBe('No transactions for this customer yet')
        expect(emptyText('estimate')).toBe('No estimates for this customer')
        expect(emptyText('invoice')).toBe('No invoices for this customer')
        expect(emptyText('sales_receipt')).toBe('No sales receipts for this customer')
    })
})

describe('filterTestId and TRANSACTION_DOC_KINDS', () => {
    it('gives each chip its test id', () => {
        expect(filterTestId('all')).toBe('customer-transactions-filter-all')
        expect(filterTestId('invoice')).toBe('customer-transactions-filter-invoice')
        expect(filterTestId('estimate')).toBe('customer-transactions-filter-estimate')
        expect(filterTestId('sales_receipt')).toBe('customer-transactions-filter-sales-receipt')
    })

    it('opens each kind on its own document route', () => {
        expect(TRANSACTION_DOC_KINDS.invoice).toEqual(INVOICE_KIND)
        expect(TRANSACTION_DOC_KINDS.estimate).toEqual(ESTIMATE_KIND)
        expect(TRANSACTION_DOC_KINDS.sales_receipt).toEqual(SALES_RECEIPT_KIND)
        expect(TRANSACTION_DOC_KINDS.payment).toMatchObject({ routeBase: 'books/payments' })
    })
})
