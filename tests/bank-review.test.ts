import {
    BasicIndex,
    createCollection,
    createLiveQueryCollection,
    localOnlyCollectionOptions,
} from '@tanstack/db'
import { describe, expect, it } from 'vitest'
import {
    EMPTY_REVIEW_FILTERS,
    hasReviewFilter,
    parseSearchAmount,
    REVIEW_TABS,
    type ReviewFilters,
    reviewCountText,
    reviewEmptyText,
    reviewRange,
    reviewTabFromParam,
    reviewTabItems,
    reviewViewState,
    reviewWhere,
    type SettledRows,
    settleRows,
    type TxnStatus,
    txnAmountCells,
    txnPhoneLine,
    txnSecondLine,
} from '../tinycld/books/lib/bank-review'
import {
    REVIEW_CONNECTION_IDS,
    REVIEW_CURRENCY,
    REVIEW_TRANSACTIONS,
} from '../tinycld/books/lib/for-review-fixture'
import type { RegisterRange } from '../tinycld/books/lib/register-range'
import type { BooksBankTransactions } from '../tinycld/books/types'

describe('reviewTabFromParam', () => {
    it('keeps each known tab as it is', () => {
        for (const tab of ['review', 'reviewed', 'excluded', 'files'] as const) {
            expect(reviewTabFromParam(tab)).toBe(tab)
        }
    })

    it('falls back to For review for a missing, empty or unknown param', () => {
        expect(reviewTabFromParam(undefined)).toBe('review')
        expect(reviewTabFromParam('')).toBe('review')
        expect(reviewTabFromParam('foo')).toBe('review')
    })

    it('reads the first value of a repeated param', () => {
        expect(reviewTabFromParam(['excluded', 'files'])).toBe('excluded')
    })
})

describe('reviewTabItems', () => {
    it('labels the tabs in REVIEW_TABS order, with the count on For review only', () => {
        const items = reviewTabItems(12)
        expect(items.map(item => item.label)).toEqual([
            'For review (12)',
            'Reviewed',
            'Excluded',
            'Files',
        ])
        expect(items.map(item => item.value)).toEqual([...REVIEW_TABS])
        expect([...REVIEW_TABS]).toEqual(['review', 'reviewed', 'excluded', 'files'])
    })

    it('shows no count on For review at 0', () => {
        expect(reviewTabItems(0)[0].label).toBe('For review')
    })
})

describe('reviewCountText', () => {
    it('says how many transactions wait, or that none do', () => {
        expect(reviewCountText(0)).toBe('Nothing to review')
        expect(reviewCountText(1)).toBe('1 to review')
        expect(reviewCountText(12)).toBe('12 to review')
    })
})

describe('reviewViewState', () => {
    it('shows the error before anything else', () => {
        expect(
            reviewViewState({ isReady: false, isError: true, rowCount: 0, hasFilter: false })
        ).toBe('error')
        expect(
            reviewViewState({ isReady: true, isError: true, rowCount: 3, hasFilter: true })
        ).toBe('error')
    })

    it('is loading until the read is ready', () => {
        expect(
            reviewViewState({ isReady: false, isError: false, rowCount: 0, hasFilter: false })
        ).toBe('loading')
    })

    it('is ready with rows, with or without a filter', () => {
        expect(
            reviewViewState({ isReady: true, isError: false, rowCount: 3, hasFilter: false })
        ).toBe('ready')
        expect(
            reviewViewState({ isReady: true, isError: false, rowCount: 3, hasFilter: true })
        ).toBe('ready')
    })

    it('tells no-match under a filter from empty without one', () => {
        expect(
            reviewViewState({ isReady: true, isError: false, rowCount: 0, hasFilter: true })
        ).toBe('no-match')
        expect(
            reviewViewState({ isReady: true, isError: false, rowCount: 0, hasFilter: false })
        ).toBe('empty')
    })
})

