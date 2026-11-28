import { create } from '@tinycld/core/lib/store'
import type { AdjustmentValues } from '../lib/adjustment-values'

// An inventory adjustment held by its running write. A save or post keeps the form up; a
// delete keeps the row the screen showed.
export type AdjustmentHold = { id: string; purpose: 'save' | 'delete' }

// A save of a new adjustment that wrote the draft and was then refused (a refused post, or
// a refused line write). The new form replaces its route with the draft's, and the draft's
// form starts from what the user submitted and shows the refusal (the deposit's hand-off,
// stores/deposit-save-store.ts).
export type AdjustmentRefusedSave = {
    id: string
    // The form's values as submitted, blank lines included.
    values: AdjustmentValues
    error: unknown
    // The lines the save wrote, in position order (lib/adjustment-refusals.ts numbers a
    // "Line n: …" refusal by them).
    saved: readonly { id: string }[]
    // The index in `saved` of the line whose own write was refused; absent for another
    // write.
    lineAt?: number
}

interface AdjustmentSaveState {
    // The adjustment whose save, post or delete runs; null when none does. The screen's
    // held flag is `holding !== null`.
    holding: AdjustmentHold | null
    hold: (hold: AdjustmentHold) => void
    release: () => void
    refused: AdjustmentRefusedSave | null
    handOff: (refused: AdjustmentRefusedSave) => void
    // The draft's form that started from the hand-off has gone.
    clearRefused: () => void
}

// Posting flips the adjustment's status optimistically, before the server answers, and
// the screen would swap the form for the read view. It keeps the form up while it holds
// the adjustment; a store updates synchronously, so the hold is set before the mutation
// and is seen by the render the optimistic flip triggers, and a refusal of the post still
// lands on the form (the opening balances pattern, stores/opening-post-store.ts).
export const useAdjustmentSaveStore = create<AdjustmentSaveState>()(set => ({
    holding: null,
    hold: hold => set({ holding: hold }),
    release: () => set({ holding: null }),
    refused: null,
    handOff: refused => set({ refused }),
    clearRefused: () => set({ refused: null }),
}))

// The refusal handed to this adjustment's form, if any (read once, at the screen's mount).
export function refusedAdjustmentSaveOf(id: string | null): AdjustmentRefusedSave | null {
    const { refused } = useAdjustmentSaveStore.getState()
    return refused !== null && refused.id === id ? refused : null
}
