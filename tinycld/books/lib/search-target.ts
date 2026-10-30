// Where a federated search hit opens. The server (server/search.go) prefixes
// each row id with its kind; the screens below are the account register, the
// journal entry screen, the customer screen and the vendor screen.
export interface SearchTarget {
    path: string
    id: string
}

// A Map, so a kind that names an inherited object member (`constructor`,
// `__proto__`) finds no path.
const PATHS = new Map([
    ['account', 'books/accounts/[id]'],
    ['entry', 'books/entries/[id]'],
    ['customer', 'books/customers/[id]'],
    ['vendor', 'books/vendors/[id]'],
])

export function searchTarget(rowId: string): SearchTarget | null {
    const [kind, id] = rowId.split(':')
    const path = PATHS.get(kind)
    if (!path || !id) return null
    return { path, id }
}
