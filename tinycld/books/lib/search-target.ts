// Where a federated search hit opens. The server (server/search.go) prefixes
// each row id with its kind; the screens below are built by the chart of
// accounts register and journal entry units.
export interface SearchTarget {
    path: string
    id: string
}

const PATHS: Record<string, string> = {
    account: 'books/accounts/[id]',
    entry: 'books/journal-entries/[id]',
}

export function searchTarget(rowId: string): SearchTarget | null {
    const [kind, id] = rowId.split(':')
    const path = PATHS[kind]
    if (!path || !id) return null
    return { path, id }
}
