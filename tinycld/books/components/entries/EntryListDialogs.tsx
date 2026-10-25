import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { useEntryDialogs } from '../../hooks/useEntryDialogs'
import { entryNumberText } from '../../lib/entry-display'
import { defaultReverseDate } from '../../lib/entry-schema'
import { todayIso } from '../../lib/register-range'
import { type EntryDialogTarget, useEntriesUiStore } from '../../stores/entries-ui-store'
import { DeleteDraftDialog } from './DeleteDraftDialog'
import { ReverseDialog } from './ReverseDialog'
import { VoidDialog } from './VoidDialog'

// Mounted only while a dialog is open, above the rows: the list may drop or rewrite the row
// on an optimistic write, but this host stays, so a refusal stays visible in its dialog.
function OpenDialogs({ target }: { target: EntryDialogTarget }) {
    const { kind, entryId } = target
    const closeStoreDialog = useEntriesUiStore(s => s.closeDialog)
    const closeDialog = () => closeStoreDialog(target)
    const [entriesCollection] = useStore('books_journal_entries')
    const { record: entry } = useRecord(entriesCollection, entryId)
    // Pushed, so the list stays under the reversal.
    const dialogs = useEntryDialogs(entryId, { navigation: 'push', onClose: closeDialog })
    const number = entry ? entryNumberText(entry) : ''
    const reverseDate = entry ? defaultReverseDate(entry.date, todayIso()) : ''
    return (
        <>
            <ReverseDialog
                isVisible={kind === 'reverse' && entry !== undefined}
                entryNumber={number}
                entryDate={entry?.date ?? ''}
                defaultDate={reverseDate}
                isPending={dialogs.isReversing}
                onConfirm={dialogs.confirmReverse}
                onCancel={closeDialog}
            />
            <VoidDialog
                isVisible={kind === 'void' && entry !== undefined}
                entryNumber={number}
                isPending={dialogs.isVoiding}
                errorMessage={dialogs.voidError}
                onConfirm={dialogs.confirmVoid}
                onCancel={closeDialog}
            />
            <DeleteDraftDialog
                isVisible={kind === 'delete' && entry !== undefined}
                isPending={dialogs.isDeleting}
                errorMessage={dialogs.deleteError}
                onConfirm={dialogs.confirmDelete}
                onCancel={closeDialog}
            />
        </>
    )
}

export function EntryListDialogs() {
    const target = useEntriesUiStore(s => s.dialog)
    const closeDialog = useEntriesUiStore(s => s.closeDialog)
    // The dialog state lives in a module store, and a pushed route keeps the list mounted, so
    // clear it when the list loses focus or unmounts.
    useFocusEffect(useCallback(() => () => closeDialog(), [closeDialog]))
    if (!target) return null
    return <OpenDialogs key={`${target.kind}-${target.entryId}`} target={target} />
}
