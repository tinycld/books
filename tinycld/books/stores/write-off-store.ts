import { create } from '@tinycld/core/lib/store'

// The invoice whose write-off dialog is open, and the screen that opened it (`owner`, the
// `useId()` of the screen that mounts its one WriteOffDialog). A list that stays mounted
// under an invoice read view in the stack mounts a dialog too; only the dialog whose owner
// matches draws.
export type WriteOffTarget = { invoiceId: string; owner: string }

interface WriteOffState {
    // null while the dialog is closed.
    openFor: WriteOffTarget | null
    // A write-off write runs: the dialog stays open and its fields are disabled through it.
    isHeld: boolean
    open: (invoiceId: string, owner: string) => void
    close: () => void
    hold: () => void
    release: () => void
}

// The write-off dialog (write-off spec §3.3). The write-off is inserted optimistically, so
// the invoice's state can change before the server answers; a refusal must still find the
// dialog. The submit sets `isHeld` before the mutation: a store updates synchronously, so
// the flag is seen by the very render the optimistic insert triggers.
export const useWriteOffStore = create<WriteOffState>()(set => ({
    openFor: null,
    isHeld: false,
    open: (invoiceId, owner) => set({ openFor: { invoiceId, owner } }),
    close: () => set({ openFor: null }),
    hold: () => set({ isHeld: true }),
    release: () => set({ isHeld: false }),
}))
