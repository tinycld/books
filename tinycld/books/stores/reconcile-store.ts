import { create } from '@tinycld/core/lib/store'

interface ReconcileState {
    // The account whose start dialog is open; null while no dialog is open.
    startAccountId: string | null
    // Set before the start's insert and cleared when it settles: pbtsdb shows the new row at
    // once, and the dialog must stay open (and refuse to close) until the server has answered,
    // so a refusal shows in it. A store updates synchronously, so the very render the
    // optimistic insert triggers sees the flag.
    isStarting: boolean
    // The phone's compact summary bar, opened to the full band.
    isBandOpen: boolean
    openStart: (accountId: string) => void
    closeStart: () => void
    setStarting: (isStarting: boolean) => void
    toggleBand: () => void
}

// Not persisted: an open dialog or an open band does not outlive the session.
export const useReconcileStore = create<ReconcileState>()(set => ({
    startAccountId: null,
    isStarting: false,
    isBandOpen: false,
    openStart: accountId => set({ startAccountId: accountId }),
    closeStart: () => set({ startAccountId: null }),
    setStarting: isStarting => set({ isStarting }),
    toggleBand: () => set(state => ({ isBandOpen: !state.isBandOpen })),
}))
