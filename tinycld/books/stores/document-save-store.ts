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
    // The line tables a new form showed when its first save replaced the route with the
    // saved draft's, keyed by that draft's id (the form key of the screen it lands on). The
    // draft's form starts from them, so a table shown in the form session stays shown.
    shownTables: Readonly<Record<string, readonly string[]>>
    keepShownTables: (id: string, tables: readonly string[]) => void
    // The draft's form is gone: its form session ended.
    forgetShownTables: (id: string) => void
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
    shownTables: {},
    keepShownTables: (id, tables) =>
        set(s => ({ shownTables: { ...s.shownTables, [id]: tables } })),
    forgetShownTables: id =>
        set(s => {
            if (!(id in s.shownTables)) return s
            const { [id]: _gone, ...rest } = s.shownTables
            return { shownTables: rest }
        }),
}))
