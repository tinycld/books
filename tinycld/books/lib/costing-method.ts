// The company costing method (Settings → Accounting → Inventory, the setup wizard's
// Accounting step; books_settings.costing_method): how Books prices the stock a sale
// takes out. Plain data with type imports only.

import type { BooksSettings } from '../types'

// The select's two values. The generated row type also holds '' (a select field with no
// value), which the migration never stores: it sets every book to FIFO.
export type CostingMethod = Exclude<BooksSettings['costing_method'], ''>

export const COSTING_METHOD_KEYS = ['fifo', 'average'] as const satisfies readonly CostingMethod[]

export const COSTING_METHOD_LABELS: Record<CostingMethod, string> = {
    fifo: 'FIFO (first in, first out)',
    average: 'Average cost',
}

export const COSTING_METHOD_OPTIONS: { value: CostingMethod; label: string }[] =
    COSTING_METHOD_KEYS.map(value => ({ value, label: COSTING_METHOD_LABELS[value] }))

/** The book's method; a row with none reads as FIFO, the server's default. */
export function costingMethodOf(settings: Pick<BooksSettings, 'costing_method'>): CostingMethod {
    return settings.costing_method === 'average' ? 'average' : 'fifo'
}

export const COSTING_METHOD_NOTE =
    'How Books prices the inventory you sell. FIFO takes the cost of the oldest stock first; average cost takes the average cost of the stock on hand. You can change the method until the first inventory transaction posts.'

// The server's refusal of a change (server/settings.go, msgCostingMethodLocked);
// tests/costing-method.test.ts fails if the two drift.
export const COSTING_METHOD_LOCKED =
    'The costing method cannot change after the first inventory transaction posts.'

// What the setting draws: a select with Save, the method with the locked note, or the
// method alone (the books_settings update rule is admin-only).
export type CostingMethodView = 'edit' | 'locked' | 'read'

export function costingMethodView(
    settings: Pick<BooksSettings, 'costing_locked'>,
    isAdmin: boolean
): CostingMethodView {
    if (settings.costing_locked) return 'locked'
    return isAdmin ? 'edit' : 'read'
}
