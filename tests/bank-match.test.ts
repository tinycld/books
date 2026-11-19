import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    canMatchLine,
    lineAmount,
    MATCH_DAYS_AFTER,
    MATCH_DAYS_BEFORE,
    MATCH_MAX_LINES,
    MATCH_TRANSPORT_TEXT,
    type MatchSide,
    matchEmptyText,
    matchResultText,
    matchSendingFor,
    matchSide,
    matchSubmitState,
    matchTotals,
    suggestionsByTxn,
    suggestionText,
} from '../tinycld/books/lib/bank-match'

// The cases the Go test of the create hook also runs (server/testdata/bank_match_cases.json).
type MatchCase = {
    name: string
    bankAmount: number
    line: {
        debit: number
        credit: number
        sameAccount: boolean
        entryStatus: string
        origin: string
        matched: boolean
        daysFromBank: number
    }
    side: MatchSide
    canMatch: boolean
    suggested: boolean
}

const cases: MatchCase[] = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'bank_match_cases.json'), 'utf8')
)

const TRANSFER_1007 = {
    number: '1007',
    doc_type: 'transfer' as const,
    origin: 'manual' as const,
    date: '2026-09-03',
}

const CHOOSE_HINT = 'Choose Books transactions that add up to $868.15.'

describe('the constants', () => {
    it('holds the window, the size limit and the transport text', () => {
        expect(MATCH_DAYS_BEFORE).toBe(90)
        expect(MATCH_DAYS_AFTER).toBe(7)
        expect(MATCH_MAX_LINES).toBe(50)
        expect(MATCH_TRANSPORT_TEXT).toBe(
            'The match could not be sent. Check your connection and try again.'
        )
    })
})

describe('the shared cases (server/testdata/bank_match_cases.json)', () => {
    it('has cases to run', () => {
        expect(cases.length).toBeGreaterThan(10)
    })

    for (const testCase of cases) {
        it(testCase.name, () => {
            expect(matchSide(testCase.bankAmount)).toBe(testCase.side)
            const { debit, credit, sameAccount, entryStatus, origin, matched } = testCase.line
            expect(
                canMatchLine({
                    bankAmount: testCase.bankAmount,
                    debit,
                    credit,
                    sameAccount,
                    entryStatus,
                    origin,
                    matched,
                })
            ).toBe(testCase.canMatch)
        })
    }
})

describe('lineAmount', () => {
    it('reads the debit of a debit line and the credit of a credit line', () => {
        expect(lineAmount({ debit: 86815, credit: 0 })).toBe(86815)
        expect(lineAmount({ debit: 0, credit: 12000 })).toBe(12000)
    })
})

describe('matchTotals', () => {
    it('gives no difference for an equal choice', () => {
        expect(matchTotals(86815, [{ debit: 86815, credit: 0 }])).toEqual({
            target: 86815,
            chosen: 86815,
            difference: 0,
        })
    })

    it('gives the shortfall of a short choice', () => {
        expect(matchTotals(86815, [{ debit: 74815, credit: 0 }])).toEqual({
            target: 86815,
            chosen: 74815,
            difference: 12000,
        })
    })

    it('gives a difference that is never negative for an over choice', () => {
        expect(matchTotals(86815, [{ debit: 98815, credit: 0 }])).toEqual({
            target: 86815,
            chosen: 98815,
            difference: 12000,
        })
    })

    it('gives the whole amount with no line chosen', () => {
        expect(matchTotals(86815, [])).toEqual({ target: 86815, chosen: 0, difference: 86815 })
    })

    it('takes money out against a credit line', () => {
        expect(matchTotals(-86815, [{ debit: 0, credit: 86815 }])).toEqual({
            target: 86815,
            chosen: 86815,
            difference: 0,
        })
    })

    it('adds several lines', () => {
        expect(
            matchTotals(275500, [
                { debit: 120000, credit: 0 },
                { debit: 95500, credit: 0 },
                { debit: 60000, credit: 0 },
            ])
        ).toEqual({ target: 275500, chosen: 275500, difference: 0 })
    })
})

