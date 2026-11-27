import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { writeRefusalText } from '../lib/refusal'

const LOG_CONTEXT = 'books.purchase-order-status'
const REFUSAL_TOAST_MS = 5000

// The order a Close is for: its id and the revision the screen showed (the read view's
// record, the list's row), never a value read from the store at the Close.
export interface OrderToClose {
    id: string
    revision: number
}

/**
 * Close and Reopen of a purchase order (purchase order spec §3.6), one `useMutation` update
 * each. Close writes `status: 'closed'` and the revision the user saw plus one: an open
 * order is one a person edits, so the server refuses a write to it that states no revision
 * or another one (`checkRequestRevision`, `settleRevision` in server/revision.go), as the
 * other kinds' post does (`postRecord`). Reopen writes `status: 'open'` only: a closed order
 * is not edited and its Reopen changes no revision (`orderReopenFields`). The server stamps
 * the rest (`transitionOrder` in server/purchase_orders.go: `closed_reason` manual,
 * `closed_at`, `closed_by` and header `open_amount` 0 at Close, cleared at Reopen) and
 * refuses a non-admin, a Close of an order changed since the user saw it, and a Reopen of an
 * order that closed as received. A refusal reverts the optimistic write and shows its words
 * in a toast. `onClosed` runs when a Close ends, taken or refused (the Close dialog closes;
 * the toast names a refusal).
 */
export function usePurchaseOrderStatus(onClosed: () => void = () => {}) {
    const [ordersCollection] = useStore('books_purchase_orders')
    // A supplied onError replaces core's default report, so the failure is logged here.
    const onError = (error: unknown) => {
        log.warn(LOG_CONTEXT, writeRefusalText(error))
        useToastStore.getState().addToast({
            title: writeRefusalText(error),
            variant: 'error',
            duration: REFUSAL_TOAST_MS,
        })
    }
    const close = useMutation({
        mutationFn: function* (order: OrderToClose) {
            yield ordersCollection.update(order.id, draft => {
                draft.status = 'closed'
                draft.revision = order.revision + 1
            })
        },
        onSettled: onClosed,
        onError,
    })
    const reopen = useMutation({
        mutationFn: function* (id: string) {
            yield ordersCollection.update(id, draft => {
                draft.status = 'open'
            })
        },
        onError,
    })
    return {
        close: (order: OrderToClose) => close.mutate(order),
        reopen: (id: string) => reopen.mutate(id),
        isClosing: close.isPending,
        isReopening: reopen.isPending,
    }
}
