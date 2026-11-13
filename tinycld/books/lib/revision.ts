// A draft's revision counts the saves that changed it. A save or a post states
// the revision the form loaded, as the next value; the server refuses the write
// with a 409 when the draft changed after that (server/revision.go).

export const REVISION_CONFLICT_TEXT =
    'This entry changed after you opened it. Load the current entry, then review it before you save or post.'

// For a form that cannot load the draft in place (a new entry whose post was refused).
export const REVISION_CONFLICT_REOPEN_TEXT =
    'This entry changed after you opened it. Open it again from Journal Entries, then review it before you save or post.'

// One batch holds 1,100 operations on the server; one of them is the entry update.
export const MAX_LINE_OPS = 1099

// A single request carries the 409 itself. A refused batch answers 400 and pbtsdb
// puts the failed operation's own status on its error.
export function isRevisionConflict(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'status' in error && error.status === 409
}

// The form's own refusal of a stale save. It has the status of the server's refusal, so
// every caller shows the two the same way.
export class RevisionConflictError extends Error {
    readonly status = 409
    // `message` is the text of the kind of record; the entry's when none is given.
    constructor(message: string = REVISION_CONFLICT_TEXT) {
        super(message)
    }
}

// Refuses a save when the stored draft moved past the revision the form loaded. The
// server cannot refuse every such save: a save that changes no entry field sends only
// lines, and a line carries no revision. `stored` is undefined when the store does not
// hold the row; the server's check is then the only one.
export function assertRevisionSeen(stored: number | undefined, loaded: number, message?: string) {
    if (stored !== undefined && stored !== loaded) throw new RevisionConflictError(message)
}

// The line operations of one save, split so each part fits a batch with its entry
// update. A save with no line operation is still one batch.
export function chunkOps<T>(ops: readonly T[], size = MAX_LINE_OPS): T[][] {
    if (ops.length === 0) return [[]]
    const chunks: T[][] = []
    for (let start = 0; start < ops.length; start += size) {
        chunks.push(ops.slice(start, start + size))
    }
    return chunks
}

// The opening balances screen has no "load" action: the person opens it again.
export const OPENING_CONFLICT_TEXT =
    'These opening balances changed after you opened them. Open this screen again, then review them before you save or post.'

// The notice of a sales document form whose save or post was refused because the
// document changed after the form took its values. `noun` is the kind's ("Invoice"); an
// estimate (the quote lifecycle) has no post.
export function documentConflictText(noun: string, lifecycle: 'posting' | 'quote'): string {
    const name = noun.toLowerCase()
    const action = lifecycle === 'posting' ? 'save or post' : 'save'
    return `This ${name} changed after you opened it. Load the current ${name}, then review it before you ${action}.`
}
