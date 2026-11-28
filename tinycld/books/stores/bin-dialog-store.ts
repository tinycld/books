import { create } from '@tinycld/core/lib/store'
import type { BinListRow } from '../hooks/useBinsQuery'
import type { BinDialogTarget } from '../lib/bin-list'
import { createRecordFormStore } from './record-form-store'

// The bin dialog of the bin list (inventory-adjust spec §3.7): New bin location opens a
// new bin, a row press and the row menu's Edit open that bin. Not persisted: the list
// closes it when the screen loses focus. An edit target whose bin was deleted elsewhere
// stays here, and the list draws its notice in place of the dialog until it is dismissed
// (close).
export interface BinDialogStoreState {
    target: BinDialogTarget | null
    openNew(): void
    openEdit(id: string): void
    close(): void
}

export const useBinDialogStore = create<BinDialogStoreState>()(set => ({
    target: null,
    openNew: () => set({ target: { mode: 'new' } }),
    openEdit: id => set({ target: { mode: 'edit', id } }),
    close: () => set({ target: null }),
}))

// The row actions' delete snapshot (useRecordActions), as the tax dialogs keep theirs. A
// bin has no form screen, so no record is ever marked dirty in it.
export const useBinFormStore = createRecordFormStore<BinListRow>()
