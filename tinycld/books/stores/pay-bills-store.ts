import { create } from '@tinycld/core/lib/store'

// The hold of a running Pay. The filters and the sort are each screen's own state
// (usePayBillsForm), so a second Pay Bills stacked on a first neither shares nor clears
// them.
interface PayBillsState {
    // A Pay runs. Set synchronously before the mutation, so the optimistic rows of the
    // batch never swap the form away and a refusal still lands on it (memory
    // p1-opening-balances).
    holding: boolean
    hold: () => void
    release: () => void
}

export const usePayBillsStore = create<PayBillsState>()(set => ({
    holding: false,
    hold: () => set({ holding: true }),
    release: () => set({ holding: false }),
}))
