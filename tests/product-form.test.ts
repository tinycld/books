import type { FormDefinition } from '@tinycld/core/lib/forms/definition'
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { describe, expect, it } from 'vitest'
import { productDefinitionFor } from '../tinycld/books/lib/product-form'
import { PRODUCT_TYPE_KEYS } from '../tinycld/books/lib/product-types'

// The eleven product built-ins, from a literal so this test does not depend on the
// books:product host's other choices (labels, layout, components).
const host = hostDefSchema.parse({
    key: 'books:product',
    label: 'Product or service',
    collection: 'books_products',
    formColumn: 'form',
    fieldsColumn: 'fields',
    columns: [
        'id',
        'type',
        'name',
        'sku',
        'sales_description',
        'price',
        'income_account',
        'purchases',
        'purchase_description',
        'cost',
        'expense_account',
        'inactive',
        'currency',
        'form',
        'fields',
        'name_key',
    ],
    builtin: [
        {
            key: 'type',
            label: 'Type',
            kind: 'custom',
            component: 'ProductTypeField',
            storage: 'column',
            required: true,
        },
        { key: 'name', label: 'Name', kind: 'text', storage: 'column', required: true },
        { key: 'sku', label: 'SKU', kind: 'text', storage: 'column' },
        {
            key: 'sales_description',
            label: 'Sales description',
            kind: 'textarea',
            storage: 'column',
        },
        {
            key: 'price',
            label: 'Sales price',
            kind: 'custom',
            component: 'MoneyField',
            storage: 'column',
        },
        {
            key: 'income_account',
            label: 'Income account',
            kind: 'custom',
            component: 'IncomeAccountField',
            storage: 'column',
        },
        { key: 'purchases', label: 'Purchasing', kind: 'toggle', storage: 'column' },
        {
            key: 'purchase_description',
            label: 'Purchase description',
            kind: 'textarea',
            storage: 'column',
        },
        { key: 'cost', label: 'Cost', kind: 'custom', component: 'MoneyField', storage: 'column' },
        {
            key: 'expense_account',
            label: 'Expense account',
            kind: 'custom',
            component: 'ExpenseAccountField',
            storage: 'column',
        },
        {
            key: 'items',
            label: 'Bundle items',
            kind: 'table',
            storage: 'rows',
            columns: [
                { key: 'product', label: 'Product or service', kind: 'text', required: true },
                { key: 'quantity', label: 'Qty', kind: 'number', required: true },
            ],
        },
    ],
})

const BUNDLE_HIDDEN = [
    'price',
    'income_account',
    'purchases',
    'purchase_description',
    'cost',
    'expense_account',
]

const hiddenKeys = (definition: FormDefinition) =>
    definition.fields
        .filter(f => f.hidden)
        .map(f => f.key)
        .sort()

const requiredKeys = (definition: FormDefinition) =>
    definition.fields
        .filter(f => f.required)
        .map(f => f.key)
        .sort()

function withSkuHidden(): FormDefinition {
    const base = defaultDefinitionFor(host)
    return {
        ...base,
        fields: base.fields.map(f => (f.key === 'sku' ? { ...f, hidden: true } : f)),
    }
}

describe('productDefinitionFor', () => {
    for (const type of ['service', 'non_inventory'] as const) {
        it(`hides only the bundle items and requires the income account for ${type}`, () => {
            const result = productDefinitionFor(defaultDefinitionFor(host), type, host)
            expect(hiddenKeys(result)).toEqual(['items'])
            expect(requiredKeys(result)).toEqual(['income_account', 'name', 'type'])
        })
    }

    it('hides the price, cost, accounts and purchase fields of a bundle and requires nothing new', () => {
        const result = productDefinitionFor(defaultDefinitionFor(host), 'bundle', host)
        expect(hiddenKeys(result)).toEqual([...BUNDLE_HIDDEN].sort())
        expect(requiredKeys(result)).toEqual(['name', 'type'])
    })

    for (const type of PRODUCT_TYPE_KEYS) {
        it(`keeps a field an admin hid (sku) hidden for ${type}`, () => {
            const result = productDefinitionFor(withSkuHidden(), type, host)
            expect(hiddenKeys(result)).toContain('sku')
        })

        it(`never hides type or name for ${type}`, () => {
            const result = productDefinitionFor(withSkuHidden(), type, host)
            expect(hiddenKeys(result)).not.toContain('type')
            expect(hiddenKeys(result)).not.toContain('name')
        })
    }
})
