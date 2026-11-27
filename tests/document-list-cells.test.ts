import { describe, expect, it } from 'vitest'
import type { DocumentListRow } from '../tinycld/books/lib/document-list'
import {
    CARD_OPEN_LINE_HEIGHT,
    cardLines,
    cellText,
    isMutedCell,
    listCardHeight,
    nameRowLines,
} from '../tinycld/books/lib/document-list-cells'
import type { CategoryNames } from '../tinycld/books/lib/purchase-category'
import { purchaseTabOf, vendorTransactionsTab } from '../tinycld/books/lib/purchase-lists'
import { formatDay } from '../tinycld/books/lib/register-range'
import { customerTransactionsTab, salesTabOf } from '../tinycld/books/lib/sales-lists'

// The text of a sales list's cells, cards and names-column rows (spec
// the Sales lists design spec §3 "Rows and columns", checkpoint 2).

const DASH = '—'
const MINUS = '−'

const ALL = salesTabOf('all')
const INVOICES = salesTabOf('invoices')
const ESTIMATES = salesTabOf('estimates')
const CREDIT_MEMOS = salesTabOf('credit-memos')

let next = 0
function listRow(over: Partial<DocumentListRow>): DocumentListRow {
    next++
    const id = `cell${String(next).padStart(11, '0')}`
    return {
        id,
        key: id,
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
        email: '',
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

// Refund receipt spec §3.13: a refund's amount shows with a minus sign on its own tab and
// on All sales; refundReceiptRow carries its stored total negated.
describe('a refund receipt row', () => {
    const REFUNDS = salesTabOf('refund-receipts')
    const refund = listRow({
        kind: 'refund_receipt',
        number: '1003',
        sequence: 1003,
        partyName: 'Harborview Hospitality Group',
        total: -15_000,
        status: { label: 'Refunded', tone: 'success' },
    })

    it('shows its total as −$150.00 on the Refund receipts tab', () => {
        expect(cellText(refund, 'total', REFUNDS, 'USD')).toBe(`${MINUS}$150.00`)
    })

    it('shows its amount as −$150.00 on All sales and its type as Refund receipt', () => {
        expect(cellText(refund, 'amount', ALL, 'USD')).toBe(`${MINUS}$150.00`)
        expect(cellText(refund, 'type', ALL, 'USD')).toBe('Refund receipt')
    })

    it('shows −$150.00 on its card on both tabs', () => {
        expect(cardLines(refund, REFUNDS, 'USD').amount).toBe(`${MINUS}$150.00`)
        expect(cardLines(refund, ALL, 'USD').amount).toBe(`${MINUS}$150.00`)
    })

    it('shows a zero total with no sign', () => {
        const zero = listRow({ kind: 'refund_receipt', total: 0 })
        expect(cellText(zero, 'total', REFUNDS, 'USD')).toBe('$0.00')
        expect(cellText(zero, 'amount', ALL, 'USD')).toBe('$0.00')
    })
})

// Write-off spec §3.6: a write-off row shows its total with a minus sign on every tab, as a
// refund receipt row does; writeOffRow carries its amount negated.
describe('a write-off row', () => {
    const WRITE_OFFS = customerTransactionsTab('write_off')
    // The minus sign follows the kind, not the tab's sign.
    const UNSIGNED = { ...WRITE_OFFS, isSigned: false }
    const writeOff = listRow({
        kind: 'write_off',
        number: '1001',
        sequence: 1001,
        partyName: 'Delta Freight Partners',
        total: -40_000,
        status: { label: 'Written off', tone: 'muted' },
    })

    it('shows its total and amount as −$400.00 on a signed and an unsigned tab', () => {
        expect(cellText(writeOff, 'total', UNSIGNED, 'USD')).toBe(`${MINUS}$400.00`)
        expect(cellText(writeOff, 'amount', UNSIGNED, 'USD')).toBe(`${MINUS}$400.00`)
        expect(cellText(writeOff, 'amount', WRITE_OFFS, 'USD')).toBe(`${MINUS}$400.00`)
        expect(cellText(writeOff, 'type', WRITE_OFFS, 'USD')).toBe('Write-off')
    })

    it('shows −$400.00 on its card', () => {
        expect(cardLines(writeOff, UNSIGNED, 'USD').amount).toBe(`${MINUS}$400.00`)
        expect(cardLines(writeOff, WRITE_OFFS, 'USD').amount).toBe(`${MINUS}$400.00`)
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

// The purchase lists (the Purchase lists design spec §3 "Rows and columns",
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

// A purchase order's card on the Purchase orders tab has a third line, "Open $x", while its
// open amount is above zero; the All purchases card (and the vendor page's) is "type and
// number, then party and date" with no third line (purchase order spec §3.9). A card's
// height follows its lines: padding 24, then two text lines of 48 at the font scale, and
// the Open line's CARD_OPEN_LINE_HEIGHT (20) at the font scale.
describe('the third card line of a purchase order and the card height', () => {
    const PURCHASE_ORDERS_TAB = purchaseTabOf('purchase-orders')
    const ALL_PURCHASES = purchaseTabOf('all')
    const BILLS = purchaseTabOf('bills')
    const VENDOR_ALL = vendorTransactionsTab('all')
    const FONT_SCALE = 1.5
    const TWO_LINES = 24 + 48 * FONT_SCALE
    const THREE_LINES = 24 + (48 + 20) * FONT_SCALE

    const openOrder = listRow({
        kind: 'purchase_order',
        number: '1004',
        sequence: 1004,
        partyName: 'Office Supply World',
        date: '2026-11-10',
        total: 31_800,
        balance: 31_800,
        recordStatus: 'open',
        status: { label: 'Open', tone: 'warning' },
        openLines: 2,
    })

    const closedOrder = listRow({
        kind: 'purchase_order',
        number: '1001',
        sequence: 1001,
        partyName: 'Summit IT Services',
        date: '2026-11-02',
        total: 50_000,
        balance: 0,
        recordStatus: 'closed',
        status: { label: 'Closed', tone: 'muted' },
        openLines: 0,
    })

    const openBill = listRow({
        kind: 'bill',
        number: '1057',
        sequence: 1057,
        partyName: 'Zenith Telecom',
        date: '2026-11-12',
        dueDate: '2026-12-12',
        total: 18_950,
        balance: 18_950,
    })

    it('draws "Open $318.00" on the Purchase orders tab for an order with an open amount', () => {
        expect(cardLines(openOrder, PURCHASE_ORDERS_TAB, 'USD').open).toBe('Open $318.00')
    })

    it('draws no Open line for the same order on All purchases, nor on the vendor page', () => {
        const lines = cardLines(openOrder, ALL_PURCHASES, 'USD')
        expect(lines.open).toBe('')
        expect(lines.title).toBe('Purchase order 1004')
        expect(lines.detail).toBe(`Office Supply World · ${formatDay('2026-11-10')}`)
        expect(cardLines(openOrder, VENDOR_ALL, 'USD').open).toBe('')
    })

    it('makes the open order card on the Purchase orders tab 20 × font scale taller', () => {
        expect(CARD_OPEN_LINE_HEIGHT).toBe(20)
        expect(listCardHeight(openOrder, PURCHASE_ORDERS_TAB, FONT_SCALE)).toBe(THREE_LINES)
    })

    it('keeps a closed order card on the Purchase orders tab at two lines', () => {
        expect(cardLines(closedOrder, PURCHASE_ORDERS_TAB, 'USD').open).toBe('')
        expect(listCardHeight(closedOrder, PURCHASE_ORDERS_TAB, FONT_SCALE)).toBe(TWO_LINES)
    })

    it('keeps a bill card at two lines on its tab and on All purchases', () => {
        expect(listCardHeight(openBill, BILLS, FONT_SCALE)).toBe(TWO_LINES)
        expect(listCardHeight(openBill, ALL_PURCHASES, FONT_SCALE)).toBe(TWO_LINES)
    })

    it('gives the open order card on All purchases and the vendor page no extra height', () => {
        expect(listCardHeight(openOrder, ALL_PURCHASES, FONT_SCALE)).toBe(TWO_LINES)
        expect(listCardHeight(openOrder, VENDOR_ALL, FONT_SCALE)).toBe(TWO_LINES)
    })
})
