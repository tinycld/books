// @vitest-environment happy-dom
import { validateDefinitionForHost } from '@tinycld/core/lib/forms/definition'
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { describe, expect, it } from 'vitest'
import hosts, { INVOICE_HOST_KEY } from '../tinycld/books/forms/hosts'
import ui from '../tinycld/books/forms/ui'

function parsedHost() {
    const host = hosts.find(h => h.key === INVOICE_HOST_KEY)
    if (!host) throw new Error('no books:invoice host in forms/hosts.ts')
    return hostDefSchema.parse(host)
}

function builtin(key: string) {
    const found = parsedHost().builtin.find(b => b.key === key)
    if (!found) throw new Error(`no built-in ${key}`)
    return found
}

function linesKind(key: string) {
    const kind = builtin('lines').rowKinds?.find(k => k.key === key)
    if (!kind) throw new Error(`no row kind ${key}`)
    return kind
}

function linesColumn(key: string) {
    const column = builtin('lines').columns?.find(c => c.key === key)
    if (!column) throw new Error(`no lines column ${key}`)
    return column
}

describe('books:invoice forms host', () => {
    it('parses, on books_invoices with its form and fields columns', () => {
        expect(INVOICE_HOST_KEY).toBe('books:invoice')
        const host = parsedHost()
        expect(host.key).toBe('books:invoice')
        expect(host.collection).toBe('books_invoices')
        expect(host.formColumn).toBe('form')
        expect(host.fieldsColumn).toBe('fields')
    })

    it('declares the built-ins in order, each header one drawn by its Books component', () => {
        const host = parsedHost()
        expect(host.builtin.map(b => b.key)).toEqual([
            'customer',
            'bill_to',
            'email',
            'terms',
            'date',
            'due_date',
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
            terms: 'DocumentTermsField',
            date: 'DocumentDateField',
            due_date: 'DueDateField',
            tax_rate: 'DocumentTaxField',
        })
        expect(builtin('message').kind).toBe('textarea')
        expect(builtin('memo').kind).toBe('textarea')
    })

    it('requires Customer, Invoice date, Due date and the lines, and nothing else', () => {
        const required = parsedHost()
            .builtin.filter(b => b.required)
            .map(b => b.key)
        expect(required.sort()).toEqual(['customer', 'date', 'due_date', 'lines'])
    })

    it('locks Terms and Tax, so an admin can move them but never hide them', () => {
        expect(builtin('terms').locked).toBe(true)
        expect(builtin('tax_rate').locked).toBe(true)
    })

    it('keeps the lines in their own rows with the four row kinds and core row keys', () => {
        const lines = builtin('lines')
        expect(lines.kind).toBe('table')
        expect(lines.storage).toBe('rows')
        expect(lines.rowShortcuts).toBe(true)
        expect(
            (lines.rowKinds ?? []).map(k => [k.key, k.label, k.addLabel, k.shortcut, k.span])
        ).toEqual([
            ['item', 'Item', 'Add line', 'Alt+Enter', false],
            ['description', 'Description', 'Description line', 'Alt+t', true],
            ['subtotal', 'Subtotal', 'Subtotal', 'Alt+s', true],
            ['percent', 'Percent', 'Percent line', 'Alt+5', false],
        ])
        expect(linesKind('item').columns).toEqual([
            'product',
            'description',
            'quantity',
            'rate',
            'amount',
            'taxable',
        ])
        expect(linesKind('description').columns).toEqual(['description'])
        expect(linesKind('subtotal').columns).toEqual(['amount'])
        expect(linesKind('percent').columns).toEqual([
            'product',
            'description',
            'percent',
            'amount',
            'taxable',
        ])
        expect(linesKind('percent').columnAt).toEqual({ percent: 'rate' })
    })

    it('requires each kind’s own cells: an item its product, a description line its text, a percent line its product and percent', () => {
        expect(linesKind('item').required).toEqual(['product'])
        expect(linesKind('description').required).toEqual(['description'])
        expect(linesKind('subtotal').required ?? []).toEqual([])
        expect(linesKind('percent').required).toEqual(['product', 'percent'])
        // An item may leave its description blank.
        expect(linesColumn('description').required).toBe(false)
    })

    // invoiceSchema owns these bounds with the invoice's own texts (code points for the
    // description); a column bound would put core's default text first.
    it('puts no bound on Qty or Description, and draws Qty with the Books quantity cell', () => {
        const quantity = linesColumn('quantity')
        if (quantity.kind !== 'number') throw new Error('Qty is not a number column')
        expect(quantity.min).toBeUndefined()
        expect(quantity.max).toBeUndefined()
        expect(quantity.component).toBe('LineQuantityCell')
        expect(linesColumn('taxable').component).toBe('LineTaxableCell')
        const description = linesColumn('description')
        if (description.kind !== 'text') throw new Error('Description is not a text column')
        expect(description.maxLength).toBeUndefined()
    })

    // Core gives a column without `flex` the weight 1.
    it('makes Description the widest line column and Product the next', () => {
        const weights = Object.fromEntries(
            (builtin('lines').columns ?? []).map(c => [c.key, c.flex ?? 1])
        )
        const others = Object.entries(weights).filter(
            ([key]) => key !== 'description' && key !== 'product'
        )
        expect(others.length).toBeGreaterThan(0)
        expect(weights.description).toBeGreaterThan(weights.product)
        for (const [key, weight] of others) {
            expect(weights.product, `Product vs ${key}`).toBeGreaterThan(weight)
        }
    })

    it('adds a line on Enter in Rate and in Percent', () => {
        expect(linesColumn('rate').addOnSubmit).toBe(true)
        expect(linesColumn('percent').addOnSubmit).toBe(true)
        const others = (builtin('lines').columns ?? []).filter(c => c.addOnSubmit)
        expect(others.map(c => c.key).sort()).toEqual(['percent', 'rate'])
    })

    it('puts an admin’s custom fields before the lines', () => {
        expect(parsedHost().insertCustomBefore).toBe('lines')
    })

    it('seeds one Invoice page with the header widths of the band', () => {
        const definition = defaultDefinitionFor(parsedHost())
        expect(definition.pages.map(p => p.title)).toEqual(['Invoice'])
        const widths = Object.fromEntries(definition.fields.map(f => [f.key, f.width]))
        expect(widths).toMatchObject({
            customer: 'full',
            bill_to: 'full',
            email: 'full',
            terms: 'quarter',
            date: 'quarter',
            due_date: 'quarter',
        })
    })

    // Revise 1 item 1: Tax takes its content width, never half the row; a narrow
    // width of half or quarter would bring back half-row Tax below 640 px.
    it('gives Tax its content width at every form width', () => {
        const tax = defaultDefinitionFor(parsedHost()).fields.find(f => f.key === 'tax_rate')
        expect(tax?.width).toBe('auto')
        expect(['half', 'quarter']).not.toContain(tax?.narrowWidth)
        const placed = parsedHost().layout?.fields.tax_rate
        expect(placed?.width).toBe('auto')
        expect(['half', 'quarter']).not.toContain(placed?.narrowWidth)
    })

    // Revise 1 item 4: the label alone tells the customer's message from the team's memo,
    // and the seeded field's hint says where each one goes.
    it('labels Message as printed for the customer and Memo as internal, each with a hint', () => {
        expect(builtin('message').label).toBe('Message to customer (prints on invoice)')
        expect(builtin('memo').label).toBe('Internal memo (not printed)')
        const fields = Object.fromEntries(
            defaultDefinitionFor(parsedHost()).fields.map(f => [f.key, f])
        )
        expect(fields.message?.label).toBe('Message to customer (prints on invoice)')
        expect(fields.message?.description).toBe('Shown on the invoice and PDF.')
        expect(fields.memo?.label).toBe('Internal memo (not printed)')
        expect(fields.memo?.description).toBe(
            'Only your team sees this. Saved as the journal entry memo.'
        )
    })

    it('seeds a default form that passes the host checks', () => {
        const host = parsedHost()
        expect(validateDefinitionForHost(defaultDefinitionFor(host), host)).toEqual([])
    })

    it('names only components the forms UI module provides, line cells included', () => {
        const host = parsedHost()
        const named = host.builtin.flatMap(b => [
            ...(b.component ? [b.component] : []),
            ...(b.columns ?? []).flatMap(c => (c.component ? [c.component] : [])),
        ])
        expect(new Set(named)).toEqual(
            new Set([
                'CustomerField',
                'BillToField',
                'BandEmailField',
                'DocumentTermsField',
                'DocumentDateField',
                'DueDateField',
                'DocumentTaxField',
                'LineProductCell',
                'LineDescriptionCell',
                'LineQuantityCell',
                'LineRateCell',
                'LinePercentCell',
                'LineAmountCell',
                'LineTaxableCell',
            ])
        )
        for (const name of named) expect(ui.components[name]).toBeDefined()
    })
})
