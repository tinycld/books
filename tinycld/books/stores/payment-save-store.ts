import { create } from '@tinycld/core/lib/store'
import type { StoredApplication } from '../lib/payment-refusals'
import type { PaymentFormValues } from '../lib/payment-values'

// A save of a new payment that wrote the draft and was then refused (a refused post, or a
// refused application insert). The new form replaces its route with the draft's, and the
// draft's form starts from what the user submitted and shows the refusal.
export type PaymentRefusedSave = {
    id: string
    values: PaymentFormValues
    error: unknown
    stored: StoredApplication[]
}

interface PaymentSaveState {
    // The payment whose save, post or delete runs; null when none does.
    holding: string | null
    hold: (id: string) => void
    release: () => void
    refused: PaymentRefusedSave | null
    handOff: (refused: PaymentRefusedSave) => void
    // The draft's form that started from the hand-off has gone.
    clearRefused: () => void
}

// Posting flips the payment's status optimistically, before the server answers. The
// screen keeps the form up while it holds the payment; a store updates synchronously, so
// the hold is set before the mutation and visible to the render the optimistic flip
// triggers, and a refusal still lands on the form.
export const usePaymentSaveStore = create<PaymentSaveState>()(set => ({
    holding: null,
    hold: id => set({ holding: id }),
    release: () => set({ holding: null }),
    refused: null,
    handOff: refused => set({ refused }),
    clearRefused: () => set({ refused: null }),
}))

// The refusal handed to this payment's form, if any (read once, at the screen's mount).
export function refusedSaveOf(id: string | null): PaymentRefusedSave | null {
    const refused = usePaymentSaveStore.getState().refused
    return refused !== null && refused.id === id ? refused : null
}
