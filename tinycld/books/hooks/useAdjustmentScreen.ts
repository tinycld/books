import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { adjustmentScreenState } from '../lib/adjustment-screen-state'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { useAdjustmentRecord } from './useAdjustmentRecord'
import { useBooksAccess } from './useBooksAccess'
import { useHasBinsQuery } from './useHasBins'
import { useRecostSourceNumber } from './useRecostSourceNumber'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * Every read of the inventory adjustment screen (inventory-adjust spec §3.5, §3.13):
 * access, the adjustment at `id` with its lines, whether the book has a bin location
 * (the Bin column), and the number of a re-cost's source document (useRecostSourceNumber).
 * Returns which surface to show (adjustmentScreenState), `hasBins`, `sourceNumber`, and
 * one Retry over every failed read (merged recoveries). `id` is null at
 * `books/inventory-adjustments/new`.
 */
export function useAdjustmentScreen(id: string | null) {
    const access = useBooksAccess()
    const record = useAdjustmentRecord(id ?? '')
    const bins = useHasBinsQuery()
    const source = useRecostSourceNumber(record.adjustment)
    const accessRecovery: LiveRecovery = access.isError
        ? { queries: [access.collection], sources: [] }
        : NO_RECOVERY
    const recovery = mergeRecoveries([
        accessRecovery,
        record.recovery,
        bins.recovery,
        source.recovery,
    ])
    const state = adjustmentScreenState({
        isReady: access.isReady && record.isReady && bins.isReady && source.isReady,
        isError: access.isError || record.isError || bins.isError || source.isError,
        canWrite: access.canWrite,
        isNew: id === null,
        status: record.adjustment?.status ?? null,
        isHeld: false,
        replacesStatus: undefined,
        replacesReady: true,
        replacesError: false,
    })
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error('books.inventory-adjustment', err),
        })
    }
    return {
        state,
        record,
        hasBins: bins.hasBins === true,
        sourceNumber: source.number,
        canWrite: access.canWrite,
        retry,
    }
}
