// @vitest-environment happy-dom
import { addField, newCustomField, normalizeDraft } from '@tinycld/core/lib/forms/builder/draft'
import { validateDefinitionForHost } from '@tinycld/core/lib/forms/definition'
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { describe, expect, it } from 'vitest'
import hosts, { INVOICE_HOST_KEY, SALES_RECEIPT_HOST_KEY } from '../tinycld/books/forms/hosts'
import ui from '../tinycld/books/forms/ui'

function parsedHost(key: string) {
    const host = hosts.find(h => h.key === key)
    if (!host) throw new Error(`no ${key} host in forms/hosts.ts`)
    return hostDefSchema.parse(host)
}

const receiptHost = () => parsedHost(SALES_RECEIPT_HOST_KEY)

function builtin(key: string) {
    const found = receiptHost().builtin.find(b => b.key === key)
    if (!found) throw new Error(`no built-in ${key}`)
    return found
}

describe('books:sales_receipt forms host', () => {
    it('parses on books_sales_receipts, and its default form passes the host checks', () => {
        expect(SALES_RECEIPT_HOST_KEY).toBe('books:sales_receipt')
        const host = receiptHost()
        expect(host.collection).toBe('books_sales_receipts')
        expect(validateDefinitionForHost(defaultDefinitionFor(host), host)).toEqual([])
    })

    it('declares the built-ins in order, each header one drawn by its Books component', () => {
        const host = receiptHost()
        expect(host.builtin.map(b => b.key)).toEqual([
            'customer',
            'bill_to',
            'email',
            'date',
            'tax_rate',
            'payment_method',
            'reference_no',
            'deposit_to',
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
            deposit_to: 'DepositAccountField',
        })
        expect(builtin('reference_no').kind).toBe('text')
    })

    it('makes Customer optional and locked, Sale date required and locked, Tax locked', () => {
        expect(builtin('customer').required).toBe(false)
        expect(builtin('customer').locked).toBe(true)
        expect(builtin('date').label).toBe('Sale date')
        expect(builtin('date').required).toBe(true)
        expect(builtin('date').locked).toBe(true)
        expect(builtin('tax_rate').locked).toBe(true)
    })

    // A hidden built-in cannot be host-required, and the form hides Deposit to when
    // "Sales deposited to" names an account: the schema and the server require it.
    it('locks Deposit to without making it host-required', () => {
        expect(builtin('deposit_to').locked).toBe(true)
        expect(builtin('deposit_to').required).toBe(false)
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

    it('labels Message as printed with the receipt hint, and Memo as internal', () => {
        expect(builtin('message').label).toBe('Message to customer (printed)')
        expect(builtin('memo').label).toBe('Internal memo (not printed)')
        const fields = Object.fromEntries(
            defaultDefinitionFor(receiptHost()).fields.map(f => [f.key, f])
        )
        expect(fields.message?.description).toBe('Shown on the sales receipt and its PDF.')
        expect(fields.memo?.description).toBe(
            'Only your team sees this. Saved as the journal entry memo.'
        )
    })

    it('puts Payment method, Reference no. and Deposit to on one band row, a third each', () => {
        const definition = defaultDefinitionFor(receiptHost())
        expect(definition.pages.map(p => p.title)).toEqual(['Sales receipt'])
        const widths = Object.fromEntries(definition.fields.map(f => [f.key, f.width]))
        expect(widths).toMatchObject({
            payment_method: 'third',
            reference_no: 'third',
            deposit_to: 'third',
        })
    })

    it('bounds Reference no. at 40 characters and describes it as the check or card reference', () => {
        const reference = builtin('reference_no')
        if (reference.kind !== 'text') throw new Error('Reference no. is not a text built-in')
        expect(reference.maxLength).toBe(40)
        const field = defaultDefinitionFor(receiptHost()).fields.find(f => f.key === 'reference_no')
        expect(field?.description).toBe('Check or card reference')
    })

    // The builder adds an admin's field before `insertCustomBefore` (core Canvas
    // landingIndex), so on this host it lands right after Deposit to.
    it('orders an admin-added header field after Deposit to and before the lines', () => {
        const host = receiptHost()
        expect(host.insertCustomBefore).toBe('lines')
        const definition = defaultDefinitionFor(host)
        const at = definition.fields.findIndex(f => f.key === host.insertCustomBefore)
        const taken = new Set(definition.fields.map(f => f.key))
        const custom = newCustomField('text', 'Till no', 'main', taken)
        expect(custom.key).toBe('till_no')
        const added = addField(definition, custom, at)
        const keys = added.fields.map(f => f.key)
        expect(keys.slice(keys.indexOf('deposit_to'), keys.indexOf('lines') + 1)).toEqual([
            'deposit_to',
            'till_no',
            'lines',
        ])
        expect(validateDefinitionForHost(normalizeDraft(added), host)).toEqual([])
    })

    it('names only components the forms UI module provides', () => {
        const host = receiptHost()
        const named = host.builtin.flatMap(b => [
            ...(b.component ? [b.component] : []),
            ...(b.columns ?? []).flatMap(c => (c.component ? [c.component] : [])),
        ])
        expect(named).toContain('PaymentMethodField')
        expect(named).toContain('DepositAccountField')
        for (const name of named) expect(ui.components[name], name).toBeDefined()
    })
})
