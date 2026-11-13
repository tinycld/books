// @vitest-environment happy-dom
import { validateDefinitionForHost } from '@tinycld/core/lib/forms/definition'
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { describe, expect, it } from 'vitest'
import {
    AcceptedDateField,
    EstimateStatusField,
    ExpirationDateField,
} from '../tinycld/books/forms/estimate-fields'
import hosts, { ESTIMATE_HOST_KEY, INVOICE_HOST_KEY } from '../tinycld/books/forms/hosts'
import ui from '../tinycld/books/forms/ui'

function parsedHost(key: string) {
    const host = hosts.find(h => h.key === key)
    if (!host) throw new Error(`no ${key} host in forms/hosts.ts`)
    return hostDefSchema.parse(host)
}

const estimateHost = () => parsedHost(ESTIMATE_HOST_KEY)

function builtin(key: string) {
    const found = estimateHost().builtin.find(b => b.key === key)
    if (!found) throw new Error(`no built-in ${key}`)
    return found
}

describe('books:estimate forms host', () => {
    it('parses on books_estimates, and its default form passes the host checks', () => {
        expect(ESTIMATE_HOST_KEY).toBe('books:estimate')
        const host = estimateHost()
        expect(host.collection).toBe('books_estimates')
        expect(host.formColumn).toBe('form')
        expect(host.fieldsColumn).toBe('fields')
        expect(validateDefinitionForHost(defaultDefinitionFor(host), host)).toEqual([])
    })

    it('declares the built-ins in order, each header one drawn by its Books component', () => {
        const host = estimateHost()
        expect(host.builtin.map(b => b.key)).toEqual([
            'customer',
            'bill_to',
            'email',
            'date',
            'expiration_date',
            'tax_rate',
            'status',
            'accepted_by',
            'accepted_date',
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
            expiration_date: 'ExpirationDateField',
            tax_rate: 'DocumentTaxField',
            status: 'EstimateStatusField',
            accepted_date: 'AcceptedDateField',
        })
    })

    it('has no Terms and no Due date', () => {
        const keys = estimateHost().builtin.map(b => b.key)
        expect(keys).not.toContain('terms')
        expect(keys).not.toContain('due_date')
    })

    it('makes Customer, Estimate date and Status required and locked, and Tax locked', () => {
        for (const key of ['customer', 'date', 'status']) {
            expect(builtin(key).required, key).toBe(true)
            expect(builtin(key).locked, key).toBe(true)
        }
        expect(builtin('date').label).toBe('Estimate date')
        expect(builtin('tax_rate').locked).toBe(true)
    })

    it('labels Expiration date, Accepted by and Accepted date, and bounds Accepted by at 200', () => {
        expect(builtin('expiration_date').label).toBe('Expiration date')
        expect(builtin('accepted_date').label).toBe('Accepted date')
        const acceptedBy = builtin('accepted_by')
        expect(acceptedBy.label).toBe('Accepted by')
        if (acceptedBy.kind !== 'text') throw new Error('Accepted by is not a text built-in')
        expect(acceptedBy.maxLength).toBe(200)
    })

    it("has the invoice's lines: the same columns, row kinds, row keys and insert keys", () => {
        const invoiceLines = parsedHost(INVOICE_HOST_KEY).builtin.find(b => b.key === 'lines')
        const lines = builtin('lines')
        expect(lines.kind).toBe('table')
        expect(lines.rowShortcuts).toBe(true)
        expect(lines.columns).toEqual(invoiceLines?.columns)
        expect(lines.rowKinds).toEqual(invoiceLines?.rowKinds)
        expect(lines.insertShortcuts).toEqual(invoiceLines?.insertShortcuts)
    })

    it('labels Message as printed with the estimate hint, and Memo as internal', () => {
        expect(builtin('message').label).toBe('Message to customer (printed)')
        expect(builtin('memo').label).toBe('Internal memo (not printed)')
        const fields = Object.fromEntries(
            defaultDefinitionFor(estimateHost()).fields.map(f => [f.key, f])
        )
        expect(fields.message?.description).toBe('Shown on the estimate and its PDF.')
        expect(fields.memo?.description).toBe('Only your team sees this.')
    })

    it('puts Status, Accepted by and Accepted date on one band row after Tax, a third each', () => {
        const definition = defaultDefinitionFor(estimateHost())
        expect(definition.pages.map(p => p.title)).toEqual(['Estimate'])
        const keys = definition.fields.map(f => f.key)
        const at = keys.indexOf('tax_rate')
        expect(keys.slice(at, at + 4)).toEqual([
            'tax_rate',
            'status',
            'accepted_by',
            'accepted_date',
        ])
        const widths = Object.fromEntries(definition.fields.map(f => [f.key, f.width]))
        expect(widths).toMatchObject({
            customer: 'full',
            bill_to: 'full',
            email: 'full',
            date: 'quarter',
            expiration_date: 'quarter',
            tax_rate: 'quarter',
            status: 'third',
            accepted_by: 'third',
            accepted_date: 'third',
        })
    })

    it('puts an admin’s custom fields before the lines', () => {
        expect(estimateHost().insertCustomBefore).toBe('lines')
    })

    it('names only components the forms UI module provides, the three estimate fields included', () => {
        const host = estimateHost()
        const named = host.builtin.flatMap(b => [
            ...(b.component ? [b.component] : []),
            ...(b.columns ?? []).flatMap(c => (c.component ? [c.component] : [])),
        ])
        for (const name of named) expect(ui.components[name], name).toBeDefined()
        expect(ui.components.EstimateStatusField).toBe(EstimateStatusField)
        expect(ui.components.ExpirationDateField).toBe(ExpirationDateField)
        expect(ui.components.AcceptedDateField).toBe(AcceptedDateField)
    })
})

describe('books:invoice forms host', () => {
    // books_invoices.estimate is a collection column, so no custom key may shadow it.
    it('lists the estimate column', () => {
        const invoice = hosts.find(h => h.key === INVOICE_HOST_KEY)
        expect(invoice?.columns).toContain('estimate')
    })
})
