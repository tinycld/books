import { create } from '@tinycld/core/lib/store'

interface ApplyCreditState {
    // The vendor credit whose apply dialog is open; null while it is closed.
    openFor: string | null
    // An Apply credit write runs: the dialog stays mounted through it.
    isHeld: boolean
    open: (creditId: string) => void
    close: () => void
    hold: () => void
    release: () => void
}

// The apply dialog of a vendor credit (vendor credit spec §3.9). The applications are
// inserted optimistically, so the credit's balance (and with it the Apply to bills action)
// changes before the server answers; a refusal must still find the dialog. Apply credit
// sets `isHeld` before the mutation: a store updates synchronously, so the flag is seen by
// the very render the optimistic insert triggers.
export const useApplyCreditStore = create<ApplyCreditState>()(set => ({
    openFor: null,
    isHeld: false,
    open: creditId => set({ openFor: creditId }),
    close: () => set({ openFor: null }),
    hold: () => set({ isHeld: true }),
    release: () => set({ isHeld: false }),
}))
