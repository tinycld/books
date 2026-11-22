import { create } from '@tinycld/core/lib/store'
import type { DepositFormValues } from '../lib/deposit-values'

// An item row of the save as written, by its `position`: the draft's form maps a refusal
// keyed `items.<n>` to the row's line through it (lib/deposit.ts `itemLineOfRefusal`).
export type DepositStoredItem = { line: string; position: number }

// A save of a new deposit that wrote the draft and was then refused (a refused post, or a
// refused item or line insert). The new form replaces its route with the draft's, and the
// draft's form starts from what the user submitted and shows the refusal.
export type DepositRefusedSave = {
    id: string
    values: DepositFormValues
    error: unknown
    stored: DepositStoredItem[]
    // The index of the other funds line whose own write was refused; absent for another
    // write (lib/deposit-refusals.ts places a bare line field key under that line).
    lineAt?: number
}

// A deposit held by its running write. A save or post keeps the form up even once the
// original of a correction is void (the post voids it itself); a delete keeps the row the
// screen showed, the form or the cannot-edit notice.
export type DepositHold = { id: string; purpose: 'save' | 'delete' }

interface DepositSaveState {
    // The deposit whose save, post or delete runs; null when none does. The screen's held
    // flag is `holding !== null`.
    holding: DepositHold | null
    hold: (hold: DepositHold) => void
    release: () => void
    // The posted deposit a correction form's own save corrects. Set before the mutation;
    // cleared by a refusal, or, after a save that worked, when that form unmounts (it is
    // moving on to its new route then).
    correcting: string | null
    startCorrecting: (original: string) => void
    stopCorrecting: (original: string) => void
    refused: DepositRefusedSave | null
    handOff: (refused: DepositRefusedSave) => void
    // The draft's form that started from the hand-off has gone.
    clearRefused: () => void
}

// Posting flips the deposit's status optimistically, before the server answers. The screen
// keeps the form up while it holds the deposit; a store updates synchronously, so the hold
// is set before the mutation and visible to the render the optimistic flip triggers, and a
// refusal still lands on the form (the payment save store pattern,
// stores/payment-save-store.ts, with one deposit flow).
export const useDepositSaveStore = create<DepositSaveState>()(set => ({
    holding: null,
    hold: hold => set({ holding: hold }),
    release: () => set({ holding: null }),
    correcting: null,
    startCorrecting: original => set({ correcting: original }),
    stopCorrecting: original =>
        set(state => (state.correcting === original ? { correcting: null } : {})),
    refused: null,
    handOff: refused => set({ refused }),
    clearRefused: () => set({ refused: null }),
}))

// The refusal handed to this deposit's form, if any (read once, at the screen's mount).
export function refusedDepositSaveOf(id: string | null): DepositRefusedSave | null {
    const { refused } = useDepositSaveStore.getState()
    return refused !== null && refused.id === id ? refused : null
}
