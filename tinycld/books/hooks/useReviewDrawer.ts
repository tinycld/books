import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { type BatchKind, drawerAction, writeControlState } from '../lib/bank-review'
import { useBankingUIStore } from '../stores/banking-ui-store'
import { type BankTxnDetail, useBankTxnDetail } from './useBankTxnDetail'
import type { ReviewBatch } from './useReviewBatch'

export type ReviewDrawerModel = {
    detail: BankTxnDetail | null
    isLoading: boolean
    isError: boolean
    onRetry: () => void
    onClose: () => void
    action: { kind: BatchKind; label: string; busyLabel: string; testID: string } | null
    onAction: () => void
    // The running change is this transaction's own; another row's run only disables it.
    isActionPending: boolean
    isActionDisabled: boolean
    actionHint: string | undefined
    isWide: boolean
    isTablet: boolean
}

type ReviewDrawerInput = {
    // The selected account's label, for the Account field; the drawer closes on an
    // account change, so the open transaction is always of this account.
    accountLabel: string
    canWrite: boolean
    batch: ReviewBatch
}

// The model of the transaction drawer. The drawer sits beside the whole Banking page (as
// the register's EntryDrawer sits beside its screen), so the page builds it, over the
// page's one batch that the transaction tabs share.
export function useReviewDrawer({
    accountLabel,
    canWrite,
    batch,
}: ReviewDrawerInput): ReviewDrawerModel {
    const breakpoint = useBreakpoint()
    const openTxnId = useBankingUIStore(s => s.openTxnId)
    const closeTxn = useBankingUIStore(s => s.closeTxn)
    const writes = useServerActionState()
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
        isPending: batch.isPending,
        writesDisabled: writes.isDisabled,
        writesHint: writes.accessibilityHint,
    })
    const isActionPending = openTxnId !== null && (batch.pending?.ids.includes(openTxnId) ?? false)
    // The row leaves the tab at once (optimistic), so the drawer closes first; a refusal
    // rolls the row back into the list and the result line shows why. The run never
    // throws: its outcome is the result line.
    const onAction = () => {
        if (!detail || !action || control.isDisabled) return
        closeTxn()
        void batch.run({ kind: action.kind, ids: [detail.id], summary: '' })
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
    }
}
