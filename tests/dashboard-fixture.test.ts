import { describe, expect, it } from 'vitest'
import { INVOICE_DUE_TOTALS, PAYMENT_DAY_TOTALS } from '../tinycld/books/lib/dashboard-fixture'
import type { BooksInvoiceDueTotals, BooksPaymentDayTotals } from '../tinycld/books/types'

// The fixture's view rows hold the fields the two dashboard views send (spec §4
// "New views"). The assignments are the type check: a fixture row that is not a
// generated view row fails `tinycld-pkg typecheck`. The values are what a later
// checkpoint sums, so they are pinned here.
const DUE: Pick<BooksInvoiceDueTotals, 'id' | 'due_date' | 'balance' | 'count'>[] =
    INVOICE_DUE_TOTALS
const PAID: Pick<BooksPaymentDayTotals, 'id' | 'date' | 'amount' | 'count'>[] = PAYMENT_DAY_TOTALS

function isPositiveInteger(value: number): boolean {
    return Number.isInteger(value) && value > 0
}

describe('dashboard fixture view rows', () => {
    it('gives each invoice due total a unique id equal to its due date and positive whole figures', () => {
        expect(DUE.length).toBeGreaterThan(0)
        expect(new Set(DUE.map(row => row.id)).size).toBe(DUE.length)
        expect(DUE.filter(row => row.id !== row.due_date)).toEqual([])
        expect(
            DUE.filter(row => !isPositiveInteger(row.balance) || !isPositiveInteger(row.count))
        ).toEqual([])
    })

    it('gives each payment day total a unique id equal to its date and positive whole figures', () => {
        expect(PAID.length).toBeGreaterThan(0)
        expect(new Set(PAID.map(row => row.id)).size).toBe(PAID.length)
        expect(PAID.filter(row => row.id !== row.date)).toEqual([])
        expect(
            PAID.filter(row => !isPositiveInteger(row.amount) || !isPositiveInteger(row.count))
        ).toEqual([])
    })
})
