import { ADJUSTMENTS_PATH } from './adjustment-route'
import { PRODUCTS_PATH } from './product-route'

// The tab strip of Products and services (inventory-adjust spec §2, Q2): the products list,
// the inventory adjustments list and the bin list, each at its own route. The strip
// (components/products/InventoryTabStrip.tsx) replaces the route on a press.

export type InventoryTabKey = 'products' | 'adjustments' | 'bins'

export type InventoryTab = { key: InventoryTabKey; label: string; path: string }

export const INVENTORY_TABS: readonly InventoryTab[] = [
    { key: 'products', label: 'Products and services', path: PRODUCTS_PATH },
    { key: 'adjustments', label: 'Inventory adjustments', path: ADJUSTMENTS_PATH },
    { key: 'bins', label: 'Bin locations', path: 'books/bins' },
]

// The tabs the strip shows: Bin locations joins with its list (checkpoint 7).
const SHOWN_KEYS: ReadonlySet<InventoryTabKey> = new Set(['products', 'adjustments'])

export const SHOWN_INVENTORY_TABS: readonly InventoryTab[] = INVENTORY_TABS.filter(tab =>
    SHOWN_KEYS.has(tab.key)
)

// The path of a tab's list; undefined for a key the strip does not know.
export function inventoryTabPath(key: string): string | undefined {
    return INVENTORY_TABS.find(tab => tab.key === key)?.path
}
