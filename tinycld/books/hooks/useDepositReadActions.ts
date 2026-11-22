import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { formatHint } from '@tinycld/core/lib/shortcuts'
import { useServerActionState, useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { router } from 'expo-router'
import { type DepositReadAction, depositReadActions } from '../lib/deposit-read-actions'
import { DEPOSIT_READ_DESCRIPTIONS, DEPOSIT_READ_KEYS } from '../lib/deposit-shortcuts'
import { DEPOSIT_MESSAGES } from '../lib/deposit-texts'
import type { BooksDeposits } from '../types'
import type { DocumentReadItem } from './useDocumentReadActions'
import { useOpenFromReadView } from './useOpenFromReadView'
import { useVoidDialogState } from './useVoidPayment'

export type DepositReadRecord = Pick<BooksDeposits, 'id' | 'status' | 'number' | 'entry'>

/**
 * The deposit read view's actions as rows of the shared DocumentReadActions (bank deposit
 * spec §3.8), and its Void dialog. A writer on a posted deposit gets Edit (E), Void (V)
 * and View journal entry (J); a writer on a void deposit and a reader get View journal
 * entry only. Edit replaces the read view with the correction form
 * (`books/deposits/new?replaces=<id>`, useOpenFromReadView). Void writes
 * `status: 'void'` on the deposit (the server posts the reversing entry and releases the
 * items); a deposit has no list kind, so the write is its own and not useVoidPayment's.
 * Void waits for the server and for writes to be available; Edit and View journal entry
 * only open a screen, so they wait for a running void. The dialog's open state lives
 * here, on the read view, which stays mounted while the optimistic void changes the
 * deposit under it, so a refusal stays in the dialog.
 */
export function useDepositReadActions(deposit: DepositReadRecord, canWrite: boolean) {
    const orgHref = useOrgHref()
    const openFromReadView = useOpenFromReadView(deposit.id)
    const [depositsCollection] = useStore('books_deposits')
    const voidDialogState = useVoidDialogState(id =>
        depositsCollection.update(id, draft => {
            draft.status = 'void'
        })
    )
    const isVoiding = voidDialogState.isPending
    const voidState = useServerActionState({ isDisabled: isVoiding })
    const writesAvailable = useWritesAvailable().available
    const offered = depositReadActions(deposit.status, canWrite, deposit.entry !== '', true)
    const run: Record<DepositReadAction, () => void> = {
        edit: () => openFromReadView(`books/deposits/new?replaces=${deposit.id}`),
        void: voidDialogState.open,
        entry: () => router.push(orgHref(`books/entries/${deposit.entry}`)),
    }
    const disabledOf = (action: DepositReadAction) =>
        action === 'void' ? voidState.isDisabled : isVoiding
    const items: DocumentReadItem[] = offered.map(action => ({
        action,
        id: `read-${action}`,
        label: DEPOSIT_READ_DESCRIPTIONS[action],
        keys: formatHint(DEPOSIT_READ_KEYS[action]).text,
        isDisabled: disabledOf(action),
        isDestructive: action === 'void',
        onSelect: run[action],
    }))
    // The dialog closes when Void stops being offered (the deposit was voided or replaced
    // elsewhere while it was open), unless this dialog's own void runs.
    const isVoidOffered = offered.includes('void')
    const voidDialog = {
        isVisible: voidDialogState.isOpen && (isVoidOffered || isVoiding),
        entryNumber: `deposit ${deposit.number}`,
        confirmLabel: 'Void deposit',
        body: DEPOSIT_MESSAGES.voidBody,
        isPending: isVoiding,
        isConfirmDisabled: !writesAvailable,
        errorMessage: voidDialogState.errorMessage,
        onConfirm: () => voidDialogState.confirm(deposit.id),
        onCancel: voidDialogState.close,
    }
    return { items, voidDialog }
}
