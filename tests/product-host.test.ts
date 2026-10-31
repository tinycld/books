// @vitest-environment happy-dom
import { hostColumnSchema, validateDefinitionForHost } from '@tinycld/core/lib/forms/definition'
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { evaluate } from '@tinycld/core/lib/forms/logic'
import { buildSchema } from '@tinycld/core/lib/forms/values'
import { z } from '@tinycld/core/ui/form'
import { describe, expect, it } from 'vitest'
import hosts, {
    CUSTOMER_HOST_KEY,
    PRODUCT_HOST_KEY,
    VENDOR_HOST_KEY,
} from '../tinycld/books/forms/hosts'
import ui from '../tinycld/books/forms/ui'
import { BUNDLE_ITEM_COLUMNS } from '../tinycld/books/lib/bundle-items'
import { MONEY_VALUE_SCHEMA } from '../tinycld/books/lib/money-input'
import { EMPTY_PRODUCT_FIELDS } from '../tinycld/books/lib/product-columns'
import type { BooksProducts } from '../tinycld/books/types'

// Every column of books_products. `satisfies` makes tsc refuse this literal when the
// row type gains or loses a column, so the host's list cannot drift from the schema.
const ALL_COLUMNS = {
    id: true,
    type: true,
    name: true,
    sku: true,
    sales_description: true,
    price: true,
    income_account: true,
    purchases: true,
    purchase_description: true,
    cost: true,
    expense_account: true,
    inactive: true,
    currency: true,
    form: true,
    fields: true,
    name_key: true,
    created: true,
    updated: true,
} satisfies Record<keyof BooksProducts, true>

// [key, label, kind, required, component]
const BUILTINS = [
    ['type', 'Type', 'custom', true, 'ProductTypeField'],
    ['name', 'Name', 'text', true, undefined],
    ['sku', 'SKU', 'text', false, undefined],
    ['sales_description', 'Sales description', 'textarea', false, undefined],
    ['items', 'Bundle items', 'table', false, undefined],
    ['price', 'Sales price', 'custom', false, 'MoneyField'],
    ['income_account', 'Income account', 'custom', false, 'IncomeAccountField'],
    ['purchases', 'I purchase this from a vendor', 'toggle', false, undefined],
    ['purchase_description', 'Purchase description', 'textarea', false, undefined],
    ['cost', 'Cost', 'custom', false, 'MoneyField'],
    ['expense_account', 'Expense account', 'custom', false, 'ExpenseAccountField'],
] as const

const HALF_WIDTH = ['name', 'sku', 'price', 'income_account', 'cost', 'expense_account']

const CTX = { today: '2026-01-01', userId: 'u' }

function parsedHost() {
    const host = hosts.find(h => h.key === 'books:product')
    if (!host) throw new Error('no books:product host in forms/hosts.ts')
    return hostDefSchema.parse(host)
}

function builtin(key: string) {
    const found = parsedHost().builtin.find(b => b.key === key)
    if (!found) throw new Error(`no built-in ${key}`)
    return found
}

