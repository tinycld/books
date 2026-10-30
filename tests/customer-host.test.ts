// @vitest-environment happy-dom
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { describe, expect, it } from 'vitest'
import hosts, { CUSTOMER_HOST_KEY } from '../tinycld/books/forms/hosts'
import ui from '../tinycld/books/forms/ui'
import type { BooksCustomers } from '../tinycld/books/types'

// Every column of books_customers. `satisfies` makes tsc refuse this literal when the
// row type gains or loses a column, so the host's list cannot drift from the schema.
const ALL_COLUMNS = {
    id: true,
    display_name: true,
    company: true,
    first_name: true,
    last_name: true,
    email: true,
    phone: true,
    mobile: true,
    website: true,
    parent: true,
    billing_address: true,
    shipping_address: true,
    notes: true,
    inactive: true,
    form: true,
    fields: true,
    name_key: true,
    created: true,
    updated: true,
} satisfies Record<keyof BooksCustomers, true>

const BUILTINS = [
    ['display_name', 'Display name', 'text'],
    ['company', 'Company name', 'text'],
    ['first_name', 'First name', 'text'],
    ['last_name', 'Last name', 'text'],
    ['email', 'Email', 'custom'],
    ['phone', 'Phone', 'custom'],
    ['mobile', 'Mobile', 'custom'],
    ['website', 'Website', 'custom'],
    ['parent', 'Parent customer', 'custom'],
    ['billing_address', 'Billing address', 'custom'],
    ['shipping_address', 'Shipping address', 'custom'],
    ['notes', 'Notes', 'textarea'],
] as const

const CUSTOM_COMPONENTS = {
    email: 'EmailField',
    phone: 'PhoneField',
    mobile: 'PhoneField',
    website: 'WebsiteField',
    parent: 'ParentCustomerField',
    billing_address: 'BillingAddressField',
    shipping_address: 'ShippingAddressField',
}

const HALF_WIDTH = ['first_name', 'last_name', 'email', 'phone', 'mobile', 'website']

function parsedHost() {
    const host = hosts.find(h => h.key === CUSTOMER_HOST_KEY)
    if (!host) throw new Error('no books:customer host in forms/hosts.ts')
    return hostDefSchema.parse(host)
}

describe('books:customer forms host', () => {
    it('parses, with its key, collection and host columns', () => {
        const host = parsedHost()
        expect(CUSTOMER_HOST_KEY).toBe('books:customer')
        expect(host.key).toBe('books:customer')
        expect(host.collection).toBe('books_customers')
        expect(host.formColumn).toBe('form')
        expect(host.fieldsColumn).toBe('fields')
        expect(host.insertCustomBefore).toBe('notes')
    })

    it('lists every books_customers column, id, form and fields included', () => {
        const host = parsedHost()
        expect([...host.columns].sort()).toEqual(Object.keys(ALL_COLUMNS).sort())
        expect(host.columns).toEqual(expect.arrayContaining(['id', 'form', 'fields']))
    })

    it('declares the built-ins in order, with labels and kinds, only Display name required', () => {
        const host = parsedHost()
        expect(host.builtin.map(b => [b.key, b.label, b.kind])).toEqual(BUILTINS)
        expect(host.builtin.filter(b => b.required).map(b => b.key)).toEqual(['display_name'])
        expect(host.builtin.every(b => b.storage === 'column')).toBe(true)
    })

    it('draws the contact, parent and address built-ins with Books components in a cell', () => {
        const host = parsedHost()
        const custom = host.builtin.filter(b => b.kind === 'custom')
        expect(Object.fromEntries(custom.map(b => [b.key, b.component]))).toEqual(CUSTOM_COMPONENTS)
        expect(custom.map(b => b.chrome)).toEqual(custom.map(() => 'cell'))
    })

    it('seeds one page with half-width pairs and every other field full width', () => {
        const definition = defaultDefinitionFor(parsedHost())
        expect(definition.pages).toHaveLength(1)
        const page = definition.pages[0].key
        expect(definition.fields.map(f => f.key)).toEqual(BUILTINS.map(([key]) => key))
        expect(definition.fields.every(f => f.page === page)).toBe(true)
        const widths = Object.fromEntries(definition.fields.map(f => [f.key, f.width]))
        expect(widths).toEqual(
            Object.fromEntries(
                BUILTINS.map(([key]) => [key, HALF_WIDTH.includes(key) ? 'half' : 'full'])
            )
        )
    })

    it('names only components the forms UI module provides', () => {
        const host = parsedHost()
        const named = host.builtin.flatMap(b => (b.component ? [b.component] : []))
        expect(new Set(named)).toEqual(new Set(Object.values(CUSTOM_COMPONENTS)))
        for (const name of named) {
            expect(Object.keys(ui.components)).toContain(name)
            expect(ui.components[name]).toBeDefined()
        }
    })
})
