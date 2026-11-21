import { create } from '@tinycld/core/lib/store'

// A statement the create screen stored and did not send: its id and the number the server
// gave it ('' while the number has not reached the store).
export type SavedStatement = { id: string; number: string }

// What a Save (or a Save and send) run of the create screen did: how many of its `total`
// statements went through, and each customer whose write was refused with the server's
// text. `saved` is the customer's stored, unsent statement when its send failed, and null
// when its store was refused (no statement exists).
export type StatementRunFailure = { customer: string; name: string; message: string }

export type StatementRunOutcome = {
    intent: 'save' | 'send'
    done: number
    total: number
    failed: (StatementRunFailure & { saved: SavedStatement | null })[]
}

interface StatementsState {
    isHeld: boolean
    outcome: StatementRunOutcome | null
    // The screen's saved, unsent statements by customer id (statements spec §4.5): a second
    // run sends these and stores nothing for their customers.
    saved: Record<string, SavedStatement>
    hold: () => void
    release: () => void
    setOutcome: (outcome: StatementRunOutcome) => void
    setSaved: (saved: Record<string, SavedStatement>) => void
    // A run's own reset of the last outcome; the saved statements stay.
    clear: () => void
    // The create screen's unmount: the outcome and the saved statements go.
    reset: () => void
}

// The inserts of a run are optimistic, so the stored rows appear before the server answers.
// The create screen holds its form and its bar while `isHeld` is set; a store updates
// synchronously, so the flag is set before the first insert reaches the store.
export const useStatementsStore = create<StatementsState>()(set => ({
    isHeld: false,
    outcome: null,
    saved: {},
    hold: () => set({ isHeld: true }),
    release: () => set({ isHeld: false }),
    setOutcome: outcome => set({ outcome }),
    setSaved: saved => set({ saved }),
    clear: () => set({ outcome: null }),
    reset: () => set({ outcome: null, saved: {} }),
}))
