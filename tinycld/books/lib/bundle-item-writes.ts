import type { TableWritePlan } from '@tinycld/core/lib/forms/table-rows'
import { BUNDLE_ITEM_MAPPER, type BundleItemValues } from './bundle-items'
import { tableWriteSteps } from './table-writes'

export type BundleItemOps<T> = {
    insert(row: BundleItemValues & { id: string; bundle: string }): T
    update(id: string, values: BundleItemValues): T
    remove(id: string): T
}

/**
 * A bundle's row plan as ordered writes: removes, then updates, then inserts, each in
 * row order. A write's label names its row for a refusal ("Item 2"); a remove has none.
 */
export function bundleItemWrites<T>(
    bundleId: string,
    plan: TableWritePlan | undefined,
    ops: BundleItemOps<T>
): { label: string | null; run: () => T }[] {
    const steps = tableWriteSteps(plan, {
        insert: write =>
            ops.insert({
                id: write.row.id,
                bundle: bundleId,
                ...BUNDLE_ITEM_MAPPER.toRecord(write.row, write.position),
            }),
        update: write =>
            ops.update(write.row.id, BUNDLE_ITEM_MAPPER.toRecord(write.row, write.position)),
        remove: id => ops.remove(id),
    })
    return steps.map(step => ({
        label: step.itemNumber === null ? null : `Item ${step.itemNumber}`,
        run: step.run,
    }))
}
