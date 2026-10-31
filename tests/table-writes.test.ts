import { columnSchema } from '@tinycld/core/lib/forms/definition'
import type { TableRowWrite, TableWritePlan } from '@tinycld/core/lib/forms/table-rows'
import { describe, expect, it, vi } from 'vitest'
import { createTablePlans, tableWriteSteps } from '../tinycld/books/lib/table-writes'

const COLUMNS = columnSchema.array().parse([
    { key: 'label', label: 'Label', kind: 'text', required: true },
    { key: 'qty', label: 'Qty', kind: 'number', required: true, min: 1 },
])

const row = (id: string, label: string, qty: number) => ({ id, label, qty })

// Ops that name each write instead of making it, so a test reads the order of the writes.
function namingOps() {
    return {
        insert: vi.fn((w: TableRowWrite) => `insert:${w.row.id}@${w.position}`),
        update: vi.fn((w: TableRowWrite) => `update:${w.row.id}@${w.position}`),
        remove: vi.fn((id: string) => `remove:${id}`),
    }
}

const PLAN: TableWritePlan = {
    insert: [
        { row: row('i3', 'Washer', 4), position: 3 },
        { row: row('i1', 'Pin', 1), position: 1 },
    ],
    update: [
        { row: row('u2', 'Nut', 5), position: 2 },
        { row: row('u0', 'Bolt', 2), position: 0 },
    ],
    remove: ['r1', 'r2'],
}

describe('tableWriteSteps', () => {
    it('runs the removes in plan order, then the updates and the inserts by position', () => {
        const steps = tableWriteSteps(PLAN, namingOps())

        expect(steps.map(step => step.run())).toEqual([
            'remove:r1',
            'remove:r2',
            'update:u0@0',
            'update:u2@2',
            'insert:i1@1',
            'insert:i3@3',
        ])
    })

    it('numbers each update and insert by its position from 1, and no remove', () => {
        const steps = tableWriteSteps(PLAN, namingOps())

        expect(steps.map(step => step.itemNumber)).toEqual([null, null, 1, 3, 2, 4])
    })

    it('makes no write until a step runs', () => {
        const ops = namingOps()

        const steps = tableWriteSteps(PLAN, ops)

        expect(ops.insert).not.toHaveBeenCalled()
        expect(ops.update).not.toHaveBeenCalled()
        expect(ops.remove).not.toHaveBeenCalled()
        steps[2].run()
        expect(ops.update).toHaveBeenCalledTimes(1)
        expect(ops.insert).not.toHaveBeenCalled()
        expect(ops.remove).not.toHaveBeenCalled()
    })

    it('has no step for a table with no plan', () => {
        const ops = namingOps()

        expect(tableWriteSteps(undefined, ops)).toEqual([])
    })
})

describe('createTablePlans', () => {
    const a = row('a', 'Bolt', 2)
    const b = row('b', 'Nut', 5)

    it('plans every row of a new record as an insert at its index', () => {
        expect(createTablePlans({ parts: [a, b] }, { parts: COLUMNS })).toEqual({
            parts: {
                insert: [
                    { row: a, position: 0 },
                    { row: b, position: 1 },
                ],
                update: [],
                remove: [],
            },
        })
    })

    it('plans no write for an empty table, which a record may be saved with', () => {
        expect(createTablePlans({ parts: [] }, { parts: COLUMNS })).toEqual({
            parts: { insert: [], update: [], remove: [] },
        })
    })

    it('has no plan for a table whose rows the form did not give', () => {
        expect(createTablePlans({}, { parts: COLUMNS })).toEqual({})
    })

    it('has no plan for rows under a key that is not a host table', () => {
        expect(createTablePlans({ parts: [a], notes: [b] }, { parts: COLUMNS })).toEqual({
            parts: { insert: [{ row: a, position: 0 }], update: [], remove: [] },
        })
    })
})
