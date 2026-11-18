import { create } from '@tinycld/core/lib/store'
import type { PaymentFlowKey } from '../lib/payment-flow'
import type { StoredApplication } from '../lib/payment-refusals'
import type { PaymentFormValues } from '../lib/payment-values'

// A save of a new payment that wrote the draft and was then refused (a refused post, or a
// refused line insert). The new form replaces its route with the draft's, and the draft's
// form starts from what the user submitted and shows the refusal.
export type PaymentRefusedSave = {
    id: string
    values: PaymentFormValues
    error: unknown
    stored: StoredApplication[]
}

// One value per payment flow, so a received payment's save never holds a vendor refund's
// screen (vendor refund spec §3.1).
type ByFlow<T> = Record<PaymentFlowKey, T>

interface PaymentSaveState {
    // The payment whose save, post or delete runs, by flow; null when none does.
    holding: ByFlow<string | null>
    hold: (flow: PaymentFlowKey, id: string) => void
    release: (flow: PaymentFlowKey) => void
    // The posted payment a correction form's own save corrects, by flow. Set before the
    // mutation; cleared by a refusal, or, after a save that worked, when that form
    // unmounts (it is moving on to its new route then).
    correcting: ByFlow<string | null>
    startCorrecting: (flow: PaymentFlowKey, original: string) => void
    stopCorrecting: (flow: PaymentFlowKey, original: string) => void
    refused: ByFlow<PaymentRefusedSave | null>
    handOff: (flow: PaymentFlowKey, refused: PaymentRefusedSave) => void
    // The draft's form that started from the hand-off has gone.
    clearRefused: (flow: PaymentFlowKey) => void
}

function noneByFlow<T>(none: T): ByFlow<T> {
    return { payment: none, vendor_refund: none }
}

// Posting flips the payment's status optimistically, before the server answers. The
// screen keeps the form up while it holds the payment; a store updates synchronously, so
// the hold is set before the mutation and visible to the render the optimistic flip
// triggers, and a refusal still lands on the form.
export const usePaymentSaveStore = create<PaymentSaveState>()(set => ({
    holding: noneByFlow<string | null>(null),
    hold: (flow, id) => set(state => ({ holding: { ...state.holding, [flow]: id } })),
    release: flow => set(state => ({ holding: { ...state.holding, [flow]: null } })),
    correcting: noneByFlow<string | null>(null),
    startCorrecting: (flow, original) =>
        set(state => ({ correcting: { ...state.correcting, [flow]: original } })),
    stopCorrecting: (flow, original) =>
        set(state =>
            state.correcting[flow] === original
                ? { correcting: { ...state.correcting, [flow]: null } }
                : {}
        ),
    refused: noneByFlow<PaymentRefusedSave | null>(null),
    handOff: (flow, refused) => set(state => ({ refused: { ...state.refused, [flow]: refused } })),
    clearRefused: flow => set(state => ({ refused: { ...state.refused, [flow]: null } })),
}))

// The refusal handed to this payment's form, if any (read once, at the screen's mount).
export function refusedSaveOf(flow: PaymentFlowKey, id: string | null): PaymentRefusedSave | null {
    const refused = usePaymentSaveStore.getState().refused[flow]
    return refused !== null && refused.id === id ? refused : null
}
