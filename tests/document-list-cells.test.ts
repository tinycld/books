import { describe, expect, it } from 'vitest'
import type { DocumentListRow } from '../tinycld/books/lib/document-list'
import {
    cardLines,
    cellText,
    isMutedCell,
    nameRowLines,
} from '../tinycld/books/lib/document-list-cells'
import type { CategoryNames } from '../tinycld/books/lib/purchase-category'
import { purchaseTabOf } from '../tinycld/books/lib/purchase-lists'
import { formatDay } from '../tinycld/books/lib/register-range'
import { salesTabOf } from '../tinycld/books/lib/sales-lists'

// The text of a sales list's cells, cards and names-column rows (spec
// docs/specs/sales-lists-design.md §3 "Rows and columns", checkpoint 2).

const DASH = '—'
const MINUS = '−'

const ALL = salesTabOf('all')
const INVOICES = salesTabOf('invoices')
const ESTIMATES = salesTabOf('estimates')
const CREDIT_MEMOS = salesTabOf('credit-memos')

let next = 0
function listRow(over: Partial<DocumentListRow>): DocumentListRow {
    next++
    return {
        id: `cell${String(next).padStart(11, '0')}`,
        kind: 'invoice',
        number: '',
        date: '2026-11-01',
        dueDate: '',
        total: 0,
        currency: 'USD',
        created: '2026-11-01 09:00:00.000Z',
        status: { label: 'Open', tone: 'warning' },
        sequence: 0,
        partyId: '',
        partyName: '',
        memo: '',
        reference: '',
        expires: '',
        balance: 0,
        entry: '',
        convertedInvoice: '',
        recordStatus: 'posted',
        category: { kind: 'none' },
        ...over,
    }
}

// A draft invoice with nothing filled in but its amount.
const bareDraft = listRow({
    number: '',
    partyName: '',
    memo: '',
    dueDate: '',
    total: 12_500,
    balance: 12_500,
    status: { label: 'Draft', tone: 'muted' },
    recordStatus: 'draft',
})

const posted = listRow({
    number: '1048',
    sequence: 1048,
    partyId: 'cust00000000001',
    partyName: 'Northwind Traders',
    date: '2026-11-14',
    dueDate: '2026-12-14',
    memo: 'November retainer',
    total: 240_000,
    balance: 240_000,
})

const namedDraft = listRow({
    partyId: 'cust00000000002',
    partyName: 'Harbor Cafe',
    date: '2026-11-15',
    dueDate: '2026-12-15',
    total: 240_000,
    balance: 240_000,
    status: { label: 'Draft', tone: 'muted' },
    recordStatus: 'draft',
})

// A credit memo row carries its stored total negated (creditMemoRow).
const creditMemo = listRow({
    kind: 'credit_memo',
    number: 'CM-12',
    sequence: 12,
    partyName: 'Northwind Traders',
    total: -40_000,
    balance: 40_000,
    status: { label: 'Unapplied', tone: 'warning' },
})

describe('cellText', () => {
    it('shows "—" for an empty customer, number, memo, due date and expiration date', () => {
        expect(cellText(bareDraft, 'customer', INVOICES, 'USD')).toBe(DASH)
        expect(cellText(bareDraft, 'number', INVOICES, 'USD')).toBe(DASH)
        expect(cellText(bareDraft, 'memo', ALL, 'USD')).toBe(DASH)
        expect(cellText(bareDraft, 'due', INVOICES, 'USD')).toBe(DASH)
        const estimate = listRow({
            kind: 'estimate',
            number: '83',
            partyName: 'Northwind Traders',
            expires: '',
            status: { label: 'Pending', tone: 'info' },
            recordStatus: 'pending',
        })
        expect(cellText(estimate, 'expires', ESTIMATES, 'USD')).toBe(DASH)
    })

    it('shows the filled cells as their text, not "—"', () => {
        expect(cellText(posted, 'customer', INVOICES, 'USD')).toBe('Northwind Traders')
        expect(cellText(posted, 'number', INVOICES, 'USD')).toBe('1048')
        expect(cellText(posted, 'memo', ALL, 'USD')).toBe('November retainer')
        expect(cellText(posted, 'due', INVOICES, 'USD')).toBe(formatDay('2026-12-14'))
        expect(cellText(posted, 'type', ALL, 'USD')).toBe('Invoice')
    })

    it("shows a draft's stored balance", () => {
        expect(cellText(bareDraft, 'balance', INVOICES, 'USD')).toBe('$125.00')
    })

    it("shows a credit memo's amount with a typographic minus on All sales and its total positive on its own tab", () => {
        expect(cellText(creditMemo, 'amount', ALL, 'USD')).toBe(`${MINUS}$400.00`)
        expect(cellText(creditMemo, 'total', CREDIT_MEMOS, 'USD')).toBe('$400.00')
        expect(cellText(creditMemo, 'balance', CREDIT_MEMOS, 'USD')).toBe('$400.00')
    })

    it("draws amounts in the currency it is given (the Books settings'), not the row's", () => {
        expect(cellText(posted, 'total', INVOICES, 'EUR')).toBe('€2,400.00')
        expect(cellText(posted, 'amount', ALL, 'EUR')).toBe('€2,400.00')
    })
})

