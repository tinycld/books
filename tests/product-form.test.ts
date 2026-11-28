import type { FormDefinition } from '@tinycld/core/lib/forms/definition'
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { describe, expect, it } from 'vitest'
import hosts from '../tinycld/books/forms/hosts'
import {
    COGS_ACCOUNT_LABEL,
    INVENTORY_BUILTINS,
    PRODUCT_HIDDEN_BUILTINS,
    productDefinitionFor,
    productHostFor,
} from '../tinycld/books/lib/product-form'
import { PRODUCT_TYPE_KEYS } from '../tinycld/books/lib/product-types'

// The nineteen product built-ins, from a literal so this test does not depend on the
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
        'vendor_part_no',
        'sales_description',
        'price',
        'income_account',
        'purchases',
        'purchase_description',
        'cost',
        'expense_account',
        'asset_account',
        'preferred_vendor',
        'reorder_point',
        'opening_quantity',
        'opening_value',
        'opening_date',
        'quantity_on_hand',
        'stock_value',
        'default_bin',
        'taxable',
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
        { key: 'vendor_part_no', label: 'Vendor part no.', kind: 'text', storage: 'column' },
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
        { key: 'taxable', label: 'Taxable', kind: 'toggle', storage: 'column' },
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
            key: 'asset_account',
            label: 'Inventory asset account',
            kind: 'custom',
            component: 'AssetAccountField',
            storage: 'column',
        },
        {
            key: 'preferred_vendor',
            label: 'Preferred vendor',
            kind: 'custom',
            component: 'PreferredVendorField',
            storage: 'column',
        },
        {
            key: 'opening_quantity',
            label: 'Opening quantity',
            kind: 'custom',
            component: 'QuantityField',
            storage: 'column',
        },
        {
            key: 'opening_value',
            label: 'Opening value',
            kind: 'custom',
            component: 'MoneyField',
            storage: 'column',
        },
        {
            key: 'opening_date',
            label: 'Opening stock as of',
            kind: 'custom',
            component: 'OpeningDateField',
            storage: 'column',
        },
        {
            key: 'reorder_point',
            label: 'Reorder point',
            kind: 'custom',
            component: 'QuantityField',
            storage: 'column',
        },
        {
            key: 'default_bin',
            label: 'Default bin',
            kind: 'custom',
            component: 'DefaultBinField',
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

// inventory-adjust spec §3.6, §3.7: Default bin is an Inventory item's field; the
// Quantity on hand row is gone (the item page's figures show it).
const INVENTORY_ONLY = [
    'asset_account',
    'default_bin',
    'opening_date',
    'opening_quantity',
    'opening_value',
    'preferred_vendor',
    'reorder_point',
]

const BUNDLE_HIDDEN = [
    'price',
    'income_account',
    'taxable',
    'purchases',
    'purchase_description',
    'cost',
    'expense_account',
    ...INVENTORY_ONLY,
]

const labelOf = (definition: FormDefinition, key: string) =>
    definition.fields.find(f => f.key === key)?.label

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
        fields: base.fields.map(f => (f.key === 'vendor_part_no' ? { ...f, hidden: true } : f)),
    }
}

describe('PRODUCT_HIDDEN_BUILTINS', () => {
    // A bundle's lines take their taxability from each item.
    it('hides Taxable for a bundle only', () => {
        expect(PRODUCT_HIDDEN_BUILTINS.bundle).toContain('taxable')
        expect(PRODUCT_HIDDEN_BUILTINS.service).not.toContain('taxable')
        expect(PRODUCT_HIDDEN_BUILTINS.non_inventory).not.toContain('taxable')
        expect(PRODUCT_HIDDEN_BUILTINS.inventory).not.toContain('taxable')
    })

    it('names every inventory built-in of the books:product host, and no other field', () => {
        const product = hosts.find(h => h.key === 'books:product')
        const named = product?.builtin.filter(b =>
            (INVENTORY_BUILTINS as readonly string[]).includes(b.key)
        )
        expect(named?.map(b => b.key).sort()).toEqual([...INVENTORY_BUILTINS].sort())
        expect([...INVENTORY_BUILTINS].sort()).toEqual(INVENTORY_ONLY)
    })
})

