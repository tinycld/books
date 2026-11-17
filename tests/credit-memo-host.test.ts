// @vitest-environment happy-dom
import { validateDefinitionForHost } from '@tinycld/core/lib/forms/definition'
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { describe, expect, it } from 'vitest'
import hosts, { CREDIT_MEMO_HOST_KEY, INVOICE_HOST_KEY } from '../tinycld/books/forms/hosts'
import ui from '../tinycld/books/forms/ui'
import type { BooksCreditMemos } from '../tinycld/books/types'

function parsedHost(key: string) {
    const host = hosts.find(h => h.key === key)
    if (!host) throw new Error(`no ${key} host in forms/hosts.ts`)
    return hostDefSchema.parse(host)
}

const memoHost = () => parsedHost(CREDIT_MEMO_HOST_KEY)

function builtin(key: string) {
    const found = memoHost().builtin.find(b => b.key === key)
    if (!found) throw new Error(`no built-in ${key}`)
    return found
}

// Every column of books_credit_memos. `satisfies` fails the type check when the
// generated type gains or loses a column this list does not name.
const MEMO_COLUMNS = {
    id: true,
    customer: true,
    status: true,
    number: true,
    sequence: true,
    date: true,
    bill_to: true,
    email: true,
    tax_rate: true,
    invoice: true,
    message: true,
    memo: true,
    subtotal: true,
    tax_total: true,
    total: true,
    balance: true,
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
} satisfies Record<keyof BooksCreditMemos, true>

describe('books:credit_memo forms host', () => {
    it('parses on books_credit_memos with its form and fields columns, and its default form passes the host checks', () => {
        expect(CREDIT_MEMO_HOST_KEY).toBe('books:credit_memo')
        const host = memoHost()
        expect(host.key).toBe('books:credit_memo')
        expect(host.collection).toBe('books_credit_memos')
        expect(host.formColumn).toBe('form')
        expect(host.fieldsColumn).toBe('fields')
        expect(validateDefinitionForHost(defaultDefinitionFor(host), host)).toEqual([])
    })

    // A custom key must never shadow a column, the server-written ones included.
    it('lists every column of the collection, invoice and balance included', () => {
        const columns = memoHost().columns ?? []
        expect([...columns].sort()).toEqual(Object.keys(MEMO_COLUMNS).sort())
        expect(columns).toContain('invoice')
        expect(columns).toContain('balance')
    })

    it('declares the built-ins in order, each header one drawn by its Books component', () => {
        const host = memoHost()
        expect(host.builtin.map(b => b.key)).toEqual([
            'customer',
            'bill_to',
            'email',
            'date',
            'tax_rate',
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
        })
        expect(builtin('message').kind).toBe('textarea')
        expect(builtin('memo').kind).toBe('textarea')
    })

    it('has no Terms, no Due date and no invoice built-in', () => {
        const keys = memoHost().builtin.map(b => b.key)
        expect(keys).not.toContain('terms')
        expect(keys).not.toContain('due_date')
        expect(keys).not.toContain('invoice')
    })

    it('requires Customer, Credit memo date and the lines, and locks Customer, the date and Tax', () => {
        const required = memoHost()
            .builtin.filter(b => b.required)
            .map(b => b.key)
        expect(required.sort()).toEqual(['customer', 'date', 'lines'])
        expect(builtin('customer').label).toBe('Customer')
        expect(builtin('customer').locked).toBe(true)
        expect(builtin('date').label).toBe('Credit memo date')
        expect(builtin('date').locked).toBe(true)
        expect(builtin('tax_rate').locked).toBe(true)
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

    it('labels Message as printed with the credit memo hint, and Memo as internal', () => {
        expect(builtin('message').label).toBe('Message to customer (printed)')
        expect(builtin('memo').label).toBe('Internal memo (not printed)')
        const fields = Object.fromEntries(
            defaultDefinitionFor(memoHost()).fields.map(f => [f.key, f])
        )
        expect(fields.message?.label).toBe('Message to customer (printed)')
        expect(fields.message?.description).toBe('Shown on the credit memo and its PDF.')
        expect(fields.memo?.label).toBe('Internal memo (not printed)')
        expect(fields.memo?.description).toBe(
            'Only your team sees this. Saved as the journal entry memo.'
        )
    })

    it('seeds one Credit memo page with the party fields full width and the date and Tax half each on one row', () => {
        const definition = defaultDefinitionFor(memoHost())
        expect(definition.pages.map(p => p.title)).toEqual(['Credit memo'])
        const widths = Object.fromEntries(definition.fields.map(f => [f.key, f.width]))
        expect(widths).toMatchObject({
            customer: 'full',
            bill_to: 'full',
            email: 'full',
            date: 'half',
            tax_rate: 'half',
        })
        const keys = definition.fields.map(f => f.key)
        expect(keys.indexOf('tax_rate')).toBe(keys.indexOf('date') + 1)
        const tax = definition.fields.find(f => f.key === 'tax_rate')
        expect(tax?.narrowWidth).toBe('full')
    })

    it('puts an admin’s custom fields before the lines', () => {
        expect(memoHost().insertCustomBefore).toBe('lines')
    })

    it('names only components the forms UI module provides, line cells included', () => {
        const host = memoHost()
        const named = host.builtin.flatMap(b => [
            ...(b.component ? [b.component] : []),
            ...(b.columns ?? []).flatMap(c => (c.component ? [c.component] : [])),
        ])
        expect(named.length).toBeGreaterThan(0)
        for (const name of named) expect(ui.components[name], name).toBeDefined()
    })
})
