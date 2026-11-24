import { create } from '@tinycld/core/lib/store'
import type { Shortcut } from '../lib/sidebar-shortcuts'

interface ShortcutsDialogState {
    // The list the Customize shortcuts dialog edits; null while the dialog is closed.
    draft: Shortcut[] | null
    open: (list: readonly Shortcut[]) => void
    setDraft: (next: Shortcut[]) => void
    close: () => void
}

// Not persisted: a reload closes the dialog and drops the draft.
export const useShortcutsDialogStore = create<ShortcutsDialogState>()(set => ({
    draft: null,
    open: list => set({ draft: [...list] }),
    setDraft: next => set({ draft: next }),
    close: () => set({ draft: null }),
}))
