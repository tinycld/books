import { describe, expect, it } from 'vitest'
import { reconcileTotals } from '../tinycld/books/lib/reconcile'
import { reconcileHints } from '../tinycld/books/lib/reconcile-hints'
import type { BooksReconcileLines } from '../tinycld/books/types'

// Reconcile spec §3 "Hint line": the five hints of `reconcileHints`, their order, their
// texts and their actions, computed over the lines query's rows. The difference comes from
// `reconcileTotals` over the same rows, as the work screen computes it. A bank balance is
// the money in the account (a deposit raises it); a card balance is the amount owed (a
// charge raises it). So a bank difference above 0 is closed by a deposit and one below 0 by
// a payment; a card's is the opposite.
//
// Hint 4 ("wrong side") reads, for the transaction it names, "Check that <its side> was not
// entered as <the other side>.": the spec's example names a bank payment with "money out
// … money in"; a card says "a charge" / "a payment".

type LineRow = BooksReconcileLines & { isCleared: boolean; clearedId: string }

function line(seed: Partial<LineRow> & Pick<LineRow, 'id'>): LineRow {
    return {
        line: seed.id,
        account: 'acctreconcile01',
        entry: `entry-${seed.id}`,
        date: '2026-10-12',
        debit: 0,
        credit: 0,
        memo: '',
        number: '10',
        sequence: 10,
        doc_type: 'journal',
        origin: 'manual',
        document: '',
        payee: '',
        reconciliation: '',
        finished: false,
        bank_matched: false,
        isCleared: false,
        clearedId: '',
        ...seed,
    }
}

function clearedLine(seed: Partial<LineRow> & Pick<LineRow, 'id'>): LineRow {
    // The cleared fields come after the seed: callers pass full rows from `line`, which
    // carry `isCleared: false` and `clearedId: ''`.
    return line({
        ...seed,
        reconciliation: 'recnhintscreen1',
        isCleared: true,
        clearedId: `c-${seed.id}`,
    })
}

// Expense 12, a bank payment of $250.00 (the credit side).
function expense12(seed: Partial<LineRow> = {}): LineRow {
    return line({
        id: 'lnexpense000012',
        doc_type: 'expense',
        origin: 'document',
        document: 'docexpense00012',
        number: '12',
        credit: 25_000,
        ...seed,
    })
}

// Payment 1003, a customer payment of $500.00 into the bank (the debit side). The spec's
// example says "Deposit 1003"; Books has no deposit doc type yet, so the name is the
// payment's.
function deposit1003(seed: Partial<LineRow> = {}): LineRow {
    return line({
        id: 'lndeposit001003',
        doc_type: 'payment',
        origin: 'document',
        document: 'docdeposit01003',
        number: '1003',
        debit: 50_000,
        ...seed,
    })
}

type Context = Parameters<typeof reconcileHints>[3]

const BANK: Context = {
    accountType: 'bank',
    statementDate: '2026-10-31',
    currency: 'USD',
    connectionId: 'bankconn0000001',
}

const CARD: Context = { ...BANK, accountType: 'credit_card' }

// The hints of `rows` against a statement whose balance makes the difference `difference`:
// the beginning balance is 0, so the statement balance is the cleared balance plus it.
function hintsOf(
    rows: readonly LineRow[],
    difference: number,
    options: { context?: Context; reviewCount?: number } = {}
) {
    const context = options.context ?? BANK
    const base = reconcileTotals(
        rows,
        {
            beginning_balance: 0,
            statement_balance: 0,
            has_statement_totals: false,
            statement_out: 0,
            statement_in: 0,
        },
        context.accountType
    )
    const totals = reconcileTotals(
        rows,
        {
            beginning_balance: 0,
            statement_balance: base.clearedBalance + difference,
            has_statement_totals: false,
            statement_out: 0,
            statement_in: 0,
        },
        context.accountType
    )
    expect(totals.difference).toBe(difference)
    return reconcileHints(rows, totals, options.reviewCount ?? 0, context)
}

function idsOf(hints: readonly { id: string }[]): string[] {
    return hints.map(hint => hint.id)
}

