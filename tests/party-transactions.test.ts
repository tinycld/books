import { describe, expect, expectTypeOf, it } from 'vitest'
import {
    CUSTOMER_PAGE_ESTIMATES,
    CUSTOMER_PAGE_INVOICES,
    CUSTOMER_PAGE_SALES_RECEIPTS,
    CUSTOMER_PAGE_TODAY,
} from '../tinycld/books/lib/customer-page-fixture'
import { statusBadgeOf } from '../tinycld/books/lib/document-lifecycle'
import { documentHref } from '../tinycld/books/lib/document-routes'
import {
    creditMemoRow,
    creditMemoStatus,
    emptyText,
    estimateRow,
    filterTestId,
    invoiceRow,
    isListedTransaction,
    mergeTransactions,
    type PartyTransactionRow,
    partyFilterTestId,
    paymentRow,
    salesReceiptRow,
    TRANSACTION_DOC_KINDS,
    TRANSACTION_FILTERS,
    TRANSACTION_PAGE,
    TRANSACTION_TYPE_LABELS,
    type TransactionKind,
    transactionTotalText,
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

// The customer page's fifth kind (credit memo spec §3.10, Q11).
const POSTED_MEMO = {
    id: 'cmtest000001001',
    status: 'posted' as const,
    number: '1001',
    date: '2026-11-05',
    total: 25_000,
    balance: 25_000,
    currency: 'USD',
    created: '2026-11-05 09:00:00.000Z',
}
const DRAFT_MEMO = {
    ...POSTED_MEMO,
    id: 'cmtestdraft0001',
    status: 'draft' as const,
    number: '',
    balance: 0,
}
// U+2212, not the ASCII hyphen formatMoney writes for a negative amount.
const MINUS = '−'

describe('creditMemoStatus', () => {
    it('a draft is Draft, muted', () => {
        expect(creditMemoStatus({ status: 'draft', balance: 0 })).toEqual({
            label: 'Draft',
            tone: 'muted',
        })
    })

    it('a posted memo with credit left is Unapplied, warning', () => {
        expect(creditMemoStatus({ status: 'posted', balance: 25_000 })).toEqual({
            label: 'Unapplied',
            tone: 'warning',
        })
    })

    it('a posted memo with no credit left is Applied, success', () => {
        expect(creditMemoStatus({ status: 'posted', balance: 0 })).toEqual({
            label: 'Applied',
            tone: 'success',
        })
    })

    it('a void memo is Void, muted', () => {
        expect(creditMemoStatus({ status: 'void', balance: 0 })).toEqual({
            label: 'Void',
            tone: 'muted',
        })
    })
})

describe('creditMemoRow', () => {
    it('maps a posted memo to one row of kind credit_memo, its total negated, no due date', () => {
        expect(creditMemoRow(POSTED_MEMO)).toEqual({
            id: POSTED_MEMO.id,
            kind: 'credit_memo',
            number: '1001',
            date: '2026-11-05',
            dueDate: '',
            total: -25_000,
            currency: 'USD',
            created: POSTED_MEMO.created,
            status: creditMemoStatus(POSTED_MEMO),
        })
        expect(creditMemoRow(POSTED_MEMO).status).toEqual({ label: 'Unapplied', tone: 'warning' })
    })

    it('a draft has no number and its total negated', () => {
        const row = creditMemoRow(DRAFT_MEMO)
        expect(row.number).toBe('')
        expect(row.total).toBe(-25_000)
        expect(row.status).toEqual({ label: 'Draft', tone: 'muted' })
    })
})

describe('transactionTotalText', () => {
    it('writes a credit memo total with U+2212 in front, not a hyphen', () => {
        const text = transactionTotalText(creditMemoRow(POSTED_MEMO), 'USD')
        expect(text).toBe(`${MINUS}$250.00`)
        expect(text.startsWith('-')).toBe(false)
    })

    it('writes an invoice total as before', () => {
        const row = invoiceRow({ ...invoice('cpinv0000001041'), total: 25_000 }, today)
        expect(transactionTotalText(row, 'USD')).toBe('$250.00')
    })
})

describe('the credit memo kind', () => {
    it('has the type label Credit memo', () => {
        expect(TRANSACTION_TYPE_LABELS.credit_memo).toBe('Credit memo')
    })

    it('opens books/credit-memos/<id>', () => {
        expect(TRANSACTION_DOC_KINDS.credit_memo.routeBase).toBe('books/credit-memos')
        expect(documentHref(TRANSACTION_DOC_KINDS.credit_memo, POSTED_MEMO.id)).toBe(
            `books/credit-memos/${POSTED_MEMO.id}`
        )
    })

    it('has the last chip, Credit memos, after Payments', () => {
        expect(TRANSACTION_FILTERS.slice(-2)).toEqual([
            { key: 'payment', label: 'Payments' },
            { key: 'credit_memo', label: 'Credit memos' },
        ])
        expect(filterTestId('credit_memo')).toBe('customer-transactions-filter-credit-memo')
    })

    it('names the empty Credit memos chip', () => {
        expect(emptyText('credit_memo')).toBe('No credit memos for this customer')
    })

    it('drops a void memo that a correction replaced and keeps a plain void memo', () => {
        const plainVoid = { ...POSTED_MEMO, status: 'void' as const, balance: 0, replaced_by: '' }
        const replaced = { ...plainVoid, replaced_by: 'cmtestcorrect01' }
        expect(isListedTransaction(replaced)).toBe(false)
        expect(isListedTransaction(plainVoid)).toBe(true)
        expect(creditMemoRow(plainVoid).status).toEqual({ label: 'Void', tone: 'muted' })
    })

    it('mergeTransactions sorts a memo among the other kinds by date, newest first', () => {
        // INV-1041 and EST-0211 are dated 2026-11-03, SR-0077 2026-11-07: a memo of
        // 2026-11-05 sits between SR-0077 and INV-1041.
        const memo = creditMemoRow(POSTED_MEMO)
        const { rows } = mergeTransactions([...harborviewLists(), [memo]], TRANSACTION_PAGE)
        const ids = rows.map(r => r.id)
        expect(ids.indexOf(memo.id)).toBe(ids.indexOf('cpsr00000000077') + 1)
        expect(ids.indexOf('cpinv0000001041')).toBe(ids.indexOf(memo.id) + 1)
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

    it('reports more when the lists together hold more than n rows, none of them n', () => {
        const base = harborviewLists()[0][0]
        const copies = (prefix: string, count: number) =>
            Array.from({ length: count }, (_, i) => ({
                ...base,
                id: `${prefix}${String(i).padStart(4, '0')}`,
                created: `2026-10-01 00:00:${String(i).padStart(2, '0')}.000Z`,
            }))
        const merged = mergeTransactions([copies('a', 30), copies('b', 30)], 50)
        expect(merged.rows).toHaveLength(50)
        expect(merged.hasMore).toBe(true)
        const exact = mergeTransactions([copies('a', 30), copies('b', 20)], 50)
        expect(exact.rows).toHaveLength(50)
        expect(exact.hasMore).toBe(false)
        const fewer = mergeTransactions([copies('a', 30), copies('b', 19)], 50)
        expect(fewer.rows).toHaveLength(49)
        expect(fewer.hasMore).toBe(false)
    })

    it('orders by a given compare function, still cut to n', () => {
        // Every id is distinct, so this compare has no ties and the expected order
        // does not depend on the input order of the lists.
        const byIdAscending = (
            a: ReturnType<typeof invoiceRow>,
            b: ReturnType<typeof invoiceRow>
        ): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        const lists = harborviewLists()
        const ids = lists.flat().map(r => r.id)
        const expected = [...ids].sort()
        expect(new Set(ids).size).toBe(ids.length)
        const newest = mergeTransactions(lists, TRANSACTION_PAGE).rows.map(r => r.id)
        expect(newest).not.toEqual(expected)
        const merged = mergeTransactions(lists, TRANSACTION_PAGE, byIdAscending)
        expect(merged.rows.map(r => r.id)).toEqual(expected)
        const cut = mergeTransactions(lists, 2, byIdAscending)
        expect(cut.rows.map(r => r.id)).toEqual(expected.slice(0, 2))
        expect(cut.hasMore).toBe(true)
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

// Vendor pages §2: the transactions list is a shared part, so its chip ids take the
// party's prefix, and its rows take another party's kind union.
describe('partyFilterTestId', () => {
    it('writes <prefix>-transactions-filter-<filter> with every underscore as a dash', () => {
        expect(partyFilterTestId('vendor', 'bill_payment')).toBe(
            'vendor-transactions-filter-bill-payment'
        )
        expect(partyFilterTestId('vendor', 'all')).toBe('vendor-transactions-filter-all')
        expect(partyFilterTestId('customer', 'sales_receipt')).toBe(
            'customer-transactions-filter-sales-receipt'
        )
    })

    it('leaves filterTestId as it was for the customer page', () => {
        expect(filterTestId('sales_receipt')).toBe('customer-transactions-filter-sales-receipt')
        expect(filterTestId('sales_receipt')).toBe(partyFilterTestId('customer', 'sales_receipt'))
    })
})

describe('mergeTransactions over another kind union', () => {
    type PurchaseKind = 'bill' | 'expense'
    const purchaseRow = (
        id: string,
        kind: PurchaseKind,
        date: string,
        total: number
    ): PartyTransactionRow<PurchaseKind> => ({
        id,
        kind,
        number: id.toUpperCase(),
        date,
        dueDate: '',
        total,
        currency: 'USD',
        created: `${date} 09:00:00.000Z`,
        status: { label: 'Paid', tone: 'success' },
    })

    it('merges rows of a purchase kind union, newest first, and keeps their row type', () => {
        const bills = [purchaseRow('b1', 'bill', '2026-11-01', 10_000)]
        const expenses = [
            purchaseRow('e1', 'expense', '2026-11-04', 2_500),
            purchaseRow('e2', 'expense', '2026-10-20', 900),
        ]
        const merged = mergeTransactions([bills, expenses], TRANSACTION_PAGE)
        expectTypeOf(merged.rows).toEqualTypeOf<PartyTransactionRow<PurchaseKind>[]>()
        expectTypeOf<PartyTransactionRow['kind']>().toEqualTypeOf<TransactionKind>()
        expect(merged.rows.map(r => r.id)).toEqual(['e1', 'b1', 'e2'])
        expect(merged.hasMore).toBe(false)
        expect(mergeTransactions([bills, expenses], 1).hasMore).toBe(true)
    })

    it('writes a purchase row total like a sales row total', () => {
        const row = purchaseRow('b1', 'bill', '2026-11-01', 25_000)
        expect(transactionTotalText(row, 'USD')).toBe('$250.00')
        expect(transactionTotalText({ ...row, total: -25_000 }, 'USD')).toBe(`${MINUS}$250.00`)
    })
})
