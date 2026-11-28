import { useStore } from '@tinycld/core/lib/pocketbase'
import { useBinFormStore } from '../stores/bin-dialog-store'
import type { BinListRow } from './useBinsQuery'
import { useRecordActions } from './useRecordActions'

/**
 * Make inactive, Make active and Delete from the bin list (inventory-adjust spec §3.7):
 * one update of `inactive`, or one delete. The server refuses the delete of a bin that
 * anything names (checkBinDelete, server/bins.go); the refusal shows in the delete dialog.
 */
export function useBinActions() {
    const [binsCollection] = useStore('books_bins')
    return useRecordActions<BinListRow>({
        setInactive: (id, inactive) =>
            binsCollection.update(id, draft => {
                draft.inactive = inactive
            }),
        remove: id => binsCollection.delete(id),
        get: id => binsCollection.get(id),
        store: useBinFormStore,
        logContext: 'books.bins',
    })
}

export type BinActions = ReturnType<typeof useBinActions>
