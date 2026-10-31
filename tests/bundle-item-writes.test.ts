import type { TableWritePlan } from '@tinycld/core/lib/forms/table-rows'
import { describe, expect, it } from 'vitest'
import { bundleItemWrites } from '../tinycld/books/lib/bundle-item-writes'

// The fields of a write as text with sorted keys, so a test compares exact values and
// exact keys without depending on the order the mapper spreads them in.
function fields(values: Record<string, unknown>) {
    const sorted = Object.keys(values)
        .sort()
        .map(key => [key, values[key]])
    return JSON.stringify(Object.fromEntries(sorted))
}

// Ops that name each write instead of making it, so a test reads what was written and in
// which order.
const NAMING_OPS = {
    insert: (row: Record<string, unknown>) => `insert ${fields(row)}`,
    update: (id: string, values: Record<string, unknown>) => `update:${id} ${fields(values)}`,
    remove: (id: string) => `remove:${id}`,
}

const PLAN: TableWritePlan = {
    insert: [
        { row: { id: 'n2', product: 'p4', quantity: 1 }, position: 2 },
        { row: { id: 'n1', product: 'p3', quantity: 2 }, position: 1 },
    ],
    update: [{ row: { id: 'u1', product: 'p2', quantity: 3 }, position: 0 }],
    remove: ['r1'],
}

describe('bundleItemWrites', () => {
    it('labels each write by its item number and runs remove, update, then inserts by position', () => {
        const writes = bundleItemWrites('b1', PLAN, NAMING_OPS)

        expect(writes.map(write => write.label)).toEqual([null, 'Item 1', 'Item 2', 'Item 3'])
        expect(writes.map(write => write.run())).toEqual([
            'remove:r1',
            `update:u1 ${fields({ product: 'p2', quantity: 3, position: 0 })}`,
            `insert ${fields({ id: 'n1', bundle: 'b1', product: 'p3', quantity: 2, position: 1 })}`,
            `insert ${fields({ id: 'n2', bundle: 'b1', product: 'p4', quantity: 1, position: 2 })}`,
        ])
    })

    it('has no write for a bundle with no plan', () => {
        expect(bundleItemWrites('b1', undefined, NAMING_OPS)).toEqual([])
    })
})
