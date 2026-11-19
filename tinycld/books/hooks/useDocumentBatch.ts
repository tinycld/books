import { performMutations, useMutation } from '@tinycld/core/lib/mutations'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import {
    type BatchAction,
    batchDialogCopy,
    batchResultText,
    batchTargets,
} from '../lib/document-batch'
import type { DocumentListRow } from '../lib/document-list'
import { writeRefusalText } from '../lib/refusal'
import { type BatchCounts, useDocumentListStore } from '../stores/document-list-store'
import { useDeleteDraftDocument } from './useDeleteDraftDocument'
import type { useListSelection } from './useListSelection'
import { useVoidDocument } from './useVoidDocument'

type BatchRun = { action: BatchAction; applies: DocumentListRow[]; kept: string[] }

interface DocumentBatchInput {
    // The mounted list that opens the dialog: its dialog shows only on that list.
    listKey: string
    rows: readonly DocumentListRow[]
    selection: ReturnType<typeof useListSelection>
}

/**
 * The Batch actions of a Sales list (spec §3 "Batch actions"): Delete drafts and Void
 * over the ticked loaded rows. `open` shows the confirm dialog with the counts of what the
 * action applies to and what it skips, kept current while the dialog is open (a row that
 * changes or leaves the list elsewhere changes them). `confirm` writes the documents one
 * at a time with the write the read view and the forms share, collects what was done and
 * what the server refused, then keeps the refused and the skipped documents ticked and
 * shows the result in the list's banner.
 */
export function useDocumentBatch({ listKey, rows, selection }: DocumentBatchInput) {
    const writes = useWritesAvailable()
    const setBanner = useDocumentListStore(state => state.setBanner)
    const stored = useDocumentListStore(state => state.batchDialog)
    const setOpen = useDocumentListStore(state => state.setBatchDialog)
    const voidWrite = useVoidDocument()
    const deleteWrite = useDeleteDraftDocument()
    const open = stored?.listKey === listKey ? stored : null
    const ticked = rows.filter(row => selection.isTicked(row.id))

    const writeOf = (action: BatchAction, row: DocumentListRow) =>
        action === 'void' ? voidWrite(row.kind, row.id) : deleteWrite(row.kind, row.id)
    const run = useMutation({
        mutationFn: async ({ action, applies }: BatchRun) => {
            let done = 0
            const failed: string[] = []
            const failedIds: string[] = []
            for (const row of applies) {
                try {
                    await performMutations(function* () {
                        yield writeOf(action, row)
                    })
                    done += 1
                } catch (error) {
                    failed.push(writeRefusalText(error))
                    failedIds.push(row.id)
                }
            }
            return { done, failed, failedIds }
        },
        onSuccess: (result, input) => {
            selection.keep([...result.failedIds, ...input.kept])
            setBanner(batchResultText(result.done, result.failed))
            setOpen(null)
        },
        // Each write's refusal is caught above; this is a failure outside them.
        onError: error => {
            setBanner(writeRefusalText(error))
            setOpen(null)
        },
    })

    const live = open === null ? null : batchTargets(open.action, ticked)
    const counts: BatchCounts | null =
        open === null || live === null
            ? null
            : (open.running ?? { applies: live.applies.length, skipped: live.skipped })
    const dialog = open === null || counts === null ? null : { action: open.action, ...counts }
    const copy =
        dialog === null ? null : batchDialogCopy(dialog.action, dialog.applies, dialog.skipped)

    const confirm = () => {
        if (open === null || live === null || run.isPending) return
        const applying = new Set(live.applies.map(row => row.id))
        const kept = ticked.filter(row => !applying.has(row.id)).map(row => row.id)
        setOpen({ ...open, running: { applies: live.applies.length, skipped: live.skipped } })
        run.mutate({ action: open.action, applies: live.applies, kept })
    }
    return {
        dialog,
        copy,
        open: (action: BatchAction) => {
            run.reset()
            setBanner(null)
            setOpen({ listKey, action, running: null })
        },
        close: () => {
            if (!run.isPending) setOpen(null)
        },
        confirm,
        isRunning: run.isPending,
        // Delete drafts and Void start writes: they wait for writes and for a running batch.
        canStart: writes.available && !run.isPending,
    }
}

export type DocumentBatch = ReturnType<typeof useDocumentBatch>
