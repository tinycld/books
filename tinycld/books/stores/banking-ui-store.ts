import { create } from '@tinycld/core/lib/store'
import {
    type DateOrder,
    EMPTY_REVIEW_FILTERS,
    type ReviewDatePreset,
    type ReviewFilters,
    type ReviewType,
} from '../lib/bank-review'

// The open dialog, the panel's More menu and each connection's upload line are shared
// by the Banking page, its menu and its dialogs, so they live here rather than in one
// component. The screen closes the dialog and the menu when it loses focus, because a
// stacked earlier Banking screen still renders them. `uploads` keeps each connection's
// last upload line until the next pick on that connection. The store is not persisted.
// `reviewFilters` (search, Dates, Type) is one set for the three transaction tabs and
// every account, so it stays while the user switches tabs and accounts. The screen resets
// it when it loses focus, for the same reason as the dialog: a stacked earlier Banking
// screen would keep showing it (lesson 5). `dateOrder` is the date order of those tabs.
// `openTxnId` is the transaction in the detail drawer and `chosen` the rows chosen for a
// batch; closeAll closes the drawer and clears the choice too.

export type BankingDialog =
    | { kind: 'none' }
    | { kind: 'connect' }
    | { kind: 'edit'; connectionId: string }
    | { kind: 'disconnect'; connectionId: string }
    | { kind: 'remove'; connectionId: string; fileId: string; fileName: string }

// The upload line under one connection's upload area. A connection with no entry is idle.
// `done` keeps the new file's id for its "Import transactions" button.
export type UploadState =
    | { kind: 'idle' }
    | { kind: 'uploading'; name: string }
    | { kind: 'done'; name: string; fileId: string }
    | { kind: 'error'; message: string }

const NO_DIALOG: BankingDialog = { kind: 'none' }

interface BankingUIState {
    dialog: BankingDialog
    isPanelMenuOpen: boolean
    // Keyed by connection id, so an upload's result lands on the connection it was
    // started for even when the user selects another card while it runs.
    uploads: Record<string, UploadState>
    openDialog: (dialog: BankingDialog) => void
    closeDialog: () => void
    setPanelMenuOpen: (open: boolean) => void
    setUpload: (connectionId: string, state: UploadState) => void
    // A removed file can no longer be imported, so its "uploaded" line goes back to idle.
    clearRemovedUpload: (connectionId: string, fileId: string) => void
    closeAll: () => void
    reviewFilters: ReviewFilters
    setReviewSearch: (text: string) => void
    setReviewPreset: (preset: ReviewDatePreset) => void
    setReviewType: (type: ReviewType) => void
    clearReviewFilters: () => void
    resetReviewFilters: () => void
    dateOrder: DateOrder
    toggleDateOrder: () => void
    // The transaction shown in the detail drawer; null when the drawer is closed.
    openTxnId: string | null
    openTxn: (id: string) => void
    closeTxn: () => void
    // The chosen rows of the shown transaction tab. Readers intersect it with the rows on
    // screen (shownChoice), so an id that left the list counts nowhere. A new Set on
    // every change, so a selector sees the change.
    chosen: ReadonlySet<string>
    setChosen: (ids: readonly string[]) => void
    clearChosen: () => void
    // A tab or account change leaves the rows the drawer and the choice belonged to, so
    // the drawer closes and the choice clears.
    resetReviewSelection: () => void
}

export const useBankingUIStore = create<BankingUIState>()(set => ({
    dialog: NO_DIALOG,
    isPanelMenuOpen: false,
    uploads: {},
    openDialog: dialog => set({ dialog }),
    closeDialog: () => set({ dialog: NO_DIALOG }),
    setPanelMenuOpen: open => set({ isPanelMenuOpen: open }),
    setUpload: (connectionId, state) =>
        set(s => ({ uploads: { ...s.uploads, [connectionId]: state } })),
    clearRemovedUpload: (connectionId, fileId) =>
        set(s => {
            const upload = s.uploads[connectionId]
            if (upload?.kind !== 'done' || upload.fileId !== fileId) return s
            return { uploads: { ...s.uploads, [connectionId]: { kind: 'idle' } } }
        }),
    closeAll: () =>
        set({ dialog: NO_DIALOG, isPanelMenuOpen: false, openTxnId: null, chosen: new Set() }),
    reviewFilters: EMPTY_REVIEW_FILTERS,
    setReviewSearch: search => set(s => ({ reviewFilters: { ...s.reviewFilters, search } })),
    setReviewPreset: preset => set(s => ({ reviewFilters: { ...s.reviewFilters, preset } })),
    setReviewType: type => set(s => ({ reviewFilters: { ...s.reviewFilters, type } })),
    clearReviewFilters: () => set({ reviewFilters: EMPTY_REVIEW_FILTERS }),
    resetReviewFilters: () => set({ reviewFilters: EMPTY_REVIEW_FILTERS }),
    dateOrder: 'newest',
    toggleDateOrder: () =>
        set(s => ({ dateOrder: s.dateOrder === 'newest' ? 'oldest' : 'newest' })),
    openTxnId: null,
    openTxn: id => set({ openTxnId: id }),
    closeTxn: () => set({ openTxnId: null }),
    chosen: new Set(),
    setChosen: ids => set({ chosen: new Set(ids) }),
    clearChosen: () => set({ chosen: new Set() }),
    resetReviewSelection: () => set({ openTxnId: null, chosen: new Set() }),
}))