describe('reconcileHints', () => {
    it('review: For review bank transactions up to the statement date, with Open Banking', () => {
        // $1.00 does not divide by 9 and no row is near it: the review hint is the only one.
        const hints = hintsOf([], 100, { reviewCount: 3 })
        expect(hints).toEqual([
            {
                id: 'review',
                text: '3 bank transactions up to Oct 31, 2026 are still in For review. Review them first.',
                action: { label: 'Open Banking', kind: 'banking' },
            },
        ])
    })

    it('review: one bank transaction reads in the singular', () => {
        const [hint] = hintsOf([], 100, { reviewCount: 1 })
        expect(hint?.id).toBe('review')
        expect(hint?.text).toMatch(
            /^1 bank transaction up to Oct 31, 2026 is still in For review\. /
        )
    })

    it('review: no For review bank transaction gives no review hint', () => {
        expect(idsOf(hintsOf([], 100, { reviewCount: 0 }))).toEqual([])
    })

    it('one: clearing one transaction that is not cleared makes the difference zero, with Show on its row', () => {
        // A payment of $250.00 is not cleared and the difference is −$250.00.
        const hints = hintsOf([expense12()], -25_000)
        expect(hints).toEqual([
            {
                id: 'one',
                text: 'Clearing Expense 12 ($250.00) makes the difference zero.',
                action: { label: 'Show', kind: 'show-row', lineId: 'lnexpense000012' },
            },
        ])
    })

    it('one: several transactions of that amount put the amount in the search', () => {
        const rows = [
            expense12(),
            expense12({ id: 'lnexpense000013', number: '13', document: 'docexpense00013' }),
            expense12({ id: 'lnexpense000014', number: '14', document: 'docexpense00014' }),
        ]
        const hints = hintsOf(rows, -25_000)
        expect(idsOf(hints)).toEqual(['one'])
        const [hint] = hints
        expect(hint?.text).toBe(
            '3 transactions of $250.00 are not cleared. Clearing one makes the difference zero.'
        )
        expect(hint?.action).toMatchObject({ label: 'Show', kind: 'show-amount' })
        expect(hint?.action?.lineId).toBeUndefined()
        // The amount the search gets: $250.00, as cents or as text.
        expect([25_000, '250.00', '$250.00']).toContain(hint?.action?.amount)
    })

    it('one: a deposit of the amount does not close a difference that a payment closes', () => {
        // −$250.00 needs a payment; the deposit of $250.00 would make it −$500.00.
        const deposit = deposit1003({ debit: 25_000 })
        expect(idsOf(hintsOf([deposit], -25_000))).toEqual([])
        // +$250.00 needs a deposit; the payment of $250.00 would make it +$500.00.
        expect(idsOf(hintsOf([expense12()], 25_000))).toEqual([])
        // The same deposit closes +$250.00.
        expect(idsOf(hintsOf([deposit], 25_000))).toEqual(['one'])
    })

    it('one: a cleared transaction of the amount is not a transaction to clear', () => {
        const cleared = clearedLine({ ...expense12(), id: 'lnexpense000012' })
        expect(idsOf(hintsOf([cleared], -25_000)).includes('one')).toBe(false)
    })

    it('one-cleared: without one cleared transaction the difference is zero, with Show on its row', () => {
        // The deposit of $500.00 is cleared and the cleared balance is $500.00 over.
        const cleared = clearedLine({ ...deposit1003(), id: 'lndeposit001003' })
        const hints = hintsOf([cleared], -50_000)
        expect(hints).toEqual([
            {
                id: 'one-cleared',
                text: 'Without Payment 1003 ($500.00) the difference is zero. Check that it is on the statement.',
                action: { label: 'Show', kind: 'show-row', lineId: 'lndeposit001003' },
            },
        ])
    })

    it('one-cleared: un-clearing a cleared payment closes a positive bank difference, not a negative one', () => {
        const cleared = clearedLine({ ...expense12(), id: 'lnexpense000012' })
        expect(idsOf(hintsOf([cleared], 25_000)).includes('one-cleared')).toBe(true)
        expect(idsOf(hintsOf([cleared], -25_000)).includes('one-cleared')).toBe(false)
    })

    it('wrong-side: a cleared payment of half the difference, on a bank account', () => {
        // The statement is $500.00 above the cleared balance: Expense 12, a cleared payment
        // of $250.00, read as a deposit would close it.
        const cleared = clearedLine({ ...expense12(), id: 'lnexpense000012' })
        const hints = hintsOf([cleared], 50_000)
        expect(hints).toEqual([
            {
                id: 'wrong-side',
                text: 'Expense 12 ($250.00) is half the difference. Check that money out was not entered as money in.',
            },
        ])
    })

    it('wrong-side: a cleared deposit of half a positive bank difference is not on the side that fits', () => {
        const deposit = clearedLine({ ...deposit1003({ debit: 25_000 }), id: 'lndeposit001003' })
        expect(idsOf(hintsOf([deposit], 50_000))).toEqual([])
        // Below 0 the deposit fits.
        expect(hintsOf([deposit], -50_000)).toEqual([
            {
                id: 'wrong-side',
                text: 'Payment 1003 ($250.00) is half the difference. Check that money in was not entered as money out.',
            },
        ])
    })

    it('wrong-side: a credit card account names its own sides', () => {
        // The card's statement owes $200.00 more than the cleared balance: a cleared payment
        // of $100.00 (the debit side lowers what is owed) read as a charge would close it.
        const payment = clearedLine({ id: 'lncardpayment01', number: '7', debit: 10_000 })
        const charge = clearedLine({ id: 'lncardcharge001', number: '8', credit: 10_000 })
        expect(hintsOf([payment], 20_000, { context: CARD })).toEqual([
            {
                id: 'wrong-side',
                text: 'Journal entry 7 ($100.00) is half the difference. Check that a payment was not entered as a charge.',
            },
        ])
        expect(idsOf(hintsOf([charge], 20_000, { context: CARD }))).toEqual([])
        expect(hintsOf([charge], -20_000, { context: CARD })).toEqual([
            {
                id: 'wrong-side',
                text: 'Journal entry 8 ($100.00) is half the difference. Check that a charge was not entered as a payment.',
            },
        ])
    })

    it('one: a credit card difference above 0 is closed by a charge, not by a payment', () => {
        const charge = line({ id: 'lncardcharge001', number: '8', credit: 10_000 })
        const payment = line({ id: 'lncardpayment01', number: '7', debit: 10_000 })
        expect(hintsOf([charge], 10_000, { context: CARD })).toEqual([
            {
                id: 'one',
                text: 'Clearing Journal entry 8 ($100.00) makes the difference zero.',
                action: { label: 'Show', kind: 'show-row', lineId: 'lncardcharge001' },
            },
        ])
        expect(idsOf(hintsOf([payment], 10_000, { context: CARD }))).toEqual([])
    })

    it('digits: a difference that divides by 9, shown without its sign', () => {
        expect(hintsOf([], -2_700)).toEqual([
            {
                id: 'digits',
                text: 'The difference, $27.00, divides by 9. Two digits of an amount may be swapped, for example $54.00 entered as $45.00.',
            },
        ])
    })

    it('digits: 9 cents gives the hint and 10 cents does not', () => {
        const [nine] = hintsOf([], 9)
        expect(nine?.id).toBe('digits')
        expect(nine?.text).toMatch(/^The difference, \$0\.09, divides by 9\. /)
        expect(idsOf(hintsOf([], 10))).toEqual([])
    })

    it('a difference of 0 gives no hint, also with For review bank transactions', () => {
        const rows = [expense12(), clearedLine({ ...deposit1003(), id: 'lndeposit001003' })]
        expect(hintsOf(rows, 0, { reviewCount: 3 })).toEqual([])
    })

    it('the order when all five apply: review, one, one-cleared, wrong-side, digits', () => {
        // The difference is −$27.00: Expense 12 of $27.00 is not cleared (one), Payment 1003 of
        // $27.00 is cleared (one-cleared), Payment 1004 of $13.50 is cleared (wrong-side), and
        // 2,700 cents divide by 9 (digits).
        const rows = [
            clearedLine({
                ...deposit1003({ debit: 1_350 }),
                id: 'lndeposit001004',
                number: '1004',
            }),
            expense12({ credit: 2_700 }),
            clearedLine({ ...deposit1003({ debit: 2_700 }), id: 'lndeposit001003' }),
        ]
        const hints = hintsOf(rows, -2_700, { reviewCount: 2 })
        expect(idsOf(hints)).toEqual(['review', 'one', 'one-cleared', 'wrong-side', 'digits'])
        expect(hints.map(hint => hint.text)).toEqual([
            '2 bank transactions up to Oct 31, 2026 are still in For review. Review them first.',
            'Clearing Expense 12 ($27.00) makes the difference zero.',
            'Without Payment 1003 ($27.00) the difference is zero. Check that it is on the statement.',
            'Payment 1004 ($13.50) is half the difference. Check that money in was not entered as money out.',
            'The difference, $27.00, divides by 9. Two digits of an amount may be swapped, for example $54.00 entered as $45.00.',
        ])
    })
})
