import { create } from '@tinycld/core/lib/store'

// seq makes every open a distinct object identity-wise and key-wise, so
// re-opening the same target while open remounts the panel with a fresh form.
export type PanelTarget =
    | { mode: 'new'; parentId: string; seq: number }
    | { mode: 'edit'; id: string; seq: number }

let nextSeq = 0
const seq = () => ++nextSeq

interface AccountsPanelState {
    target: PanelTarget | null
    openNew: () => void
    openSubAccount: (parentId: string) => void
    openEdit: (id: string) => void
    close: () => void
}

export const useAccountsPanelStore = create<AccountsPanelState>()(set => ({
    target: null,
    openNew: () => set({ target: { mode: 'new', parentId: '', seq: seq() } }),
    openSubAccount: parentId => set({ target: { mode: 'new', parentId, seq: seq() } }),
    openEdit: id => set({ target: { mode: 'edit', id, seq: seq() } }),
    close: () => set({ target: null }),
}))