describe('cardLines', () => {
    it('on All sales gives type and number, then customer and date, with the amount', () => {
        const lines = cardLines(posted, ALL, 'USD')
        expect(lines.title).toBe('Invoice 1048')
        expect(lines.detail).toContain('Northwind Traders')
        expect(lines.detail).toContain(formatDay('2026-11-14'))
        expect(lines.amount).toBe('$2,400.00')
    })

    it('on All sales gives the type alone for a draft, with no "—"', () => {
        const lines = cardLines(namedDraft, ALL, 'USD')
        expect(lines.title).toBe('Invoice')
        expect(lines.detail).toContain('Harbor Cafe')
        expect(`${lines.title}${lines.detail}`).not.toContain(DASH)
    })

    it('on the Invoices tab gives number and customer, then the date and "Due <date>"', () => {
        const lines = cardLines(posted, INVOICES, 'USD')
        expect(lines.title).toContain('1048')
        expect(lines.title).toContain('Northwind Traders')
        expect(lines.title).not.toContain('Invoice')
        expect(lines.detail).toContain(formatDay('2026-11-14'))
        expect(lines.detail).toContain(`Due ${formatDay('2026-12-14')}`)
        expect(lines.amount).toBe('$2,400.00')
    })

    it('on the Invoices tab gives the customer alone for a draft', () => {
        expect(cardLines(namedDraft, INVOICES, 'USD').title).toBe('Harbor Cafe')
    })
})

describe('nameRowLines', () => {
    it('gives number and customer, and the amount', () => {
        const lines = nameRowLines(posted, 'USD')
        expect(lines.title).toContain('1048')
        expect(lines.title).toContain('Northwind Traders')
        expect(lines.amount).toBe('$2,400.00')
    })
})

