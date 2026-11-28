// The chips over the item page's movements (inventory-adjust spec §3.6 "Stock tab"):
// All, Receipts, Sales, Returns, Adjustments. Plain data with type imports only.

import type { BooksStockMoves } from '../types'

export type StockMoveKind = Exclude<BooksStockMoves['kind'], ''>

export type MoveChip = 'all' | 'receipts' | 'sales' | 'returns' | 'adjustments'

export const MOVE_CHIPS: readonly { id: MoveChip; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'receipts', label: 'Receipts' },
    { id: 'sales', label: 'Sales' },
    { id: 'returns', label: 'Returns' },
    { id: 'adjustments', label: 'Adjustments' },
]

const CHIP_KINDS: Record<Exclude<MoveChip, 'all'>, readonly StockMoveKind[]> = {
    receipts: ['receipt'],
    sales: ['sale'],
    returns: ['customer_return', 'vendor_return'],
    adjustments: ['adjustment', 'opening'],
}

// The kinds a chip keeps, for the query's `where`; null for All (no filter).
export function moveKindsOf(chip: MoveChip): readonly StockMoveKind[] | null {
    if (chip === 'all') return null
    return CHIP_KINDS[chip]
}
