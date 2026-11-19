import { describe, expect, it } from 'vitest'
import type { DocumentListRow } from '../tinycld/books/lib/document-list'
import { cardLines, cellText, nameRowLines } from '../tinycld/books/lib/document-list-cells'
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
        customerId: '',
        customerName: '',
        memo: '',
        reference: '',
        expires: '',
        balance: 0,
        entry: '',
        convertedInvoice: '',
        recordStatus: 'posted',
        ...over,
    }
}

// A draft invoice with nothing filled in but its amount.
const bareDraft = listRow({
    number: '',
    customerName: '',
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
    customerId: 'cust00000000001',
    customerName: 'Northwind Traders',
    date: '2026-11-14',
    dueDate: '2026-12-14',
    memo: 'November retainer',
    total: 240_000,
    balance: 240_000,
})

const namedDraft = listRow({
    customerId: 'cust00000000002',
    customerName: 'Harbor Cafe',
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
    customerName: 'Northwind Traders',
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
            customerName: 'Northwind Traders',
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
        customerName: 'Harborview Hospitality Group',
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