describe('reviewEmptyText', () => {
    it('gives each tab its empty sentence', () => {
        expect(reviewEmptyText('review', 2)).toBe(
            'Nothing to review. 2 files are waiting to import.'
        )
        expect(reviewEmptyText('review', 1)).toBe('Nothing to review. 1 file is waiting to import.')
        expect(reviewEmptyText('review', 0)).toBe(
            'Nothing to review. Upload a statement and import it to see its transactions here.'
        )
        expect(reviewEmptyText('reviewed', 3)).toBe(
            'No reviewed transactions yet. A transaction moves here when you match or categorize it.'
        )
        expect(reviewEmptyText('excluded', 0)).toBe(
            'No excluded transactions. Exclude a transaction in For review to keep it out of your books.'
        )
    })
})

describe('txnAmountCells', () => {
    it('puts money out in Spent and money in in Received, without a sign', () => {
        expect(txnAmountCells(-8647, 'USD')).toEqual({ spent: '$86.47', received: '' })
        expect(txnAmountCells(425000, 'USD')).toEqual({ spent: '', received: '$4,250.00' })
    })

    it('leaves both cells empty for a zero amount', () => {
        expect(txnAmountCells(0, 'USD')).toEqual({ spent: '', received: '' })
    })
})

describe('txnSecondLine', () => {
    it('joins the memo and the check number', () => {
        expect(txnSecondLine('Window cleaning, Q3', '1043')).toBe(
            'Window cleaning, Q3 · Check 1043'
        )
    })

    it('shows either part alone, and nothing when both are blank', () => {
        expect(txnSecondLine('', '1049')).toBe('Check 1049')
        expect(txnSecondLine('INV-1041', '')).toBe('INV-1041')
        expect(txnSecondLine(' ', '')).toBe('')
    })
})

describe('txnPhoneLine', () => {
    it('reads the day, then the check number when there is one', () => {
        expect(txnPhoneLine('2026-09-30', '1043')).toBe('Sep 30, 2026 · Check 1043')
        expect(txnPhoneLine('2026-09-30', '')).toBe('Sep 30, 2026')
    })
})

describe('parseSearchAmount', () => {
    it('reads a typed amount as unsigned cents', () => {
        expect(parseSearchAmount('86.47', 'USD')).toBe(8647)
        expect(parseSearchAmount('$86.47', 'USD')).toBe(8647)
        expect(parseSearchAmount('-86.47', 'USD')).toBe(8647)
        expect(parseSearchAmount('$1,250', 'USD')).toBe(125000)
        expect(parseSearchAmount('1,250', 'USD')).toBe(125000)
        expect(parseSearchAmount('  86.47 ', 'USD')).toBe(8647)
    })

    it('gives null for text that is not money, and for zero', () => {
        expect(parseSearchAmount('abc', 'USD')).toBeNull()
        expect(parseSearchAmount('1.234', 'USD')).toBeNull()
        expect(parseSearchAmount('0', 'USD')).toBeNull()
    })
})

const CHECKING = REVIEW_CONNECTION_IDS.checking

// A row of 1000 Business Checking, For review, that only the test adds.
function extraRow(
    seed: Pick<BooksBankTransactions, 'id' | 'description' | 'memo' | 'check_number' | 'amount'>
): BooksBankTransactions {
    return {
        ...REVIEW_TRANSACTIONS[0],
        connection: CHECKING,
        status: 'for_review',
        date: '2026-10-10',
        line: 99,
        ...seed,
    }
}

// Runs reviewWhere over a real local collection of the fixture rows (plus `extra`) and
// returns the ids it keeps, sorted.
async function whereIds(
    input: {
        status?: TxnStatus
        filters?: Partial<ReviewFilters>
        range?: RegisterRange | null
    },
    extra: BooksBankTransactions[] = []
) {
    const transactions = createCollection(
        localOnlyCollectionOptions({
            id: `review-where-${Math.random()}`,
            getKey: (row: BooksBankTransactions) => row.id,
            initialData: [...REVIEW_TRANSACTIONS, ...extra],
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        })
    )
    const live = createLiveQueryCollection({
        query: query =>
            query
                .from({ txn: transactions })
                .where(({ txn }) =>
                    reviewWhere(
                        {
                            connection: txn.connection,
                            status: txn.status,
                            description: txn.description,
                            memo: txn.memo,
                            checkNumber: txn.check_number,
                            amount: txn.amount,
                            date: txn.date,
                        },
                        {
                            connection: CHECKING,
                            status: input.status ?? 'for_review',
                            filters: { ...EMPTY_REVIEW_FILTERS, ...input.filters },
                            range: input.range ?? null,
                            currency: REVIEW_CURRENCY,
                        }
                    )
                )
                .select(({ txn }) => ({ id: txn.id })),
        startSync: true,
    })
    await live.preload()
    return live.toArray.map(row => row.id).sort()
}

