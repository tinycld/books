import { create } from '@tinycld/core/lib/store'

// The one dialog the Sales tax page shows: an add (`id` null) or an edit of an agency,
// a rate (with the agency a new rate starts on) or a group, or a delete confirm.
export type TaxDialog =
    | { kind: 'agency'; id: string | null }
    | { kind: 'rate'; id: string | null; agencyId: string }
    | { kind: 'group'; id: string | null }
    | { kind: 'delete'; target: 'agency' | 'rate' | 'group'; id: string; name: string }

// Screen state of the Sales tax page. Not persisted: Show inactive starts off on
// every visit, and the screen resets it (and closes any dialog) when it loses focus.
export interface TaxesState {
    showInactive: boolean
    dialog: TaxDialog | null
    setShowInactive(value: boolean): void
    openDialog(dialog: TaxDialog): void
    closeDialog(): void
    reset(): void
}

export const useTaxesStore = create<TaxesState>()(set => ({
    showInactive: false,
    dialog: null,
    setShowInactive: value => set({ showInactive: value }),
    openDialog: dialog => set({ dialog }),
    closeDialog: () => set({ dialog: null }),
    reset: () => set({ showInactive: false, dialog: null }),
}))
