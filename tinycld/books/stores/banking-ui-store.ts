import { create } from '@tinycld/core/lib/store'

// The open dialog and the panel's More menu are shared by the Banking page, its menu and
// its dialogs, so they live here rather than in one component. The screen closes them
// when it loses focus, because a stacked earlier Banking screen still renders them.
// Nothing here outlives a visit, so the store is not persisted.

export type BankingDialog =
    | { kind: 'none' }
    | { kind: 'connect' }
    | { kind: 'edit'; connectionId: string }
    | { kind: 'disconnect'; connectionId: string }
    | { kind: 'remove'; connectionId: string; fileId: string; fileName: string }

const NO_DIALOG: BankingDialog = { kind: 'none' }

interface BankingUIState {
    dialog: BankingDialog
    isPanelMenuOpen: boolean
    openDialog: (dialog: BankingDialog) => void
    closeDialog: () => void
    setPanelMenuOpen: (open: boolean) => void
    closeAll: () => void
}

export const useBankingUIStore = create<BankingUIState>()(set => ({
    dialog: NO_DIALOG,
    isPanelMenuOpen: false,
    openDialog: dialog => set({ dialog }),
    closeDialog: () => set({ dialog: NO_DIALOG }),
    setPanelMenuOpen: open => set({ isPanelMenuOpen: open }),
    closeAll: () => set({ dialog: NO_DIALOG, isPanelMenuOpen: false }),
}))
