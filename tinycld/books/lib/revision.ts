// A draft's revision counts the saves that changed it. A save or a post states
// the revision the form loaded, as the next value; the server refuses the write
// with a 409 when the draft changed after that (server/revision.go).

export const REVISION_CONFLICT_TEXT =
    'This entry changed after you opened it. Load the current entry, then review it before you save or post.'

// One batch holds 1,100 operations on the server; one of them is the entry update.
export const MAX_LINE_OPS = 1099

// A single request carries the 409 itself. A refused batch answers 400 and pbtsdb
// puts the failed operation's own status on its error.
export function isRevisionConflict(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'status' in error && error.status === 409
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