describe('suggestionsByTxn', () => {
    it('groups the rows by bank transaction and keeps the input order in a group', () => {
        const rows = [
            { id: 's1', bank_transaction: 't1' },
            { id: 's2', bank_transaction: 't2' },
            { id: 's3', bank_transaction: 't1' },
            { id: 's4', bank_transaction: 't3' },
            { id: 's5', bank_transaction: 't1' },
        ]
        const byTxn = suggestionsByTxn(rows)
        expect([...byTxn.keys()].sort()).toEqual(['t1', 't2', 't3'])
        expect(byTxn.get('t1')?.map(row => row.id)).toEqual(['s1', 's3', 's5'])
        expect(byTxn.get('t2')?.map(row => row.id)).toEqual(['s2'])
        expect(byTxn.get('t3')?.map(row => row.id)).toEqual(['s4'])
        expect(byTxn.get('t1')?.[1]).toBe(rows[2])
        expect(byTxn.get('none')).toBeUndefined()
    })

    it('gives an empty map for no rows', () => {
        expect(suggestionsByTxn([]).size).toBe(0)
    })
})

describe('suggestionText', () => {
    it('names the one suggestion and its day on a row', () => {
        expect(suggestionText(1, TRANSFER_1007, 'row')).toBe(
            '1 match · Transfer 1007 · Sep 3, 2026'
        )
    })

    it('names the one suggestion without its day on a card', () => {
        expect(suggestionText(1, TRANSFER_1007, 'card')).toBe('1 match · Transfer 1007')
    })

    it('counts several suggestions', () => {
        expect(suggestionText(3, undefined, 'row')).toBe('3 matches')
        expect(suggestionText(2, undefined, 'card')).toBe('2 matches')
        expect(suggestionText(2, TRANSFER_1007, 'row')).toBe('2 matches')
    })

    it('labels other entry kinds as the register does', () => {
        expect(
            suggestionText(
                1,
                { number: '1002', doc_type: 'expense', origin: 'manual', date: '2026-10-05' },
                'row'
            )
        ).toBe('1 match · Expense 1002 · Oct 5, 2026')
    })
})

describe('matchSubmitState', () => {
    const exact = {
        chosenCount: 1,
        difference: 0,
        target: 86815,
        currency: 'USD',
        isPending: false,
        writesDisabled: false,
        writesHint: undefined,
    }

    it('is disabled with the hint while no row is chosen', () => {
        expect(matchSubmitState({ ...exact, chosenCount: 0, difference: 86815 })).toEqual({
            isDisabled: true,
            hint: CHOOSE_HINT,
        })
    })

    it('is disabled with the hint while the choice differs', () => {
        expect(matchSubmitState({ ...exact, chosenCount: 2, difference: 12000 })).toEqual({
            isDisabled: true,
            hint: CHOOSE_HINT,
        })
    })

    it('is enabled with no hint for an exact choice', () => {
        expect(matchSubmitState(exact)).toEqual({ isDisabled: false, hint: undefined })
    })

    it('gives the server hint while the server takes no writes', () => {
        const writesHint = 'The server is read-only right now.'
        expect(matchSubmitState({ ...exact, writesDisabled: true, writesHint })).toEqual({
            isDisabled: true,
            hint: writesHint,
        })
        expect(
            matchSubmitState({ ...exact, chosenCount: 0, writesDisabled: true, writesHint })
        ).toEqual({ isDisabled: true, hint: writesHint })
    })

    it('is disabled while a batch runs', () => {
        expect(matchSubmitState({ ...exact, isPending: true }).isDisabled).toBe(true)
    })
})

describe('matchEmptyText', () => {
    it('names the amount and the day', () => {
        expect(matchEmptyText(-86815, '2026-09-03', 'USD')).toBe(
            'Books found no transaction of $868.15 near Sep 3, 2026.'
        )
        expect(matchEmptyText(15440, '2026-11-19', 'USD')).toBe(
            'Books found no transaction of $154.40 near Nov 19, 2026.'
        )
    })
})

describe('matchResultText', () => {
    it('counts the matched transactions', () => {
        expect(matchResultText({ done: ['a'], failed: [] }, 0)).toBe('Matched 1 transaction.')
        expect(matchResultText({ done: ['a', 'b', 'c', 'd'], failed: [] }, 0)).toBe(
            'Matched 4 transactions.'
        )
    })
})

describe('matchSendingFor', () => {
    const run = { origin: 'drawer', kind: 'match', ids: ['txn_a'] }

    it("is true only for a drawer match run of this drawer's transaction", () => {
        expect(matchSendingFor(run, 'txn_a')).toBe(true)
        expect(matchSendingFor(run, 'txn_b')).toBe(false)
        expect(matchSendingFor({ ...run, kind: 'exclude' }, 'txn_a')).toBe(false)
        expect(matchSendingFor({ ...run, origin: 'bar' }, 'txn_a')).toBe(false)
        expect(matchSendingFor(null, 'txn_a')).toBe(false)
        expect(matchSendingFor(undefined, 'txn_a')).toBe(false)
    })
})
