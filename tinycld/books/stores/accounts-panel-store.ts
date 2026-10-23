import { create } from '@tinycld/core/lib/store'

export type PanelTarget = { mode: 'new'; parentId: string } | { mode: 'edit'; id: string }

interface AccountsPanelState {
    target: PanelTarget | null
    openNew: () => void
    openSubAccount: (parentId: string) => void
    openEdit: (id: string) => void
    close: () => void
}

export const useAccountsPanelStore = create<AccountsPanelState>()(set => ({
    target: null,
    openNew: () => set({ target: { mode: 'new', parentId: '' } }),
    openSubAccount: parentId => set({ target: { mode: 'new', parentId } }),
    openEdit: id => set({ target: { mode: 'edit', id } }),
    close: () => set({ target: null }),
}))
