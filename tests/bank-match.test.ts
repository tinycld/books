import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    BasicIndex,
    createCollection,
    createLiveQueryCollection,
    eq,
    localOnlyCollectionOptions,
} from '@tanstack/db'
import { describe, expect, it } from 'vitest'
import {
    canMatchLine,
    defaultFindRange,
    findEmptyText,
    findRangeSchema,
    findViewState,
    findWhere,
    lineAmount,
    MATCH_DAYS_AFTER,
    MATCH_DAYS_BEFORE,
    MATCH_MAX_LINES,
    MATCH_TRANSPORT_TEXT,
    type MatchSide,
    matchableLines,
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

    it('is disabled with the size hint above 50 chosen rows, and enabled at 50', () => {
        expect(matchSubmitState({ ...exact, chosenCount: 51 })).toEqual({
            isDisabled: true,
            hint: 'A match holds at most 50 Books transactions.',
        })
        expect(matchSubmitState({ ...exact, chosenCount: 50 })).toEqual({
            isDisabled: false,
            hint: undefined,
        })
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

    it('adds the skipped rows that need a choice', () => {
        const four = { done: ['a', 'b', 'c', 'd'], failed: [] }
        expect(matchResultText(four, 2)).toBe(
            'Matched 4 transactions. 2 need a choice: open them to match.'
        )
        expect(matchResultText(four, 1)).toBe(
            'Matched 4 transactions. 1 needs a choice: open it to match.'
        )
        expect(matchResultText({ done: ['a'], failed: [] }, 0)).toBe('Matched 1 transaction.')
    })

    it('gives only the skipped sentence when nothing was matched', () => {
        expect(matchResultText({ done: [], failed: [] }, 3)).toBe(
            '3 need a choice: open them to match.'
        )
    })
})

describe('matchableLines', () => {
    const posted = { status: 'posted', origin: 'manual' }
    const rows = [
        { id: 'line_keep_1', debit: 0, credit: 1000, entry: posted, matchLine: undefined },
        {
            id: 'line_void',
            debit: 0,
            credit: 1000,
            entry: { status: 'void', origin: 'manual' },
            matchLine: undefined,
        },
        {
            id: 'line_reversal',
            debit: 0,
            credit: 1000,
            entry: { status: 'posted', origin: 'void_reversal' },
            matchLine: undefined,
        },
        {
            id: 'line_matched',
            debit: 0,
            credit: 1000,
            entry: posted,
            matchLine: { id: 'matchline_0001' },
        },
        { id: 'line_no_entry', debit: 0, credit: 1000, entry: undefined, matchLine: undefined },
        { id: 'line_keep_2', debit: 0, credit: 2500, entry: posted, matchLine: undefined },
    ]

    it('drops void, void-reversal, matched and entry-less rows and keeps the others in order', () => {
        const kept = matchableLines(rows)
        expect(kept.map(row => row.id)).toEqual(['line_keep_1', 'line_keep_2'])
        expect(kept[0]).toBe(rows[0])
        expect(kept[1]).toBe(rows[5])
    })

    it('gives no rows for no rows', () => {
        expect(matchableLines([])).toEqual([])
    })
})

// One journal line of the find query, flattened: the line's own fields and, from its
// joined entry, customer and vendor, the entry number, status, origin and memo and the
// names. A line with no customer or vendor has no name (the left join finds no row).
type FindRow = {
    id: string
    account: string
    posted: boolean
    debit: number
    credit: number
    date: string
    number: string
    entry_status: string
    entry_origin: string
    customer_name?: string
    vendor_name?: string
    memo: string
    entry_memo: string
}

// A books_bank_match_lines row: the journal line it matches.
type MatchLineRow = { id: string; line: string }

const CHECKING_ACCOUNT = 'acctchecking001'
const SAVINGS_ACCOUNT = 'acctsavings0001'

function findRow(seed: Partial<FindRow> & { id: string }): FindRow {
    return {
        account: CHECKING_ACCOUNT,
        posted: true,
        debit: 0,
        credit: 3000,
        date: '2026-08-01',
        number: '9000',
        entry_status: 'posted',
        entry_origin: 'manual',
        customer_name: '',
        vendor_name: '',
        memo: '',
        entry_memo: '',
        ...seed,
    }
}

const FIND_ROWS: FindRow[] = [
    // On the From day, number 1007, customer Acme.
    findRow({
        id: 'find_from_edge',
        credit: 10000,
        date: '2026-06-05',
        number: '1007',
        customer_name: 'Acme Corp',
    }),
    // On the To day, an amount of 86.47.
    findRow({
        id: 'find_to_edge',
        credit: 8647,
        date: '2026-09-10',
        number: '1010',
        vendor_name: 'Office Depot',
        memo: 'paper',
    }),
    // Money in: a debit.
    findRow({ id: 'find_debit', debit: 5000, credit: 0, number: '1011', vendor_name: 'Acme' }),
    findRow({ id: 'find_before', date: '2026-06-04', number: '1007', customer_name: 'Acme' }),
    findRow({ id: 'find_after', date: '2026-09-11', number: '1007', customer_name: 'Acme' }),
    findRow({ id: 'find_other_acct', account: SAVINGS_ACCOUNT, number: '1007' }),
    findRow({ id: 'find_draft', posted: false, number: '1007', customer_name: 'Acme' }),
    // 1007 only in the entry memo, acme only in the vendor name.
    findRow({
        id: 'find_entry_memo',
        credit: 2000,
        date: '2026-08-15',
        number: '2001',
        vendor_name: 'acme tools',
        entry_memo: 'ref 1007',
    }),
    // 1007 in the number, acme only in the line memo.
    findRow({
        id: 'find_line_memo',
        credit: 2500,
        date: '2026-08-16',
        number: '1007',
        memo: 'Acme refund',
    }),
    // 1007 without acme anywhere.
    findRow({ id: 'find_no_acme', credit: 2600, date: '2026-08-17', number: '1007' }),
    // Money in of 86.47.
    findRow({ id: 'find_debit_8647', debit: 8647, credit: 0, date: '2026-08-18', number: '1012' }),
    // The amount's text in a memo.
    findRow({
        id: 'find_memo_8647',
        credit: 1200,
        date: '2026-08-19',
        number: '1013',
        memo: '86.47 deposit slip',
    }),
]

// Runs findWhere over a real local collection of journal lines (FIND_ROWS unless given),
// left-joined to a real local collection of match lines on `line`, as the find query
// joins books_bank_match_lines, and returns the ids it keeps, sorted.
async function findIds(input: {
    side: 'debit' | 'credit'
    search?: string
    rows?: FindRow[]
    matched?: MatchLineRow[]
}) {
    const lines = createCollection(
        localOnlyCollectionOptions({
            id: `find-where-${Math.random()}`,
            getKey: (row: FindRow) => row.id,
            initialData: input.rows ?? FIND_ROWS,
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        })
    )
    const matchLines = createCollection(
        localOnlyCollectionOptions({
            id: `find-match-lines-${Math.random()}`,
            getKey: (row: MatchLineRow) => row.id,
            initialData: input.matched ?? [],
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        })
    )
    const live = createLiveQueryCollection({
        query: query =>
            query
                .from({ line: lines })
                .leftJoin({ matchLine: matchLines }, ({ line, matchLine }) =>
                    eq(line.id, matchLine.line)
                )
                .where(({ line, matchLine }) =>
                    findWhere(
                        {
                            account: line.account,
                            posted: line.posted,
                            debit: line.debit,
                            credit: line.credit,
                            date: line.date,
                            number: line.number,
                            entryStatus: line.entry_status,
                            entryOrigin: line.entry_origin,
                            matchLineId: matchLine.id,
                            customerName: line.customer_name,
                            vendorName: line.vendor_name,
                            lineMemo: line.memo,
                            entryMemo: line.entry_memo,
                        },
                        {
                            account: CHECKING_ACCOUNT,
                            side: input.side,
                            from: '2026-06-05',
                            to: '2026-09-10',
                            search: input.search ?? '',
                            currency: 'USD',
                        }
                    )
                )
                .select(({ line }) => ({ id: line.id })),
        startSync: true,
    })
    await live.preload()
    return live.toArray.map(row => row.id).sort()
}

describe('findWhere', () => {
    const MONEY_OUT_IN_RANGE = [
        'find_entry_memo',
        'find_from_edge',
        'find_line_memo',
        'find_memo_8647',
        'find_no_acme',
        'find_to_edge',
    ]

    it('asks money out for a credit, posted, on the account, from and to included', async () => {
        expect(await findIds({ side: 'credit' })).toEqual(MONEY_OUT_IN_RANGE)
    })

    it('asks money in for a debit', async () => {
        expect(await findIds({ side: 'debit' })).toEqual(['find_debit', 'find_debit_8647'])
    })

    it('needs every piece in the number, a name or a memo', async () => {
        expect(await findIds({ side: 'credit', search: '1007 acme' })).toEqual([
            'find_entry_memo',
            'find_from_edge',
            'find_line_memo',
        ])
        expect(await findIds({ side: 'credit', search: 'office' })).toEqual(['find_to_edge'])
        expect(await findIds({ side: 'credit', search: 'PAPER' })).toEqual(['find_to_edge'])
    })

    it("also finds an amount on the side's field", async () => {
        expect(await findIds({ side: 'credit', search: '86.47' })).toEqual([
            'find_memo_8647',
            'find_to_edge',
        ])
        expect(await findIds({ side: 'debit', search: '86.47' })).toEqual(['find_debit_8647'])
    })

    it('adds no search clause for an empty search', async () => {
        expect(await findIds({ side: 'credit', search: '' })).toEqual(MONEY_OUT_IN_RANGE)
        expect(await findIds({ side: 'credit', search: '   ' })).toEqual(MONEY_OUT_IN_RANGE)
    })

    // The drops live in the query, so a page of dropped lines cannot hide later pages.
    it('drops void, void-reversal and matched lines in the query', async () => {
        const rows = [
            findRow({ id: 'find_void', date: '2026-08-04', entry_status: 'void' }),
            findRow({ id: 'find_reversal', date: '2026-08-03', entry_origin: 'void_reversal' }),
            findRow({ id: 'find_matched', date: '2026-08-02' }),
            findRow({ id: 'find_matchable', date: '2026-08-01' }),
        ]
        const matched = [{ id: 'matchline_0001', line: 'find_matched' }]
        expect(await findIds({ side: 'credit', rows, matched })).toEqual(['find_matchable'])
    })

    // A line with no customer and no vendor: the left joins find no row, so both names
    // are undefined.
    it('finds a line with no customer or vendor by its number or its memo', async () => {
        const rows = [
            findRow({
                id: 'find_nameless_number',
                date: '2026-08-05',
                number: '3001',
                customer_name: undefined,
                vendor_name: undefined,
            }),
            findRow({
                id: 'find_nameless_memo',
                date: '2026-08-06',
                number: '3002',
                customer_name: undefined,
                vendor_name: undefined,
                memo: 'Quarterly rent',
            }),
        ]
        expect(await findIds({ side: 'credit', rows, search: '3001' })).toEqual([
            'find_nameless_number',
        ])
        expect(await findIds({ side: 'credit', rows, search: 'rent' })).toEqual([
            'find_nameless_memo',
        ])
    })
})

describe('findViewState', () => {
    it('is the error when the load failed, so Retry is offered', () => {
        expect(findViewState(true, false, 0, true)).toBe('error')
        expect(findViewState(true, true, 3, false)).toBe('error')
    })

    it('is loading before the first page', () => {
        expect(findViewState(false, false, 0, false)).toBe('loading')
    })

    it('is loading, not empty, while later pages exist and no row is kept yet', () => {
        expect(findViewState(false, true, 0, true)).toBe('loading')
    })

    it('is empty only when no later page exists', () => {
        expect(findViewState(false, true, 0, false)).toBe('empty')
    })

    it('is ready with rows', () => {
        expect(findViewState(false, true, 2, true)).toBe('ready')
        expect(findViewState(false, true, 2, false)).toBe('ready')
    })
})

describe('defaultFindRange', () => {
    it('runs from 90 days before to 7 days after the bank date', () => {
        expect(defaultFindRange('2026-09-03')).toEqual({ from: '2026-06-05', to: '2026-09-10' })
    })
})

describe('findRangeSchema', () => {
    it('accepts From equal to To', () => {
        expect(findRangeSchema.safeParse({ from: '2026-09-03', to: '2026-09-03' }).success).toBe(
            true
        )
        expect(findRangeSchema.safeParse({ from: '2026-06-05', to: '2026-09-10' }).success).toBe(
            true
        )
    })

    it('refuses From after To on the from path', () => {
        const parsed = findRangeSchema.safeParse({ from: '2026-09-11', to: '2026-09-10' })
        expect(parsed.success).toBe(false)
        expect(parsed.error?.issues.map(issue => [issue.path, issue.message])).toEqual([
            [['from'], 'From must be on or before To.'],
        ])
    })

    it('refuses an empty or malformed day', () => {
        for (const bad of ['', '2026-13-01', '2026-11-31', 'Sep 3, 2026', '2026-9-3']) {
            expect(findRangeSchema.safeParse({ from: bad, to: '2026-09-10' }).success, bad).toBe(
                false
            )
            expect(findRangeSchema.safeParse({ from: '2026-06-05', to: bad }).success, bad).toBe(
                false
            )
        }
    })
})

describe('findEmptyText', () => {
    it('names the account and the range', () => {
        expect(findEmptyText('1000 Business Checking', '2026-06-05', '2026-09-10', false)).toBe(
            'No Books transaction on 1000 Business Checking from Jun 5 to Sep 10, 2026.'
        )
    })

    it('speaks of the search under a search', () => {
        expect(findEmptyText('1000 Business Checking', '2026-06-05', '2026-09-10', true)).toBe(
            'No Books transaction matches this search.'
        )
    })

    it('shows both years for a range across a year', () => {
        expect(findEmptyText('1000 Business Checking', '2025-12-01', '2026-01-15', false)).toBe(
            'No Books transaction on 1000 Business Checking from Dec 1, 2025 to Jan 15, 2026.'
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
