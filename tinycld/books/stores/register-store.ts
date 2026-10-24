import { create } from '@tinycld/core/lib/store'

interface RegisterState {
    selected: { accountId: string; entryId: string } | null
    openEntry: (accountId: string, entryId: string) => void
    close: () => void
}

export const useRegisterStore = create<RegisterState>()(set => ({
    selected: null,
    openEntry: (accountId, entryId) => set({ selected: { accountId, entryId } }),
    close: () => set({ selected: null }),
}))
