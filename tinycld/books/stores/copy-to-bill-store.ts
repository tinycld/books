import { create } from '@tinycld/core/lib/store'
import type { CopyToBillChoice } from '../lib/copy-to-bill'

export type { CopyToBillChoice } from '../lib/copy-to-bill'

// The order whose Copy to bill dialog is open, and the screen that opened it (`owner`, the
// `useId()` of the screen that mounts its one CopyToBillDialog): a screen that stays mounted
// under another in the stack mounts a dialog too; only the dialog whose owner matches draws.
export type CopyToBillTarget = { orderId: string; owner: string }

interface CopyToBillState {
    // null while the dialog is closed.
    openFor: CopyToBillTarget | null
    open: (orderId: string, owner: string) => void
    close: () => void
    // An order whose dialog a list row's Copy to bill asked for (null when none): the list
    // pushes the order's read view, which takes it (`claim`) as its owner once it has the
    // focus, so the dialog draws over the read view, as its own Copy to bill does. The claim
    // opens the dialog only while the read view still offers Copy to bill (`isOffered`: the
    // order can have been closed since the list drew); else it drops the request.
    pendingOrder: string | null
    openOnRead: (orderId: string) => void
    claim: (orderId: string, owner: string, isOffered: boolean) => void
    // Drops a request no read view took: with an id, only that order's (the order's screen
    // shows its load error, not-found or no-access, or loses the focus before its read view
    // took it: DocumentScreen); with none, any. An open dialog stays open.
    dropPending: (orderId?: string) => void
    // The choice of each order's Copy to bill dialog that no bill form has taken yet, by
    // the order's id.
    choices: Readonly<Record<string, CopyToBillChoice>>
    put: (orderId: string, choice: CopyToBillChoice) => void
    // The order's choice, read once: it is cleared, so a later open of the same bill route
    // (a reload, Back and Forward) starts from every open line.
    take: (orderId: string) => CopyToBillChoice | undefined
}

// The Copy to bill dialog's open state, and the hand-off from the dialog to the bill form
// (purchase order spec §3.7): Create bill puts the chosen lines here and opens `books/bills/new?purchase_order=<id>`,
// and the bill's data source takes them once. Nothing is written to the server.
export const useCopyToBillStore = create<CopyToBillState>()((set, get) => ({
    openFor: null,
    open: (orderId, owner) => set({ openFor: { orderId, owner } }),
    close: () => set({ openFor: null }),
    pendingOrder: null,
    openOnRead: orderId => set({ pendingOrder: orderId }),
    claim: (orderId, owner, isOffered) => {
        if (get().pendingOrder !== orderId) return
        if (!isOffered) {
            set({ pendingOrder: null })
            return
        }
        set({ pendingOrder: null, openFor: { orderId, owner } })
    },
    dropPending: orderId => {
        const pending = get().pendingOrder
        if (pending === null) return
        if (orderId !== undefined && pending !== orderId) return
        set({ pendingOrder: null })
    },
    choices: {},
    put: (orderId, choice) => set(state => ({ choices: { ...state.choices, [orderId]: choice } })),
    take: orderId => {
        const choice = get().choices[orderId]
        if (choice === undefined) return undefined
        set(state => {
            const { [orderId]: _taken, ...rest } = state.choices
            return { choices: rest }
        })
        return choice
    },
}))
