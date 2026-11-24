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

/** An item line of a bill, an expense or a vendor credit. */
export const PURCHASE_ITEM_TYPES: readonly ProductType[] = ['service', 'non_inventory', 'inventory']
