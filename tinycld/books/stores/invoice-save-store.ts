import { create } from '@tinycld/core/lib/store'

interface InvoiceSaveState {
    // The invoice whose post or delete is in flight; null when none is.
    heldId: string | null
    hold: (id: string) => void
    // Ends the hold of this invoice only; a hold of another stays.
    release: (id: string) => void
}

// Posting flips the invoice's status optimistically, and deleting removes its row, both
// before the server answers. The screen keeps the form while this holds its id; a store
// updates synchronously, so the flag is visible to the very render the optimistic change
// triggers, and a refusal still lands on the form.
export const useInvoiceSaveStore = create<InvoiceSaveState>()(set => ({
    heldId: null,
    hold: id => set({ heldId: id }),
    release: id => set(s => (s.heldId === id ? { heldId: null } : s)),
}))
