import { create } from '@tinycld/core/lib/store'
import type { FindRange } from '../lib/bank-match'
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
// batch; `focusedTxnId` is the row the review keys focused. closeAll closes the drawer and
// clears the choice and the key focus too.

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
    // The row the review keys focused (the focus stripe), not DOM focus. Readers look it
    // up in the rows on screen, so an id that left the list focuses nothing.
    focusedTxnId: string | null
    setFocusedTxn: (id: string | null) => void
    // A tab or account change leaves the rows the drawer, the choice and the key focus
    // belonged to, so the drawer closes and the choice and the focus clear.
    resetReviewSelection: () => void
    // The drawer's Match section: its mode, the chosen journal lines, and the find mode's
    // range and search (null until the find mode sets them). Until the user changes the
    // choice of a transaction, useBankMatch shows its one suggestion as chosen; the first
    // change stores the whole choice with `matchSeededFor` = that transaction
    // (takeMatchChoice), so from then on `matchChosen` alone counts and an uncheck stays.
    // `matchRefusal` is the failure text of the last match from the drawer. All of it
    // belongs to the open transaction, so opening another one, closing the drawer, or
    // leaving the rows resets it.
    // Only line ids are kept: useBankMatch reads the chosen lines from the server, so a
    // line that stops being matchable leaves the choice.
    // `matchFindRange` is the find mode's last valid range (null: the window around the
    // bank date) and `matchFindSearch` its search after the field's delay (MatchFind keeps
    // the draft as typed).
    matchMode: 'suggestions' | 'find'
    matchChosen: readonly string[]
    matchFindRange: FindRange | null
    matchFindSearch: string
    matchSeededFor: string | null
    matchRefusal: string | null
    setMatchRefusal: (text: string | null) => void
    setMatchMode: (mode: 'suggestions' | 'find') => void
    setMatchFindRange: (range: FindRange) => void
    setMatchFindSearch: (search: string) => void
    takeMatchChoice: (txnId: string, lineIds: readonly string[]) => void
    resetMatch: () => void
}

const NO_MATCH = {
    matchMode: 'suggestions' as const,
    matchChosen: [] as readonly string[],
    matchFindRange: null,
    matchFindSearch: '',
    matchSeededFor: null,
    matchRefusal: null,
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
        set({
            dialog: NO_DIALOG,
            isPanelMenuOpen: false,
            openTxnId: null,
            chosen: new Set(),
            focusedTxnId: null,
            ...NO_MATCH,
        }),
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
    // Opening the transaction already open keeps its Match section as it is.
    openTxn: id => set(s => (s.openTxnId === id ? s : { openTxnId: id, ...NO_MATCH })),
    closeTxn: () => set({ openTxnId: null, ...NO_MATCH }),
    chosen: new Set(),
    setChosen: ids => set({ chosen: new Set(ids) }),
    clearChosen: () => set({ chosen: new Set() }),
    focusedTxnId: null,
    setFocusedTxn: id => set({ focusedTxnId: id }),
    resetReviewSelection: () =>
        set({ openTxnId: null, chosen: new Set(), focusedTxnId: null, ...NO_MATCH }),
    ...NO_MATCH,
    setMatchMode: mode => set({ matchMode: mode }),
    setMatchFindRange: range => set({ matchFindRange: range }),
    setMatchFindSearch: search => set({ matchFindSearch: search }),
    setMatchRefusal: text => set({ matchRefusal: text }),
    takeMatchChoice: (txnId, lineIds) => set({ matchSeededFor: txnId, matchChosen: [...lineIds] }),
    resetMatch: () => set(NO_MATCH),
}))