// The fixture filtered by hand: the checking rows of `status` that `keep` accepts.
function handIds(
    keep: (row: BooksBankTransactions) => boolean,
    status: TxnStatus = 'for_review',
    rows: readonly BooksBankTransactions[] = REVIEW_TRANSACTIONS
) {
    return rows
        .filter(row => row.connection === CHECKING && row.status === status && keep(row))
        .map(row => row.id)
        .sort()
}

function holds(row: BooksBankTransactions, piece: string) {
    const lower = piece.toLowerCase()
    return [row.description, row.memo, row.check_number].some(text =>
        text.toLowerCase().includes(lower)
    )
}

describe('reviewWhere', () => {
    it('keeps every row of the connection and status when nothing is filtered', async () => {
        const ids = await whereIds({})
        expect(ids).toEqual(handIds(() => true))
        expect(ids).toHaveLength(34)
    })

    it('finds a search in the description, case ignored', async () => {
        const ids = await whereIds({ filters: { search: 'office depot' } })
        const expected = handIds(row => row.description.includes('Office Depot'))
        expect(expected).toHaveLength(4)
        expect(ids).toEqual(expected)
    })

    it('finds a search in the memo, and needs every piece in some column', async () => {
        const augustPayroll = handIds(row => row.date === '2026-08-25')
        expect(await whereIds({ filters: { search: 'payroll aug' } })).toEqual(augustPayroll)
        // 'gusto' is only in the description and 'aug' only in the memo.
        expect(await whereIds({ filters: { search: 'gusto%aug' } })).toEqual(augustPayroll)
    })

    it('finds a search in the check number', async () => {
        const check = extraRow({
            id: 'revtxncheck7781',
            description: 'Check written',
            memo: 'Plumber',
            check_number: '7781',
            amount: -5_000,
        })
        expect(await whereIds({ filters: { search: '7781' } }, [check])).toEqual([check.id])
    })

    it('finds an amount spent or received, within the status', async () => {
        const spent = handIds(row => row.amount === -8_647)
        expect(spent).toHaveLength(2)
        expect(await whereIds({ filters: { search: '86.47' } })).toEqual(spent)
        // The +86.47 refund is excluded: only the Excluded tab finds it.
        const refund = handIds(row => row.amount === 8_647, 'excluded')
        expect(refund).toHaveLength(1)
        expect(await whereIds({ status: 'excluded', filters: { search: '$86.47' } })).toEqual(
            refund
        )
    })

    it('cuts the search at %, _ and \\ into plain pieces', async () => {
        // 'b' before 'a': a wildcard reading of 'a%b' or 'a_b' would not match it.
        const reversed = extraRow({
            id: 'revtxnreversed0',
            description: 'BA',
            memo: '',
            check_number: '',
            amount: -1_000,
        })
        const rows = [...REVIEW_TRANSACTIONS, reversed]
        const expected = handIds(row => holds(row, 'a') && holds(row, 'b'), 'for_review', rows)
        expect(expected).toContain(reversed.id)
        for (const search of ['a%b', 'a_b', 'a\\b']) {
            expect(await whereIds({ filters: { search } }, [reversed])).toEqual(expected)
        }
    })

    it('keeps money in for Money in and money out for Money out', async () => {
        expect(await whereIds({ filters: { type: 'in' } })).toEqual(handIds(row => row.amount > 0))
        expect(await whereIds({ filters: { type: 'out' } })).toEqual(handIds(row => row.amount < 0))
    })

    it('keeps the days of the range, both ends included', async () => {
        const september = handIds(row => row.date >= '2026-09-01' && row.date <= '2026-09-30')
        expect(september).toHaveLength(10)
        expect(await whereIds({ range: { start: '2026-09-01', end: '2026-09-30' } })).toEqual(
            september
        )
    })

    it('reads the status it is given', async () => {
        const excluded = handIds(() => true, 'excluded')
        expect(excluded).toHaveLength(4)
        expect(await whereIds({ status: 'excluded' })).toEqual(excluded)
    })

    it('combines the search, the type and the range', async () => {
        const expected = handIds(
            row =>
                row.description.includes('Office Depot') &&
                row.amount < 0 &&
                row.date >= '2026-10-01' &&
                row.date <= '2026-10-31'
        )
        expect(expected).toHaveLength(2)
        expect(
            await whereIds({
                filters: { search: 'office depot', type: 'out' },
                range: { start: '2026-10-01', end: '2026-10-31' },
            })
        ).toEqual(expected)
    })
})

