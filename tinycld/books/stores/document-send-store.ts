import { create } from '@tinycld/core/lib/store'
import type { SendKind } from '../lib/document-send'

export type DocumentSendTarget = { kind: SendKind; id: string }

// What a part-failed batch send leaves above its list (spec §3.3 "Batch"): the summary
// line and one line for each failed document.
export type BatchSendFailure = { summary: string; lines: readonly string[] }

interface DocumentSendState {
    // The document whose Send dialog is open, and the screen that opened it (`owner`, the
    // `useId()` of the screen that mounts its one SendDocumentDialog). A list that stays
    // mounted under a read view mounts a dialog too; only the dialog whose owner matches
    // draws.
    target: DocumentSendTarget | null
    owner: string
    // The document to send once its post or save lands (Post and send, Save and send): set
    // before the write, so an optimistic row that swaps the form for the read view does
    // not lose it (spec §4.5).
    queued: DocumentSendTarget | null
    // The list whose batch Send dialog is open, by its list key.
    batchSend: { listKey: string } | null
    // The banner of each list's last part-failed batch, by its list key.
    batchFailed: Readonly<Record<string, BatchSendFailure>>
    open: (target: DocumentSendTarget, owner: string) => void
    close: () => void
    queue: (target: DocumentSendTarget) => void
    cancelQueued: (id: string) => void
    openBatch: (listKey: string) => void
    closeBatch: () => void
    setBatchFailed: (listKey: string, result: BatchSendFailure | null) => void
}

// The Send dialog's shared state (spec §3.2, §3.3, §4.5). A store updates synchronously, so
// a value set before a write is seen by the very render the write's optimistic row causes.
export const useDocumentSendStore = create<DocumentSendState>()(set => ({
    target: null,
    owner: '',
    queued: null,
    batchSend: null,
    batchFailed: {},
    open: (target, owner) => set({ target, owner }),
    close: () => set({ target: null, queued: null }),
    queue: target => set({ queued: target }),
    cancelQueued: id => set(state => (state.queued?.id === id ? { queued: null } : {})),
    openBatch: listKey => set({ batchSend: { listKey } }),
    closeBatch: () => set({ batchSend: null }),
    setBatchFailed: (listKey, result) =>
        set(state => {
            const { [listKey]: _dropped, ...rest } = state.batchFailed
            return { batchFailed: result === null ? rest : { ...rest, [listKey]: result } }
        }),
}))
