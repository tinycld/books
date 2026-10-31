// `forms/hosts.ts` imports BUNDLE_ITEM_COLUMNS and the generator loads hosts.ts in
// Node, so this file has type imports only: a runtime import would pull React Native
// code into the generator.
import type { HostTableColumn } from '@tinycld/core/lib/forms/definition'
import type { TableRowMapper } from '@tinycld/core/lib/forms/table-rows'
import type { BooksBundleItems } from '../types'

// The bundle items table: a product picker cell and a quantity, as the server bounds it.
export const BUNDLE_ITEM_COLUMNS: readonly HostTableColumn[] = [
    {
        key: 'product',
        label: 'Product or service',
        kind: 'text',
        required: true,
        hidden: false,
        component: 'BundleProductCell',
    },
    {
        key: 'quantity',
        label: 'Qty',
        kind: 'number',
        required: true,
        hidden: false,
        min: 0.01,
        max: 1000000,
    },
]

export type BundleItemRow = Pick<BooksBundleItems, 'id' | 'product' | 'quantity' | 'position'>

export type BundleItemValues = { product: string; quantity: number; position: number }

// A blank cell is null in the form (core `newTableRow`), so a row is written with an
// empty product or a zero quantity, which the server refuses with its own message.
export const BUNDLE_ITEM_MAPPER: TableRowMapper<BundleItemRow, BundleItemValues> = {
    toRow: item => ({ product: item.product, quantity: item.quantity }),
    positionOf: item => item.position,
    toRecord: (row, position) => ({
        product: typeof row.product === 'string' ? row.product : '',
        quantity: typeof row.quantity === 'number' ? row.quantity : 0,
        position,
    }),
}
