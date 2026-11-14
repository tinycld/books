// The reversal rows the journal list read for its entries, kept while the next query
// loads. The list's query is keyed by the ids of its rows, so each time the list loads
// more rows a new query starts, and until it answers nothing would be known: every
// overdue mark would go away and come back.

export type ReversalRow = { reverses: string; status: string }

export type KeptReversals<R extends ReversalRow> = {
    // The entries the answer was for.
    ids: ReadonlySet<string>
    rows: readonly R[]
    signature: string
}

const NO_ROWS: readonly never[] = []

// A kept value is replaced only when its content differs, so a caller that stores it in
// state and compares by reference converges, although a live query can give a new array
// with new row objects on each render.
function signatureOf(entryIds: readonly string[], rows: readonly ReversalRow[]): string {
    return `${entryIds.join(',')}|${rows.map(row => `${row.reverses}:${row.status}`).join(',')}`
}

// `isKnown(id)` is true when the rows say what settles that entry: always after an
// answer; before it, only for the entries the last answer was for.
export function keepReversals<R extends ReversalRow>(
    prev: KeptReversals<R> | undefined,
    now: { isReady: boolean; entryIds: readonly string[]; rows: readonly R[] | undefined }
): {
    next: KeptReversals<R> | undefined
    rows: readonly R[]
    isKnown: (entryId: string) => boolean
} {
    if (!now.isReady) {
        return {
            next: prev,
            rows: prev?.rows ?? NO_ROWS,
            isKnown: entryId => prev?.ids.has(entryId) ?? false,
        }
    }
    const rows = now.rows ?? NO_ROWS
    const signature = signatureOf(now.entryIds, rows)
    const next =
        prev?.signature === signature ? prev : { ids: new Set(now.entryIds), rows, signature }
    return { next, rows: next.rows, isKnown: () => true }
}
