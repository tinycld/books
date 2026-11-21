// The routes of customer statements (statements spec §2).
import { CUSTOMERS_PATH, type CustomerRoute, customerPath } from './customer-route'

const STATEMENTS_PATH = 'books/statements'

// The kind route of the customer pages in the Books root stack: the statement screen pops to
// it after a delete when the customer's page is right below (spec §3.8).
export const CUSTOMERS_KIND_ROUTE = CUSTOMERS_PATH.replace(/^books\//, '')

export function statementHref(id: string): string {
    return `${STATEMENTS_PATH}/${encodeURIComponent(id)}`
}

// A customer's Statements tab: where the statement screen goes back to when no screen is
// below it, and where it goes after a delete (spec §3.8). The customer's page itself is
// `customerPath` (lib/customer-route.ts).
export function customerStatementsRoute(customerId: string): CustomerRoute {
    return customerPath(customerId, { tab: 'statements' })
}

// The create screen; with a customer it opens on Customer balance "All" with only that
// customer ticked.
export function newStatementHref(customerId?: string): string {
    const path = `${STATEMENTS_PATH}/new`
    if (customerId === undefined || customerId === '') return path
    return `${path}?customer=${encodeURIComponent(customerId)}`
}
