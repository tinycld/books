import { describe, expect, it } from 'vitest'
import { partyBalanceSources } from '../tinycld/books/lib/party-balance'

// Where the party page's balance reads (vendor-pages spec §3.2): Open from the party's
// row of books_party_balances, Overdue from the party's own posted documents.
describe('partyBalanceSources', () => {
    it('reads a customer from the customer column and overdue invoices', () => {
        expect(partyBalanceSources('customer')).toEqual({
            balanceField: 'customer',
            overdueCollection: 'books_invoices',
            overdueField: 'customer',
        })
    })

    it('reads a vendor from the vendor column and overdue bills', () => {
        expect(partyBalanceSources('vendor')).toEqual({
            balanceField: 'vendor',
            overdueCollection: 'books_bills',
            overdueField: 'vendor',
        })
    })
})
