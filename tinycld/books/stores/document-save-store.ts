import { create } from '@tinycld/core/lib/store'

interface DocumentSaveState {
    // The sales document whose post or delete is in flight; null when none is.
    heldId: string | null
    hold: (id: string) => void
    // Ends the hold of this document only; a hold of another stays.
    release: (id: string) => void
    // The draft each screen's new form wrote before its post was refused (the form stays
    // on `new` and its next save updates it), keyed by the writer key of the screen mount
    // the form belongs to. Another mount of the same route has its own key, so it never
    // reads a draft it did not write.
    written: Readonly<Record<string, string>>
    wrote: (writer: string, id: string) => void
    // The screen mount is gone: its written draft is no one's to keep.
    forget: (writer: string) => void
}

// Posting flips the document's status optimistically, and deleting removes its row, both
// before the server answers. The screen keeps the form while this holds its id; a store
// updates synchronously, so the flag is visible to the very render the optimistic change
// triggers, and a refusal still lands on the form. `written` lets the screen of a new
// invoice made from an estimate keep its own form once that form's draft has closed the
// estimate.
export const useDocumentSaveStore = create<DocumentSaveState>()(set => ({
    heldId: null,
    hold: id => set({ heldId: id }),
    release: id => set(s => (s.heldId === id ? { heldId: null } : s)),
    written: {},
    wrote: (writer, id) => set(s => ({ written: { ...s.written, [writer]: id } })),
    forget: writer =>
        set(s => {
            if (!(writer in s.written)) return s
            const { [writer]: _gone, ...rest } = s.written
            return { written: rest }
        }),
}))
