// The routes of customer statements (statements spec §2).

const STATEMENTS_PATH = 'books/statements'

export function statementHref(id: string): string {
    return `${STATEMENTS_PATH}/${encodeURIComponent(id)}`
}

// The create screen; with a customer it opens on Customer balance "All" with only that
// customer ticked.
export function newStatementHref(customerId?: string): string {
    const path = `${STATEMENTS_PATH}/new`
    if (customerId === undefined || customerId === '') return path
    return `${path}?customer=${encodeURIComponent(customerId)}`
}
