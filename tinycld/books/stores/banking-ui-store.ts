import { create } from '@tinycld/core/lib/store'

// The open dialog, the panel's More menu and each connection's upload line are shared
// by the Banking page, its menu and its dialogs, so they live here rather than in one
// component. The screen closes the dialog and the menu when it loses focus, because a
// stacked earlier Banking screen still renders them. `uploads` keeps each connection's
// last upload line until the next pick on that connection. The store is not persisted.

export type BankingDialog =
    | { kind: 'none' }
    | { kind: 'connect' }
    | { kind: 'edit'; connectionId: string }
    | { kind: 'disconnect'; connectionId: string }
    | { kind: 'remove'; connectionId: string; fileId: string; fileName: string }

// The upload line under one connection's upload area. A connection with no entry is idle.
export type UploadState =
    | { kind: 'idle' }
    | { kind: 'uploading'; name: string }
    | { kind: 'done'; name: string }
    | { kind: 'error'; message: string }

const NO_DIALOG: BankingDialog = { kind: 'none' }

interface BankingUIState {
    dialog: BankingDialog
    isPanelMenuOpen: boolean
    // Keyed by connection id, so an upload's result lands on the connection it was
    // started for even when the user selects another card while it runs.
    uploads: Record<string, UploadState>
    openDialog: (dialog: BankingDialog) => void
    closeDialog: () => void
    setPanelMenuOpen: (open: boolean) => void
    setUpload: (connectionId: string, state: UploadState) => void
    closeAll: () => void
}

export const useBankingUIStore = create<BankingUIState>()(set => ({
    dialog: NO_DIALOG,
    isPanelMenuOpen: false,
    uploads: {},
    openDialog: dialog => set({ dialog }),
    closeDialog: () => set({ dialog: NO_DIALOG }),
    setPanelMenuOpen: open => set({ isPanelMenuOpen: open }),
    setUpload: (connectionId, state) =>
        set(s => ({ uploads: { ...s.uploads, [connectionId]: state } })),
    closeAll: () => set({ dialog: NO_DIALOG, isPanelMenuOpen: false }),
}))