describe('productDefinitionFor', () => {
    for (const type of ['service', 'non_inventory'] as const) {
        for (const mode of ['new', 'edit'] as const) {
            it(`hides the bundle items and the inventory fields and requires the income account for ${type} (${mode})`, () => {
                const result = productDefinitionFor(defaultDefinitionFor(host), type, host, mode)
                expect(hiddenKeys(result)).toEqual([...INVENTORY_ONLY, 'items'].sort())
                expect(requiredKeys(result)).toEqual(['income_account', 'name', 'type'])
                expect(labelOf(result, 'expense_account')).toBe('Expense account')
            })
        }
    }

    it('shows every inventory field of an edited Inventory item, and hides the purchasing toggle', () => {
        const result = productDefinitionFor(defaultDefinitionFor(host), 'inventory', host, 'edit')
        expect(hiddenKeys(result)).toEqual(['items', 'purchases'])
        expect(requiredKeys(result)).toEqual(['income_account', 'name', 'type'])
    })

    it('shows every inventory field of a new Inventory item, Default bin among them', () => {
        const result = productDefinitionFor(defaultDefinitionFor(host), 'inventory', host, 'new')
        expect(hiddenKeys(result)).toEqual(['items', 'purchases'])
    })

    for (const mode of ['new', 'edit'] as const) {
        it(`draws Default bin right after Reorder point on an Inventory item (${mode})`, () => {
            const result = productDefinitionFor(defaultDefinitionFor(host), 'inventory', host, mode)
            const shown = result.fields.filter(f => !f.hidden).map(f => f.key)
            expect(shown.indexOf('default_bin')).toBe(shown.indexOf('reorder_point') + 1)
            expect(shown).not.toContain('quantity_on_hand')
        })
    }

    it('names no Quantity on hand built-in among the inventory fields', () => {
        expect(INVENTORY_BUILTINS as readonly string[]).not.toContain('quantity_on_hand')
        const product = hosts.find(h => h.key === 'books:product')
        expect(product?.builtin.map(b => b.key)).not.toContain('quantity_on_hand')
    })

    it("names an Inventory item's expense account the cost of goods sold account", () => {
        const result = productDefinitionFor(defaultDefinitionFor(host), 'inventory', host, 'edit')
        expect(COGS_ACCOUNT_LABEL).toBe('Cost of goods sold account')
        expect(labelOf(result, 'expense_account')).toBe(COGS_ACCOUNT_LABEL)
    })

    it('keeps a label an admin gave the expense account', () => {
        const base = defaultDefinitionFor(host)
        const renamed = {
            ...base,
            fields: base.fields.map(f =>
                f.key === 'expense_account' ? { ...f, label: 'Purchase account' } : f
            ),
        }
        const result = productDefinitionFor(renamed, 'inventory', host, 'edit')
        expect(labelOf(result, 'expense_account')).toBe('Purchase account')
    })

    it('does not change the stored definition', () => {
        const stored = defaultDefinitionFor(host)
        productDefinitionFor(stored, 'inventory', host, 'new')
        expect(hiddenKeys(stored)).toEqual([])
        expect(labelOf(stored, 'expense_account')).toBe('Expense account')
    })

    it('hides the price, cost, accounts, Taxable and purchase fields of a bundle and requires nothing new', () => {
        const result = productDefinitionFor(defaultDefinitionFor(host), 'bundle', host, 'edit')
        expect(hiddenKeys(result)).toEqual([...BUNDLE_HIDDEN].sort())
        expect(requiredKeys(result)).toEqual(['name', 'type'])
    })

    for (const type of PRODUCT_TYPE_KEYS) {
        it(`keeps a field an admin hid (vendor_part_no) hidden for ${type}`, () => {
            const result = productDefinitionFor(withSkuHidden(), type, host, 'edit')
            expect(hiddenKeys(result)).toContain('vendor_part_no')
        })

        it(`never hides type or name for ${type}`, () => {
            const result = productDefinitionFor(withSkuHidden(), type, host, 'new')
            expect(hiddenKeys(result)).not.toContain('type')
            expect(hiddenKeys(result)).not.toContain('name')
        })
    }
})

describe('productHostFor', () => {
    const componentOf = (h: typeof host, key: string) => {
        const field = h.builtin.find(b => b.key === key)
        return field?.kind === 'custom' ? field.component : undefined
    }

    it('names the cost of goods sold select for the expense account of an Inventory item', () => {
        const result = productHostFor(host, 'inventory')
        expect(componentOf(result, 'expense_account')).toBe('CogsAccountField')
        expect(componentOf(host, 'expense_account')).not.toBe('CogsAccountField')
        const others = (h: typeof host) => h.builtin.filter(b => b.key !== 'expense_account')
        expect(others(result)).toEqual(others(host))
    })

    for (const type of PRODUCT_TYPE_KEYS.filter(key => key !== 'inventory')) {
        it(`gives the host itself for ${type}`, () => {
            expect(productHostFor(host, type)).toBe(host)
        })
    }
})
