import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useFocusEffect } from 'expo-router'
import { useCallback, useRef } from 'react'
import type { DocumentListRow } from '../lib/document-list'
import {
    batchResultLines,
    batchSendCopy,
    batchSendCounts,
    batchSendOffered,
    batchSentToast,
    isBatchSendable,
    SENT_TOAST_MS,
} from '../lib/document-send'
import { writeRefusalText } from '../lib/refusal'
import { isSendDocType } from '../lib/send-doc-types'
import { useDocumentListStore } from '../stores/document-list-store'
import { useDocumentSendStore } from '../stores/document-send-store'
import { useBooksAccess } from './useBooksAccess'
import { type DocumentSendAnswer, type DocumentSendItem, useDocumentSend } from './useDocumentSend'
import { useEmailStatus } from './useEmailStatus'
import type { useListSelection } from './useListSelection'

interface BatchSendInput {
    // The mounted list whose Batch actions menu opens the dialog: its dialog and its
    // banner show only on that list.
    listKey: string
    rows: readonly DocumentListRow[]
    selection: ReturnType<typeof useListSelection>
}

// The dialog and the result banner tell about this mounted list only: when the list loses
// the focus (as useDocumentListScreen's blur cleanup does for its own dialogs and banner)
// the banner goes, and so does the dialog unless its send runs (lesson 3).
function useBatchBlurCleanup(listKey: string, isPending: boolean) {
    const pendingRef = useRef(isPending)
    pendingRef.current = isPending
    useFocusEffect(
        useCallback(
            () => () => {
                const store = useDocumentSendStore.getState()
                store.setBatchFailed(listKey, null)
                if (store.batchSend?.listKey === listKey && !pendingRef.current) {
                    store.closeBatch()
                }
            },
            [listKey]
        )
    )
}

// The batch's items: each sendable ticked row to the document's own address (plan decision
// 7), with no subject and no message, so the server fills both for each document.
function sendItemsOf(rows: readonly DocumentListRow[]): DocumentSendItem[] {
    return rows.filter(isBatchSendable).flatMap(row => {
        if (!isSendDocType(row.kind)) return []
        return [{ kind: row.kind, id: row.id, to: row.email, cc: [] }]
    })
}

/**
 * The batch Send of a sales list (spec §3.3 "Batch"). `isOffered`: a writer with at least
 * one ticked row that is sent-able (batchSendOffered), for the Batch actions menu's Send
 * row. `open` shows the dialog (the send store's `batchSend`, by `listKey`) and clears the
 * list's banners; `counts` and `copy` are its texts over the ticked loaded rows, kept
 * current while it is open. `confirm` sends every sendable ticked row in ONE request
 * (useDocumentSend). Every document sent: the toast "9 documents sent", the dialog closes
 * and no row stays ticked (skipped rows too). Some failed: the dialog closes, the list's
 * batch banner (`banner`, the send store's `batchFailed`) reads the summary and one line
 * for each failed document, and only the failed rows stay ticked (plan decision 22). A
 * refused request shows in the dialog (`refusal`) and the dialog stays. Confirm waits for
 * writes to be available and for a running send; Close waits for a running send.
 */
export function useBatchSend({ listKey, rows, selection }: BatchSendInput) {
    const { canWrite } = useBooksAccess()
    const email = useEmailStatus()
    const writes = useWritesAvailable()
    const send = useDocumentSend()
    const stored = useDocumentSendStore(state => state.batchSend)
    const openBatch = useDocumentSendStore(state => state.openBatch)
    const closeBatch = useDocumentSendStore(state => state.closeBatch)
    const failure = useDocumentSendStore(state => state.batchFailed[listKey] ?? null)
    const setBatchFailed = useDocumentSendStore(state => state.setBatchFailed)
    const setBanner = useDocumentListStore(state => state.setBanner)

    const ticked = rows.filter(row => selection.isTicked(row.id))
    const counts = batchSendCounts(ticked)
    const copy = batchSendCopy(counts, email.canSend)
    const isPending = send.isPending
    useBatchBlurCleanup(listKey, isPending)
    // A user who lost write access while the dialog was open sees it close, unless its
    // request already runs.
    const isOpen = stored?.listKey === listKey && (canWrite || isPending)
    const refusal = send.isError ? writeRefusalText(send.error) : null

    const onAnswer = (answer: DocumentSendAnswer) => {
        closeBatch()
        if (answer.failed.length === 0) {
            selection.keep([])
            useToastStore.getState().addToast({
                title: batchSentToast(answer.sent.length),
                variant: 'success',
                duration: SENT_TOAST_MS,
            })
            return
        }
        setBatchFailed(
            listKey,
            batchResultLines({ sent: answer.sent.length, failed: answer.failed, rows: ticked })
        )
        selection.keep(answer.failed.map(item => item.id))
    }

    const open = () => {
        send.reset()
        setBanner(null)
        setBatchFailed(listKey, null)
        openBatch(listKey)
    }
    const close = () => {
        if (!isPending) closeBatch()
    }
    const confirm = () => {
        if (!isOpen || isPending || !copy.isConfirmEnabled || !writes.available) return
        const items = sendItemsOf(ticked)
        if (items.length === 0) return
        send.mutate(items, { onSuccess: onAnswer })
    }
    const banner = {
        message: failure === null ? null : [failure.summary, ...failure.lines].join('\n'),
        onDismiss: () => setBatchFailed(listKey, null),
    }
    return {
        isOffered: batchSendOffered(ticked, canWrite),
        isOpen,
        counts,
        copy,
        isPending,
        refusal,
        // The menu's Send row and the confirm wait for writes to be available and for a
        // running send.
        canStart: writes.available && !isPending,
        banner,
        open,
        close,
        confirm,
    }
}

export type BatchSend = ReturnType<typeof useBatchSend>