describe('hasReviewFilter', () => {
    it('is false with nothing set, or a search of no pieces', () => {
        expect(hasReviewFilter(EMPTY_REVIEW_FILTERS)).toBe(false)
        expect(hasReviewFilter({ ...EMPTY_REVIEW_FILTERS, search: '  ' })).toBe(false)
        expect(hasReviewFilter({ ...EMPTY_REVIEW_FILTERS, search: '%' })).toBe(false)
    })

    it('is true with a date preset or a type', () => {
        expect(hasReviewFilter({ ...EMPTY_REVIEW_FILTERS, preset: 'this-month' })).toBe(true)
        expect(hasReviewFilter({ ...EMPTY_REVIEW_FILTERS, type: 'out' })).toBe(true)
    })
})

describe('reviewRange', () => {
    it('has no range for All dates, and the preset range otherwise', () => {
        expect(reviewRange('all', '2026-11-07', 1)).toBeNull()
        expect(reviewRange('last-month', '2026-11-07', 1)).toEqual({
            start: '2026-10-01',
            end: '2026-10-31',
        })
    })
})

describe('settleRows', () => {
    const rowA = { id: 'a' }
    const rowB = { id: 'b' }
    const settled = (key: string, rows: { id: string }[]): SettledRows<{ id: string }> => ({
        key,
        rows,
        viewState: 'ready',
    })
    const loading = (key: string, rows: { id: string }[]): SettledRows<{ id: string }> => ({
        key,
        rows,
        viewState: 'loading',
    })

    it('shows a first load as it is', () => {
        const now = loading('q1', [])
        const result = settleRows(undefined, now)
        expect(result.shown).toBe(now)
        expect(result.next).toBeUndefined()
    })

    it('replaces the kept rows with settled rows', () => {
        const prev = settled('q1', [rowA])
        const now = settled('q2', [rowB])
        const result = settleRows(prev, now)
        expect(result.next).toBe(now)
        expect(result.shown).toBe(now)
    })

    it('keeps the last rows while a query under another key loads', () => {
        const prev = settled('q1', [rowA])
        const result = settleRows(prev, loading('q2', []))
        expect(result.shown).toBe(prev)
        expect(result.next).toBe(prev)
    })

    it('shows the current rows in the kept state while the same query loads', () => {
        const prev = settled('q1', [rowA, rowB])
        const now = loading('q1', [rowB])
        const result = settleRows(prev, now)
        expect(result.shown.key).toBe('q1')
        expect(result.shown.viewState).toBe('ready')
        expect(result.shown.rows).toBe(now.rows)
        expect(result.next).toBe(prev)
    })

    it('never keeps a failed load while a query under another key loads', () => {
        const prev: SettledRows<{ id: string }> = { key: 'q1', rows: [], viewState: 'error' }
        const now = loading('q2', [])
        const result = settleRows(prev, now)
        expect(result.shown).toBe(now)
        expect(result.shown.viewState).toBe('loading')
    })

    it('keeps the same object when the settled rows have not changed', () => {
        const prev = settled('q1', [rowA, rowB])
        const result = settleRows(prev, settled('q1', [rowA, rowB]))
        expect(result.next).toBe(prev)
        expect(result.shown).toBe(prev)
    })
})