describe('books:product forms host', () => {
    it('parses, with its key, label, collection and host columns', () => {
        const host = parsedHost()
        expect(PRODUCT_HOST_KEY).toBe('books:product')
        expect(host.key).toBe('books:product')
        expect(host.label).toBe('Product or service')
        expect(host.collection).toBe('books_products')
        expect(host.formColumn).toBe('form')
        expect(host.fieldsColumn).toBe('fields')
        expect(host.insertCustomBefore).toBeUndefined()
    })

    it('lists every books_products column, id, currency, form, fields and name_key included', () => {
        const host = parsedHost()
        expect([...host.columns].sort()).toEqual(Object.keys(ALL_COLUMNS).sort())
    })

    it('declares the built-ins in order, with labels, kinds, required marks and components', () => {
        const host = parsedHost()
        expect(host.builtin.map(b => [b.key, b.label, b.kind, b.required, b.component])).toEqual(
            BUILTINS.map(entry => [...entry])
        )
    })

    it('keeps the bundle items in their own rows, with the bundle item columns', () => {
        const items = builtin('items')
        expect(items.storage).toBe('rows')
        expect(items.columns).toEqual(z.array(hostColumnSchema).parse(BUNDLE_ITEM_COLUMNS))
    })

    it('draws every custom built-in in a cell', () => {
        const custom = parsedHost().builtin.filter(b => b.kind === 'custom')
        expect(custom.map(b => b.key)).toEqual([
            'type',
            'price',
            'income_account',
            'cost',
            'expense_account',
        ])
        expect(custom.map(b => b.chrome)).toEqual(custom.map(() => 'cell'))
    })

    it('seeds one Product or service page with the three half-width pairs', () => {
        const definition = defaultDefinitionFor(parsedHost())
        expect(definition.pages).toHaveLength(1)
        expect(definition.pages[0].title).toBe('Product or service')
        const page = definition.pages[0].key
        expect(definition.fields.map(f => f.key)).toEqual(BUILTINS.map(([key]) => key))
        expect(definition.fields.every(f => f.page === page)).toBe(true)
        const half = definition.fields.filter(f => f.width === 'half').map(f => f.key)
        expect(half).toEqual(HALF_WIDTH)
    })

    it('seeds one rule that hides the purchase fields while purchasing is off', () => {
        const definition = defaultDefinitionFor(parsedHost())
        expect(definition.rules).toHaveLength(1)
        const [rule] = definition.rules
        expect(rule.when.map(c => [c.field, c.op])).toEqual([['purchases', 'is_false']])
        expect(rule.actions.map(a => [a.action, a.field])).toEqual([
            ['hide', 'purchase_description'],
            ['hide', 'cost'],
            ['hide', 'expense_account'],
        ])
    })

    it('seeds a default form that passes the host checks', () => {
        const host = parsedHost()
        expect(validateDefinitionForHost(defaultDefinitionFor(host), host)).toEqual([])
    })

    it('names only components the forms UI module provides', () => {
        const host = parsedHost()
        const named = host.builtin.flatMap(b => [
            ...(b.component ? [b.component] : []),
            ...(b.columns ?? []).flatMap(c => (c.component ? [c.component] : [])),
        ])
        expect(new Set(named)).toEqual(
            new Set([
                'ProductTypeField',
                'BundleProductCell',
                'MoneyField',
                'IncomeAccountField',
                'ExpenseAccountField',
            ])
        )
        for (const name of named) {
            expect(Object.keys(ui.components)).toContain(name)
            expect(ui.components[name]).toBeDefined()
        }
    })

    it('gives MoneyField the money value schema', () => {
        expect(ui.schemas?.MoneyField).toBe(MONEY_VALUE_SCHEMA)
    })

    it('refuses malformed Sales price text through the forms engine, and passes cents', () => {
        const host = parsedHost()
        const definition = defaultDefinitionFor(host)
        const schemaFor = (values: Record<string, unknown>) =>
            buildSchema(definition, host, evaluate(definition, values, CTX), ui.schemas)

        const malformed = { type: 'service', name: 'A', price: 'abc' }
        const refused = schemaFor(malformed).safeParse(malformed)
        expect(refused.success).toBe(false)
        expect(refused.error?.issues.map(issue => [issue.path, issue.message])).toEqual([
            [['price'], 'Enter an amount such as 1,250.00'],
        ])

        const cents = { type: 'service', name: 'A', price: 125000 }
        expect(schemaFor(cents).safeParse(cents).success).toBe(true)
    })

    it('starts a new product with every built-in other than the bundle items', () => {
        const keys = parsedHost()
            .builtin.map(b => b.key)
            .filter(key => key !== 'items')
        expect(Object.keys(EMPTY_PRODUCT_FIELDS).sort()).toEqual([...keys].sort())
    })

    it('keeps the customer and vendor hosts', () => {
        const keys = hosts.map(h => h.key)
        expect(keys).toContain(CUSTOMER_HOST_KEY)
        expect(keys).toContain(VENDOR_HOST_KEY)
    })
})
