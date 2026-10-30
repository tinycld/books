import { create } from '@tinycld/core/lib/store'

export type RecordFormState<R extends { id: string }> = {
    // The open record whose form has unsaved edits, for the list's delete dialog.
    dirtyRecordId: string | null
    setDirtyRecord(id: string, isDirty: boolean): void
    // The record a delete is running for, with the row as it was. pbtsdb removes the
    // row optimistically, before the server answers; while this names the open record
    // its screen keeps the form on this snapshot, so a refusal (which restores the row)
    // finds the form and its edits still there. A store updates synchronously, so the
    // flag is visible to the very render the optimistic removal triggers.
    deleting: { id: string; record: R } | null
    startDeleting(record: R): void
    endDeleting(): void
}

// One store per record kind: its list and its open record's screen share it.
export function createRecordFormStore<R extends { id: string }>() {
    return create<RecordFormState<R>>()(set => ({
        dirtyRecordId: null,
        setDirtyRecord: (id, isDirty) =>
            set(state => {
                if (isDirty) return { dirtyRecordId: id }
                if (state.dirtyRecordId === id) return { dirtyRecordId: null }
                return {}
            }),
        deleting: null,
        startDeleting: record => set({ deleting: { id: record.id, record } }),
        endDeleting: () => set({ deleting: null }),
    }))
}

export type RecordFormStore<R extends { id: string }> = ReturnType<typeof createRecordFormStore<R>>

// The snapshot of the record being deleted, while the delete of that id runs.
export function useDeletingRecord<R extends { id: string }>(
    store: RecordFormStore<R>,
    id: string
): R | undefined {
    return store(s => (s.deleting?.id === id ? s.deleting.record : undefined))
}
