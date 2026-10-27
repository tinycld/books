import { create } from '@tinycld/core/lib/store'
import type { CustomerRecord } from '../hooks/useCustomersQuery'

interface CustomerFormState {
    // The open customer whose form has unsaved edits, for the Delete customer dialog.
    dirtyCustomerId: string | null
    setDirtyCustomer: (id: string, isDirty: boolean) => void
    // The customer a delete is running for, with the row as it was. pbtsdb removes the
    // row optimistically, before the server answers; while this names the open customer
    // its screen keeps the form on this snapshot, so a refusal (which restores the row)
    // finds the form and its edits still there. A store updates synchronously, so the
    // flag is visible to the very render the optimistic removal triggers.
    deleting: { id: string; record: CustomerRecord } | null
    startDeleting: (record: CustomerRecord) => void
    endDeleting: () => void
}

export const useCustomerFormStore = create<CustomerFormState>()(set => ({
    dirtyCustomerId: null,
    setDirtyCustomer: (id, isDirty) =>
        set(state => {
            if (isDirty) return { dirtyCustomerId: id }
            if (state.dirtyCustomerId === id) return { dirtyCustomerId: null }
            return {}
        }),
    deleting: null,
    startDeleting: record => set({ deleting: { id: record.id, record } }),
    endDeleting: () => set({ deleting: null }),
}))
