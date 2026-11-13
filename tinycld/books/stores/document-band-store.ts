import { create } from '@tinycld/core/lib/store'

interface DocumentBandState {
    // The mounted form (its band key) whose band shows the address and email inputs; any
    // other form shows them as text.
    editingFor: string | null
    edit: (bandKey: string) => void
}

// "Edit address" reveals the Bill to and Email inputs of one form. Both fields read this
// one flag, so neither needs an effect to follow the other. The key is per mounted form,
// so a form opened later (the same draft included) starts folded and nothing has to clear
// the flag when a form goes away.
export const useDocumentBandStore = create<DocumentBandState>()(set => ({
    editingFor: null,
    edit: bandKey => set({ editingFor: bandKey }),
}))
