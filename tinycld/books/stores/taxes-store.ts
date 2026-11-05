import { create } from '@tinycld/core/lib/store'

// Screen state of the Sales tax page. Not persisted: Show inactive starts off on
// every visit, and the screen resets it when it loses focus.
export interface TaxesState {
    showInactive: boolean
    setShowInactive(value: boolean): void
    reset(): void
}

export const useTaxesStore = create<TaxesState>()(set => ({
    showInactive: false,
    setShowInactive: value => set({ showInactive: value }),
    reset: () => set({ showInactive: false }),
}))
