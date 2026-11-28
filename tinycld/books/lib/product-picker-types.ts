import type { ProductType } from './product-types'

// The product types each product picker lists. An Inventory item is sold, bought and put
// in a bundle as a Non-inventory item is; the server moves its stock when the document
// posts. The server never stores a bundle on a line (the form writes the bundle's items),
// so a bundle that holds an Inventory item moves the stock of that item.

/** A bundle's items: never another bundle. */
export const BUNDLE_ITEM_TYPES: readonly ProductType[] = ['service', 'non_inventory', 'inventory']

/** An Item line of a sales document. */
export const SALE_ITEM_TYPES: readonly ProductType[] = [
    'service',
    'non_inventory',
    'inventory',
    'bundle',
]

// A Percent line has no quantity, so it cannot move stock: no Inventory item, and no
// bundle, which may hold one.
/** A Percent line of a sales document. */
export const SALE_PERCENT_TYPES: readonly ProductType[] = ['service', 'non_inventory']

/** A line of an inventory adjustment: only an Inventory item has stock to adjust. */
export const INVENTORY_ITEM_TYPES: readonly ProductType[] = ['inventory']

// What a product picker says: its menu title, the trigger with no value, and the search.
export type ProductPickerTexts = { title: string; placeholder: string; searchPlaceholder: string }

/** Every picker that lists products and services of more than one kind. */
export const PRODUCT_PICKER_TEXTS: ProductPickerTexts = {
    title: 'Product or service',
    placeholder: 'Choose a product or service',
    searchPlaceholder: 'Search products and services',
}

/** The picker of INVENTORY_ITEM_TYPES: it lists Inventory items only, and says so. */
export const INVENTORY_ITEM_PICKER_TEXTS: ProductPickerTexts = {
    title: 'Item',
    placeholder: 'Choose an item',
    searchPlaceholder: 'Search items',
}

/** An item line of a bill, an expense or a vendor credit. */
export const PURCHASE_ITEM_TYPES: readonly ProductType[] = ['service', 'non_inventory', 'inventory']
