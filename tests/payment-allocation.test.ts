import { describe, expect, it } from 'vitest'
import { centsToText } from '../tinycld/books/lib/money-text'
import {
    amountToApply,
    amountToCredit,
    clearPayments,
    entryCents,
    followedAmount,
    type OutstandingRow,
    payAll,
    spreadAmount,
    tickRow,
    toggleRow,
    typeRowPayment,
    untickRow,
} from '../tinycld/books/lib/payment-allocation'
import type { PaymentEntry } from '../tinycld/books/lib/payment-values'

// The pure allocation rules of the receive-payment form (spec §3.4): every amount is
// integer cents through the shared money helpers.

const USD = 'USD'

// Three open invoices in list order (oldest due first), open 480.00, 750.00, 2,111.77.
const ROWS: OutstandingRow[] = [
    {
        id: 'invoverdue00001',
        number: '1006',
        date: '2026-09-02',
        due_date: '2026-10-02',
        total: 48_000,
        open: 48_000,
    },
    {
        id: 'invpartly000001',
        number: '1009',
        date: '2026-10-20',
        due_date: '2026-11-19',
        total: 125_000,
        open: 75_000,
    },
    {
        id: 'invopen00000001',
        number: '1011',
        date: '2026-10-28',
        due_date: '2026-11-27',
        total: 211_177,
        open: 211_177,
    },
]
const [OVERDUE, PARTLY, OPEN] = ROWS

type Payments = Record<string, PaymentEntry>

// Each listed payment in cents, by invoice id.
function centsById(payments: Payments): Record<string, number> {
    return Object.fromEntries(
        Object.entries(payments).map(([id, entry]) => [id, entryCents(entry, USD)])
    )
}

function entry(row: OutstandingRow, amount: string): PaymentEntry {
    return { amount, open: row.open, number: row.number }
}

describe('spreadAmount', () => {
    it('spreads 1,243.56 oldest due first, each row up to its open balance', () => {
        expect(centsById(spreadAmount(ROWS, 124_356))).toEqual({
            [OVERDUE.id]: 48_000,
            [PARTLY.id]: 75_000,
            [OPEN.id]: 1_356,
        })
    })

    it('pays every row in full when the amount is above them all, the rest a credit', () => {
        const spread = spreadAmount(ROWS, 500_000)
        expect(centsById(spread)).toEqual({
            [OVERDUE.id]: 48_000,
            [PARTLY.id]: 75_000,
            [OPEN.id]: 211_177,
        })
        expect(amountToCredit(500_000, amountToApply(spread, USD))).toBe(165_823)
    })

    it('pays nothing for 0', () => {
        expect(spreadAmount(ROWS, 0)).toEqual({})
    })

    it('keeps each row’s open balance and number on its entry', () => {
        const spread = spreadAmount(ROWS, 124_356)
        expect(spread[OPEN.id]).toMatchObject({ open: OPEN.open, number: OPEN.number })
    })
})

describe('amountToCredit', () => {
    it('is 0 when nothing is left over or the amount is empty', () => {
        expect(amountToCredit(100, 100)).toBe(0)
        expect(amountToCredit(100, 250)).toBe(0)
        expect(amountToCredit(null, 0)).toBe(0)
    })
})

describe('row edits', () => {
    it('tickRow sets the row to its open balance', () => {
        expect(centsById(tickRow({}, PARTLY))).toEqual({ [PARTLY.id]: 75_000 })
    })

    it('untickRow removes the row', () => {
        const ticked = tickRow(tickRow({}, OVERDUE), PARTLY)
        expect(Object.keys(untickRow(ticked, OVERDUE.id))).toEqual([PARTLY.id])
    })

    it('typeRowPayment removes the row at 0.00 and keeps a typed 12.5 as 1250', () => {
        const ticked = tickRow({}, OVERDUE)
        expect(typeRowPayment(ticked, OVERDUE, '0.00')).toEqual({})
        expect(centsById(typeRowPayment({}, OVERDUE, '12.5'))).toEqual({ [OVERDUE.id]: 1_250 })
    })

    it('toggleRow takes the open balance of a missing or zero row and clears a filled one', () => {
        expect(centsById(toggleRow({}, PARTLY, USD))).toEqual({ [PARTLY.id]: 75_000 })
        const zero = { [PARTLY.id]: entry(PARTLY, '0.00') }
        expect(centsById(toggleRow(zero, PARTLY, USD))).toEqual({ [PARTLY.id]: 75_000 })
        const filled = { [PARTLY.id]: entry(PARTLY, '10.00') }
        expect(toggleRow(filled, PARTLY, USD)).toEqual({})
    })

    it('payAll pays every row in full', () => {
        expect(centsById(payAll(ROWS))).toEqual({
            [OVERDUE.id]: 48_000,
            [PARTLY.id]: 75_000,
            [OPEN.id]: 211_177,
        })
    })

    it('clearPayments is empty', () => {
        expect(clearPayments()).toEqual({})
    })
})

describe('amountToApply and entryCents', () => {
    it('sums integer cents, so 0.10 + 0.20 is 30', () => {
        const payments = {
            [OVERDUE.id]: entry(OVERDUE, '0.10'),
            [PARTLY.id]: entry(PARTLY, '0.20'),
        }
        expect(amountToApply(payments, USD)).toBe(30)
    })

    it('counts a missing or unparsable entry as 0', () => {
        expect(entryCents(undefined, USD)).toBe(0)
        expect(entryCents(entry(OVERDUE, 'abc'), USD)).toBe(0)
    })
})

describe('followedAmount', () => {
    it('is empty at zero', () => {
        expect(followedAmount({}, USD)).toBe('')
    })

    it('is the text of the amount to apply otherwise', () => {
        const spread = spreadAmount(ROWS, 124_356)
        expect(followedAmount(spread, USD)).toBe(centsToText(124_356))
        expect(followedAmount(tickRow({}, OVERDUE), USD)).toBe('480.00')
    })
})
