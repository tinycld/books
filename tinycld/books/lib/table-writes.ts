import type { TableColumn } from '@tinycld/core/lib/forms/definition'
import {
    planTableWrites,
    type TableRowWrite,
    type TableWritePlan,
} from '@tinycld/core/lib/forms/table-rows'
import type { TableRow } from '@tinycld/core/lib/forms/values'

export type TableWriteOps<T> = {
    insert(write: TableRowWrite): T
    update(write: TableRowWrite): T
    remove(id: string): T
}

export type TableWriteStep<T> = { itemNumber: number | null; run: () => T }

const byPosition = (a: TableRowWrite, b: TableRowWrite) => a.position - b.position

/**
 * A `TableWritePlan` as ordered pbtsdb writes. Removes come first, so a later insert
 * never meets a row the plan drops; then updates and inserts by position. A step's
 * `itemNumber` is its row's place in the table from 1; a removed row has none.
 */
export function tableWriteSteps<T>(
    plan: TableWritePlan | undefined,
    ops: TableWriteOps<T>
): TableWriteStep<T>[] {
    if (!plan) return []
    const removes = plan.remove.map(id => ({ itemNumber: null, run: () => ops.remove(id) }))
    const updates = [...plan.update].sort(byPosition).map(write => ({
        itemNumber: write.position + 1,
        run: () => ops.update(write),
    }))
    const inserts = [...plan.insert].sort(byPosition).map(write => ({
        itemNumber: write.position + 1,
        run: () => ops.insert(write),
    }))
    return [...removes, ...updates, ...inserts]
}

// A new record has no stored rows, so every row the form holds is an insert.
export function createTablePlans(
    tables: Record<string, TableRow[]>,
    columnsByKey: Readonly<Record<string, readonly TableColumn[]>>
): Record<string, TableWritePlan> {
    const plans: Record<string, TableWritePlan> = {}
    for (const [key, columns] of Object.entries(columnsByKey)) {
        const rows = tables[key]
        if (rows) plans[key] = planTableWrites([], rows, columns)
    }
    return plans
}
