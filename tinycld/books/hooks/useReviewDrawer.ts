import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { type RefObject, useRef } from 'react'
import { nextTxnId } from '../lib/bank-categorize'
import { drawerAction, type MoveKind, writeControlState } from '../lib/bank-review'
import { useBankingUIStore } from '../stores/banking-ui-store'
import { type BankTxnDetail, useBankTxnDetail } from './useBankTxnDetail'
import type { ReviewBatch } from './useReviewBatch'

export type ReviewDrawerModel = {
    detail: BankTxnDetail | null
    isLoading: boolean
    isError: boolean
    onRetry: () => void
    onClose: () => void
    action: { kind: MoveKind; label: string; busyLabel: string; testID: string } | null
    onAction: () => void
    // The running change is this transaction's own; another row's run only disables it.
    isActionPending: boolean
    isActionDisabled: boolean
    actionHint: string | undefined
    isWide: boolean
    isTablet: boolean
    // The wrapper node of the drawer's shown Categorize or Transfer form, on web (the
    // section registers it through a ref; null on native and while no form shows). Esc
    // asks it whether the focus is in a field of the form (lib leaveWayField).
    wayFormNode: RefObject<HTMLElement | null>
}

type ReviewDrawerInput = {
    // The selected account's label, for the Account field; the drawer closes on an
    // account change, so the open transaction is always of this account.
    accountLabel: string
    canWrite: boolean
    batch: ReviewBatch
    // The For review tab's shown row ids, in list order (ReviewTabBody sets them), for the
    // row the drawer shows after an Exclude.
    shownRowIds: RefObject<readonly string[]>
}

// The model of the transaction drawer. The drawer sits beside the whole Banking page (as
// the register's EntryDrawer sits beside its screen), so the page builds it, over the
// page's one batch that the transaction tabs share.
export function useReviewDrawer({
    accountLabel,
    canWrite,
    batch,
    shownRowIds,
}: ReviewDrawerInput): ReviewDrawerModel {
    const breakpoint = useBreakpoint()
    const openTxnId = useBankingUIStore(s => s.openTxnId)
    const closeTxn = useBankingUIStore(s => s.closeTxn)
    const openNextTxn = useBankingUIStore(s => s.openNextTxn)
    // A Categorize or Record transfer is being sent (of this row or of one the drawer has
    // moved on from).
    const isAdding = useBankingUIStore(s => s.isAdding)
    const writes = useServerActionState()
    const wayFormNode = useRef<HTMLElement | null>(null)
    const txnDetail = useBankTxnDetail(openTxnId, accountLabel)
    const { detail } = txnDetail
    const onRetry = () => {
        void recoverLiveQueries({
            ...txnDetail.recovery,
            onError: err => log.error('books.banking', err),
        })
    }
    // The action follows the transaction's own status, so a row another user changed
    // shows the right action, or none once it is Reviewed.
    const action = detail ? drawerAction(detail.status, canWrite) : null
    const control = writeControlState({
        isPending: batch.isPending || isAdding,
        writesDisabled: writes.isDisabled,
        writesHint: writes.accessibilityHint,
    })
    // Busy only for a run of the action's own kind: while a match of this transaction is
    // sent, Exclude is disabled (the batch is pending) but does not read "Excluding…".
    const pending = batch.pending
    const isActionPending =
        openTxnId !== null &&
        action !== null &&
        pending !== null &&
        pending.kind === action.kind &&
        pending.ids.includes(openTxnId)
    // The row leaves the tab at once (optimistic), so the drawer moves first: after an
    // Exclude on For review it shows the next row of the list (read before the write, with
    // no focus asked, so E, E, E works down the list), after a restore on Excluded it
    // closes. A refusal rolls the row back into the list and the result line shows why.
    // The run never throws: its outcome is the result line.
    const onAction = () => {
        if (!detail || !action || control.isDisabled) return
        if (action.kind === 'exclude') openNextTxn(nextTxnId(shownRowIds.current, detail.id), false)
        else closeTxn()
        void batch.run({ kind: action.kind, ids: [detail.id], summary: '', origin: 'drawer' })
    }
    return {
        detail,
        isLoading: txnDetail.isLoading,
        isError: txnDetail.isError,
        onRetry,
        onClose: closeTxn,
        action,
        onAction,
        isActionPending,
        isActionDisabled: control.isDisabled,
        actionHint: control.hint,
        isWide: breakpoint !== 'mobile',
        isTablet: breakpoint === 'tablet',
        wayFormNode,
    }
}
