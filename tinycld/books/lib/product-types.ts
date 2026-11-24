import type { BooksProducts } from '../types'
import { BUNDLE_KEEPS_TYPE, INVENTORY_KEEPS_TYPE } from './product-messages'

// The migration's type select values (2100000005); tests/product-types.test.ts
// fails if the two drift.
export type ProductType = BooksProducts['type']

// Each product type with its label (lists, the type field), its noun in
// running text, and the chooser's sentence, in the chooser's order.
export const PRODUCT_TYPES = [
    {
        key: 'service',
        label: 'Service',
        noun: 'service',
        sentence: 'Work you do for customers, such as consulting, repairs or lessons.',
    },
    {
        key: 'non_inventory',
        label: 'Non-inventory',
        noun: 'non-inventory item',
        sentence:
            'Goods you buy or sell without counting how many you have, such as parts used on a job.',
    },
    {
        key: 'inventory',
        label: 'Inventory',
        noun: 'inventory item',
        sentence:
            'Goods you buy and sell and count: Books tracks how many you have and what they cost.',
    },
    {
        key: 'bundle',
        label: 'Bundle',
        noun: 'bundle',
        sentence: 'Products and services you sell together as one line, such as a starter kit.',
    },
] as const satisfies readonly { key: ProductType; label: string; noun: string; sentence: string }[]

export const PRODUCT_TYPE_KEYS = ['service', 'non_inventory', 'inventory', 'bundle'] as const

const KEYS: ReadonlySet<unknown> = new Set(PRODUCT_TYPE_KEYS)

export function isProductType(value: unknown): value is ProductType {
    return KEYS.has(value)
}

// An unknown type has no label, so a row from a newer schema shows a blank cell.
export function productTypeLabel(type: string): string {
    return PRODUCT_TYPES.find(entry => entry.key === type)?.label ?? ''
}

export function productTypeNoun(type: ProductType): string {
    return PRODUCT_TYPES.find(entry => entry.key === type)?.noun ?? ''
}

// A product never becomes a bundle or an Inventory item after it is created (the
// server refuses it), so the type field offers only Service and Non-inventory.
const FIXED_TYPES: ReadonlySet<ProductType> = new Set<ProductType>(['bundle', 'inventory'])

export const PRODUCT_TYPE_SELECT_OPTIONS: { value: string; label: string }[] = PRODUCT_TYPES.filter(
    entry => !FIXED_TYPES.has(entry.key)
).map(entry => ({ value: entry.key, label: entry.label }))

// What the type field shows in place of the select for a type that never changes.
export interface FixedProductType {
    label: string
    note: string
}

const FIXED_TYPE_NOTES: Partial<Record<ProductType, string>> = {
    bundle: BUNDLE_KEEPS_TYPE,
    inventory: INVENTORY_KEEPS_TYPE,
}

/** The fixed type of a form value: its label and note, or null for a type the select offers. */
export function fixedProductType(value: unknown): FixedProductType | null {
    if (!isProductType(value) || !FIXED_TYPES.has(value)) return null
    return { label: productTypeLabel(value), note: FIXED_TYPE_NOTES[value] ?? '' }
}