// The purchase lists (spec docs/specs/purchase-lists-design.md §3 "Rows and columns",
// checkpoint 3): the Vendor, Category and Type cells, the purchase cards and the names
// column's rows.
describe('purchase cells', () => {
    const ALL_PURCHASES = purchaseTabOf('all')
    const BILLS = purchaseTabOf('bills')
    const EXPENSES = purchaseTabOf('expenses')
    const BILL_PAYMENTS = purchaseTabOf('bill-payments')

    const NAMES: CategoryNames = {
        accounts: new Map([['acct00000006100', 'Rent']]),
        products: new Map([['prodwifiap00001', 'Wireless access point']]),
    }

    // A draft expense with no vendor, no number, no reference and no line.
    const bareExpense = listRow({
        kind: 'expense',
        total: 2_400,
        status: { label: 'Draft', tone: 'muted' },
        recordStatus: 'draft',
        category: { kind: 'none' },
    })

    const bill = listRow({
        kind: 'bill',
        number: '1057',
        sequence: 1057,
        partyId: 'vendzenithtel01',
        partyName: 'Zenith Telecom',
        date: '2026-11-12',
        dueDate: '2026-12-12',
        reference: 'ZT-2026-1104',
        total: 18_950,
        balance: 18_950,
        category: { kind: 'product', id: 'prodwifiap00001' },
    })

    const splitBill = listRow({ ...bill, id: 'cellsplitbill01', category: { kind: 'split' } })

    const expense = listRow({
        kind: 'expense',
        number: '214',
        sequence: 214,
        partyName: 'Zenith Telecom',
        date: '2026-11-15',
        total: 8_999,
        status: { label: 'Paid', tone: 'success' },
        category: { kind: 'account', id: 'acct00000006100' },
    })

    const vendorCredit = listRow({
        kind: 'vendor_credit',
        number: '31',
        sequence: 31,
        partyName: 'Northwest Paper Co.',
        date: '2026-11-11',
        total: -40_000,
        balance: 40_000,
        status: { label: 'Unapplied', tone: 'warning' },
        category: { kind: 'product', id: 'prodwifiap00001' },
    })

    it('shows "—" for an empty vendor, number, due date, reference and category', () => {
        expect(cellText(bareExpense, 'vendor', EXPENSES, 'USD', NAMES)).toBe(DASH)
        expect(cellText(bareExpense, 'number', EXPENSES, 'USD', NAMES)).toBe(DASH)
        expect(cellText(listRow({ kind: 'bill', dueDate: '' }), 'due', BILLS, 'USD')).toBe(DASH)
        expect(
            cellText(
                listRow({ kind: 'bill_payment', reference: '' }),
                'reference',
                BILL_PAYMENTS,
                'USD'
            )
        ).toBe(DASH)
        expect(cellText(bareExpense, 'category', EXPENSES, 'USD', NAMES)).toBe(DASH)
    })

    it("shows the vendor's name and the reference", () => {
        expect(cellText(bill, 'vendor', BILLS, 'USD', NAMES)).toBe('Zenith Telecom')
        expect(cellText(bill, 'reference', BILLS, 'USD', NAMES)).toBe('ZT-2026-1104')
    })

    it('shows "Split" for two lines, with the muted flag; a name and "—" are not muted', () => {
        expect(cellText(splitBill, 'category', ALL_PURCHASES, 'USD', NAMES)).toBe('Split')
        expect(isMutedCell(splitBill, 'category')).toBe(true)
        expect(isMutedCell(expense, 'category')).toBe(false)
        expect(isMutedCell(bill, 'category')).toBe(false)
        expect(isMutedCell(splitBill, 'vendor')).toBe(false)
    })

    it("names one line's account or product", () => {
        expect(cellText(expense, 'category', EXPENSES, 'USD', NAMES)).toBe('Rent')
        expect(cellText(bill, 'category', ALL_PURCHASES, 'USD', NAMES)).toBe(
            'Wireless access point'
        )
    })

    it.each([
        ['bill', 'Bill'],
        ['expense', 'Expense'],
        ['bill_payment', 'Bill payment'],
        ['vendor_credit', 'Vendor credit'],
        ['vendor_refund', 'Vendor refund'],
    ] as const)('types a %s "%s"', (kind, label) => {
        expect(cellText(listRow({ kind }), 'type', ALL_PURCHASES, 'USD')).toBe(label)
    })

    it('shows a vendor credit negative on All purchases', () => {
        expect(cellText(vendorCredit, 'amount', ALL_PURCHASES, 'USD')).toBe(`${MINUS}$400.00`)
    })

    it('gives a card no category on All purchases and on a kind tab', () => {
        for (const tab of [ALL_PURCHASES, BILLS]) {
            const lines = cardLines(bill, tab, 'USD')
            expect(Object.values(lines).join(' ')).not.toContain('Wireless access point')
            expect(Object.values(lines).join(' ')).not.toContain('Split')
        }
        const split = cardLines(splitBill, ALL_PURCHASES, 'USD')
        expect(Object.values(split).join(' ')).not.toContain('Split')
    })

    it('on All purchases gives type and number, then vendor and date, with no due date', () => {
        const lines = cardLines(bill, ALL_PURCHASES, 'USD')
        expect(lines.title).toBe('Bill 1057')
        expect(lines.detail).toContain('Zenith Telecom')
        expect(lines.detail).toContain(formatDay('2026-11-12'))
        expect(lines.detail).not.toContain('Due')
        expect(lines.amount).toBe('$189.50')
    })

    it('on the Bills tab gives number and vendor, then the date and "Due <date>"', () => {
        const lines = cardLines(bill, BILLS, 'USD')
        expect(lines.title).toContain('1057')
        expect(lines.title).toContain('Zenith Telecom')
        expect(lines.title).not.toContain('Bill')
        expect(lines.detail).toContain(formatDay('2026-11-12'))
        expect(lines.detail).toContain(`Due ${formatDay('2026-12-12')}`)
    })

    it('gives an expense card on its kind tab no "Due"', () => {
        const withDue = listRow({ ...expense, id: 'cellexpensedue1', dueDate: '2026-12-01' })
        expect(cardLines(withDue, EXPENSES, 'USD').detail).not.toContain('Due')
    })

    it('gives a names row number and vendor, the amount and the status', () => {
        const lines = nameRowLines(vendorCredit, 'USD')
        expect(lines.title).toContain('31')
        expect(lines.title).toContain('Northwest Paper Co.')
        expect(lines.amount).toBe('$400.00')
        expect(lines.status).toBe('Unapplied')
    })
})
