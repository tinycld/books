// @vitest-environment happy-dom
import { validateDefinitionForHost } from '@tinycld/core/lib/forms/definition'
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { describe, expect, it } from 'vitest'
import hosts, {
    INVOICE_HOST_KEY,
    REFUND_RECEIPT_HOST_KEY,
    SALES_RECEIPT_HOST_KEY,
} from '../tinycld/books/forms/hosts'
import ui from '../tinycld/books/forms/ui'
import type { BooksRefundReceipts } from '../tinycld/books/types'

function parsedHost(key: string) {
    const host = hosts.find(h => h.key === key)
    if (!host) throw new Error(`no ${key} host in forms/hosts.ts`)
    return hostDefSchema.parse(host)
}

const refundHost = () => parsedHost(REFUND_RECEIPT_HOST_KEY)

function builtin(key: string) {
    const found = refundHost().builtin.find(b => b.key === key)
    if (!found) throw new Error(`no built-in ${key}`)
    return found
}

// Every column of books_refund_receipts (spec §4.1). `satisfies` fails the type
// check when the generated type gains or loses a column this list does not name.
const REFUND_COLUMNS = {
    id: true,
    customer: true,
    status: true,
    number: true,
    sequence: true,
    date: true,
    bill_to: true,
    email: true,
    tax_rate: true,
    payment_method: true,
    reference_no: true,
    refund_from: true,
    sales_receipt: true,
    credit_memo: true,
    message: true,
    memo: true,
    subtotal: true,
    tax_total: true,
    total: true,
    revision: true,
    currency: true,
    entry: true,
    posted_at: true,
    posted_by: true,
    voided_at: true,
    voided_by: true,
    replaces: true,
    replaced_by: true,
    form: true,
    fields: true,
    sort_key: true,
    created: true,
    updated: true,
} satisfies Record<keyof BooksRefundReceipts, true>

