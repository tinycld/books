// @vitest-environment happy-dom
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { describe, expect, it } from 'vitest'
import hosts, { VENDOR_HOST_KEY } from '../tinycld/books/forms/hosts'
import ui from '../tinycld/books/forms/ui'
import type { BooksVendors } from '../tinycld/books/types'

// Every column of books_vendors. `satisfies` makes tsc refuse this literal when the
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
    address: true,
    terms: true,
    account_number: true,
    expense_account: true,
    notes: true,
    track_1099: true,
    legal_name: true,
    tax_id_type: true,
    tax_id: true,
    inactive: true,
    form: true,
    fields: true,
    name_key: true,
    created: true,
    updated: true,
} satisfies Record<keyof BooksVendors, true>

const BUILTINS = [
    ['display_name', 'Display name', 'text'],
    ['company', 'Company name', 'text'],
    ['first_name', 'First name', 'text'],
    ['last_name', 'Last name', 'text'],
    ['email', 'Email', 'custom'],
    ['phone', 'Phone', 'custom'],
    ['mobile', 'Mobile', 'custom'],
    ['website', 'Website', 'custom'],
    ['address', 'Address', 'custom'],
    ['terms', 'Payment terms', 'custom'],
    ['account_number', 'Account number', 'custom'],
    ['expense_account', 'Default expense account', 'custom'],
    ['notes', 'Notes', 'textarea'],
] as const

const CUSTOM_COMPONENTS = {
    email: 'EmailField',
    phone: 'PhoneField',
    mobile: 'PhoneField',
    website: 'WebsiteField',
    address: 'VendorAddressField',
    terms: 'PaymentTermsField',
    account_number: 'AccountNumberField',
    expense_account: 'ExpenseAccountField',
}

const HALF_WIDTH = [
    'first_name',
    'last_name',
    'email',
    'phone',
    'mobile',
    'website',
    'terms',
    'account_number',
]

function parsedHost() {
    const host = hosts.find(h => h.key === 'books:vendor')
    if (!host) throw new Error('no books:vendor host in forms/hosts.ts')
    return hostDefSchema.parse(host)
}

describe('books:vendor forms host', () => {
    it('parses, with its key, label, collection and host columns', () => {
        const host = parsedHost()
        expect(VENDOR_HOST_KEY).toBe('books:vendor')
        expect(host.key).toBe('books:vendor')
        expect(host.label).toBe('Vendor')
        expect(host.collection).toBe('books_vendors')
        expect(host.formColumn).toBe('form')
        expect(host.fieldsColumn).toBe('fields')
        expect(host.insertCustomBefore).toBe('notes')
    })

    it('lists every books_vendors column, id, form, fields and name_key included', () => {
        const host = parsedHost()
        expect([...host.columns].sort()).toEqual(Object.keys(ALL_COLUMNS).sort())
    })

    it('declares the built-ins in order, with labels and kinds, only Display name required', () => {
        const host = parsedHost()
        expect(host.builtin.map(b => [b.key, b.label, b.kind])).toEqual(BUILTINS)
        expect(host.builtin.filter(b => b.required).map(b => b.key)).toEqual(['display_name'])
        expect(host.builtin.every(b => b.storage === 'column')).toBe(true)
    })

    it('draws the contact, address, terms, account number and expense account built-ins with Books components in a cell', () => {
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
