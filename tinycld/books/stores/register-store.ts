import { create } from '@tinycld/core/lib/store'

type RegisterEntry = { accountId: string; entryId: string }

interface RegisterState {
    selected: RegisterEntry | null
    // The entry the list keeps in view and in focus when it changes between table and cards.
    // `close` keeps it, so the table that comes back after the drawer closes shows that entry.
    anchor: RegisterEntry | null
    openEntry: (accountId: string, entryId: string) => void
    close: () => void
    reset: () => void
}

export const useRegisterStore = create<RegisterState>()(set => ({
    selected: null,
    anchor: null,
    openEntry: (accountId, entryId) =>
        set({ selected: { accountId, entryId }, anchor: { accountId, entryId } }),
    close: () => set({ selected: null }),
    reset: () => set({ selected: null, anchor: null }),
}))