describe('books:refund_receipt forms host', () => {
    it('parses on books_refund_receipts with its form and fields columns, and its default form passes the host checks', () => {
        expect(REFUND_RECEIPT_HOST_KEY).toBe('books:refund_receipt')
        const host = refundHost()
        expect(host.key).toBe('books:refund_receipt')
        expect(host.collection).toBe('books_refund_receipts')
        expect(host.formColumn).toBe('form')
        expect(host.fieldsColumn).toBe('fields')
        expect(validateDefinitionForHost(defaultDefinitionFor(host), host)).toEqual([])
    })

    // A custom key must never shadow a column, the two link columns included.
    it('lists every column of the collection, sales_receipt and credit_memo included', () => {
        const columns = refundHost().columns ?? []
        expect([...columns].sort()).toEqual(Object.keys(REFUND_COLUMNS).sort())
        expect(columns).toContain('sales_receipt')
        expect(columns).toContain('credit_memo')
    })

    it('declares the built-ins in order, each header one drawn by its Books component', () => {
        const host = refundHost()
        expect(host.builtin.map(b => b.key)).toEqual([
            'customer',
            'bill_to',
            'email',
            'date',
            'tax_rate',
            'payment_method',
            'reference_no',
            'refund_from',
            'lines',
            'message',
            'memo',
        ])
        const custom = Object.fromEntries(
            host.builtin.filter(b => b.kind === 'custom').map(b => [b.key, b.component])
        )
        expect(custom).toEqual({
            customer: 'CustomerField',
            bill_to: 'BillToField',
            email: 'BandEmailField',
            date: 'DocumentDateField',
            tax_rate: 'DocumentTaxField',
            payment_method: 'PaymentMethodField',
            refund_from: 'RefundFromField',
        })
        expect(builtin('reference_no').kind).toBe('text')
    })

    // The link row writes the two links (spec §4.4): they are stored columns, not
    // built-ins an admin could place or hide.
    it('has no sales_receipt and no credit_memo built-in', () => {
        const keys = refundHost().builtin.map(b => b.key)
        expect(keys).not.toContain('sales_receipt')
        expect(keys).not.toContain('credit_memo')
    })

    it('makes Customer optional and locked, Refund date required and locked, Tax locked', () => {
        expect(builtin('customer').required).toBe(false)
        expect(builtin('customer').locked).toBe(true)
        expect(builtin('date').label).toBe('Refund date')
        expect(builtin('date').required).toBe(true)
        expect(builtin('date').locked).toBe(true)
        expect(builtin('tax_rate').locked).toBe(true)
    })

    // Refund from always shows (no "Sales deposited to" setting hides it), so the
    // host requires it, unlike the sales receipt's Deposit to.
    it('makes Refund from required and locked, labeled Refund from', () => {
        expect(builtin('refund_from').label).toBe('Refund from')
        expect(builtin('refund_from').required).toBe(true)
        expect(builtin('refund_from').locked).toBe(true)
    })

    it("has the invoice's lines: the same columns, row kinds, row keys and insert keys", () => {
        const invoiceLines = parsedHost(INVOICE_HOST_KEY).builtin.find(b => b.key === 'lines')
        const lines = builtin('lines')
        expect(lines.kind).toBe('table')
        expect(lines.required).toBe(true)
        expect(lines.rowShortcuts).toBe(true)
        expect(lines.columns).toEqual(invoiceLines?.columns)
        expect(lines.rowKinds).toEqual(invoiceLines?.rowKinds)
        expect(lines.insertShortcuts).toEqual(invoiceLines?.insertShortcuts)
    })

    it('labels Message as printed with the refund receipt hint, and Memo as internal', () => {
        expect(builtin('message').label).toBe('Message to customer (printed)')
        expect(builtin('memo').label).toBe('Internal memo (not printed)')
        const fields = Object.fromEntries(
            defaultDefinitionFor(refundHost()).fields.map(f => [f.key, f])
        )
        expect(fields.message?.description).toBe('Shown on the refund receipt and its PDF.')
        expect(fields.memo?.description).toBe(
            'Only your team sees this. Saved as the journal entry memo.'
        )
    })

    it('bounds Reference no. at 40 characters and describes it as the check or card reference', () => {
        const reference = builtin('reference_no')
        if (reference.kind !== 'text') throw new Error('Reference no. is not a text built-in')
        expect(reference.maxLength).toBe(40)
        const field = defaultDefinitionFor(refundHost()).fields.find(f => f.key === 'reference_no')
        expect(field?.description).toBe('Check or card reference')
    })

    // Band row 1 takes the sales receipt layout's widths; band row 2 is Payment
    // method, Reference no. and Refund from, a third each.
    it('seeds one Refund receipt page: the sales receipt band widths, then the Payment row', () => {
        const definition = defaultDefinitionFor(refundHost())
        expect(definition.pages.map(p => p.title)).toEqual(['Refund receipt'])
        const layout = (fields: typeof definition.fields) =>
            Object.fromEntries(
                fields.map(f => [f.key, { width: f.width, narrowWidth: f.narrowWidth }])
            )
        const refund = layout(definition.fields)
        const receipt = layout(defaultDefinitionFor(parsedHost(SALES_RECEIPT_HOST_KEY)).fields)
        for (const key of [
            'customer',
            'bill_to',
            'email',
            'date',
            'tax_rate',
            'payment_method',
            'reference_no',
        ]) {
            expect(refund[key], key).toEqual(receipt[key])
        }
        expect(refund.refund_from?.width).toBe('third')
        expect({
            payment_method: refund.payment_method?.width,
            reference_no: refund.reference_no?.width,
        }).toEqual({ payment_method: 'third', reference_no: 'third' })
        const keys = definition.fields.map(f => f.key)
        expect(keys.slice(keys.indexOf('payment_method'), keys.indexOf('lines') + 1)).toEqual([
            'payment_method',
            'reference_no',
            'refund_from',
            'lines',
        ])
    })

    it('puts an admin’s custom fields before the lines', () => {
        expect(refundHost().insertCustomBefore).toBe('lines')
    })

    it('names only components the forms UI module provides, RefundFromField included', () => {
        const host = refundHost()
        const named = host.builtin.flatMap(b => [
            ...(b.component ? [b.component] : []),
            ...(b.columns ?? []).flatMap(c => (c.component ? [c.component] : [])),
        ])
        expect(named).toContain('RefundFromField')
        for (const name of named) expect(ui.components[name], name).toBeDefined()
    })
})
