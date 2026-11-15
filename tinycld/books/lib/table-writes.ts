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

export type TableWriteStep<T> = { rowId: string; itemNumber: number | null; run: () => T }

const byPosition = (a: TableRowWrite, b: TableRowWrite) => a.position - b.position

/**
 * A `TableWritePlan` as ordered pbtsdb writes. Removes come first, so a later insert
 * never meets a row the plan drops; then updates and inserts by position. A step's
 * `itemNumber` is its row's place in the table from 1; a removed row has none. A step's
 * `rowId` is the id of its row, a removed row's too.
 */
export function tableWriteSteps<T>(
    plan: TableWritePlan | undefined,
    ops: TableWriteOps<T>
): TableWriteStep<T>[] {
    if (!plan) return []
    const removes = plan.remove.map(id => ({
        rowId: id,
        itemNumber: null,
        run: () => ops.remove(id),
    }))
    const updates = [...plan.update].sort(byPosition).map(write => ({
        rowId: write.row.id,
        itemNumber: write.position + 1,
        run: () => ops.update(write),
    }))
    const inserts = [...plan.insert].sort(byPosition).map(write => ({
        rowId: write.row.id,
        itemNumber: write.position + 1,
        run: () => ops.insert(write),
    }))
    return [...removes, ...updates, ...inserts]
}

export type TablesWriteStep<T> = TableWriteStep<T> & { table: string }

/**
 * The plans of several tables whose rows one collection stores, as ordered writes: the
 * removes of every table, then each table's updates and inserts (tableWriteSteps), the
 * tables in the order given. All the removes go first because the server counts the
 * collection's rows at each insert. Each step names its table.
 */
export function tablesWriteSteps<T>(
    tables: readonly { table: string; plan: TableWritePlan | undefined; ops: TableWriteOps<T> }[]
): TablesWriteStep<T>[] {
    const steps = tables.flatMap(({ table, plan, ops }) =>
        tableWriteSteps(plan, ops).map(step => ({ ...step, table }))
    )
    const isRemove = (step: TablesWriteStep<T>) => step.itemNumber === null
    return [...steps.filter(isRemove), ...steps.filter(step => !isRemove(step))]
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
