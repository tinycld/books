import { create } from '@tinycld/core/lib/store'

// What a Save (or a Save and send) run of the create screen did: how many of its `total`
// statements went through, and each customer whose write was refused with the server's
// text.
export type StatementRunOutcome = {
    intent: 'save' | 'send'
    done: number
    total: number
    failed: { customer: string; name: string; message: string }[]
}

interface StatementsState {
    isHeld: boolean
    outcome: StatementRunOutcome | null
    hold: () => void
    release: () => void
    setOutcome: (outcome: StatementRunOutcome) => void
    clear: () => void
}

// The inserts of a run are optimistic, so the stored rows appear before the server answers.
// The create screen holds its form and its bar while `isHeld` is set; a store updates
// synchronously, so the flag is set before the first insert reaches the store.
export const useStatementsStore = create<StatementsState>()(set => ({
    isHeld: false,
    outcome: null,
    hold: () => set({ isHeld: true }),
    release: () => set({ isHeld: false }),
    setOutcome: outcome => set({ outcome }),
    clear: () => set({ outcome: null }),
}))
