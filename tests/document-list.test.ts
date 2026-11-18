import {
    and,
    BasicIndex,
    type Context,
    createCollection,
    createLiveQueryCollection,
    eq,
    type InitialQueryBuilder,
    localOnlyCollectionOptions,
    type QueryBuilder,
    type Ref,
} from '@tanstack/db'
import { describe, expect, it } from 'vitest'
import {
    chipClause,
    chipRuns,
    compareListRows,
    DEFAULT_LIST_FILTERS,
    DEFAULT_LIST_SORT,
    type DocumentListRow,
    documentListWindow,
    emptyTexts,
    hasFilterSet,
    kindDirection,
    type ListSort,
    listControls,
    listedClause,
    listRange,
    rangeClauses,
    searchClauses,
    tableMinWidth,
} from '../tinycld/books/lib/document-list'
import { searchPieces } from '../tinycld/books/lib/list-search'
import {
    creditMemoRow,
    estimateRow,
    invoiceRow,
    paymentRow,
    salesReceiptRow,
    type TransactionKind,
} from '../tinycld/books/lib/party-transactions'
import { salesTabOf } from '../tinycld/books/lib/sales-lists'
import {
    SALES_LIST_CREDIT_MEMOS,
    SALES_LIST_ESTIMATES,
    SALES_LIST_INVOICES,
    SALES_LIST_PAYMENTS,
    SALES_LIST_SALES_RECEIPTS,
    SALES_LIST_TODAY,
} from '../tinycld/books/lib/sales-lists-fixture'

const today = SALES_LIST_TODAY

type Clause = ReturnType<typeof eq>

function storeOf<T extends { id: string }>(rows: readonly T[]) {
    return createCollection(
        localOnlyCollectionOptions({
            id: `sales-list-${Math.random()}`,
            getKey: (row: T) => row.id,
            initialData: [...rows],
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        })
    )
}

async function run<TContext extends Context>(
    build: (query: InitialQueryBuilder) => QueryBuilder<TContext>
) {
    const live = createLiveQueryCollection({ query: build, startSync: true })
    await live.preload()
    return live.toArray
}

// A clause builder may give one clause, a list of them, or none: all of them go into one
// `where`, as the hook applies them.
function clausesOf(value: unknown): Clause[] {
    if (value === undefined || value === null) return []
    if (Array.isArray(value)) return value as Clause[]
    return [value as Clause]
}

function whereOf(clauses: Clause[]): Clause {
    const [first, second, ...rest] = clauses
    if (first === undefined) return eq(1, 1)
    if (second === undefined) return first
    return and(first, second, ...rest)
}

// Evaluates the clauses `build` gives for the fixture rows' ref, the way
// tests/entries-query.test.ts evaluates `entriesWhere`; returns the kept ids and the
// number of clauses.
async function keep<T extends { id: string }>(
    rows: readonly T[],
    build: (row: Ref<T>) => unknown
): Promise<{ ids: string[]; count: number }> {
    let count = -1
    const kept = await run(query =>
        query.from({ row: storeOf(rows) }).where(({ row }) => {
            const clauses = clausesOf(build(row as Ref<T>))
            count = clauses.length
            return whereOf(clauses)
        })
    )
    return { ids: kept.map(row => (row as { id: string }).id).sort(), count }
}

const idsOf = (rows: readonly { id: string }[]) => rows.map(row => row.id).sort()

// The rows of one kind with the badge label each one shows on SALES_LIST_TODAY.
const KIND_ROWS = {
    invoice: () =>
        keepBadges(SALES_LIST_INVOICES, row => invoiceRow(row, today).status.label, 'invoice'),
    estimate: () =>
        keepBadges(SALES_LIST_ESTIMATES, row => estimateRow(row, today).status.label, 'estimate'),
    sales_receipt: () =>
        keepBadges(
            SALES_LIST_SALES_RECEIPTS,
            row => salesReceiptRow(row).status.label,
            'sales_receipt'
        ),
    payment: () => keepBadges(SALES_LIST_PAYMENTS, row => paymentRow(row).status.label, 'payment'),
    credit_memo: () =>
        keepBadges(SALES_LIST_CREDIT_MEMOS, row => creditMemoRow(row).status.label, 'credit_memo'),
} satisfies Record<TransactionKind, unknown>

function keepBadges<T extends { id: string }>(
    rows: readonly T[],
    badge: (row: T) => string,
    kind: TransactionKind
) {
    return {
        kind,
        // The ids whose badge passes `isChip`.
        expected: (isChip: (label: string) => boolean) =>
            rows
                .filter(row => isChip(badge(row)))
                .map(row => row.id)
                .sort(),
        all: idsOf(rows),
        chip: (tabKey: string, chipId: string) =>
            keep(rows, row => chipClause(salesTabOf(tabKey), chipId, kind, row, today)),
    }
}

// Per kind tab, each chip's badge rule: the badge reads the chip's label, with the
// spec's three additions.
const KIND_TAB_CHIPS: readonly {
    tab: string
    kind: TransactionKind
    chips: readonly { id: string; isChip: (label: string) => boolean }[]
}[] = [
    {
        tab: 'invoices',
        kind: 'invoice',
        chips: [
            // Every posted invoice with a balance above zero.
            { id: 'open', isChip: label => ['Open', 'Partly paid', 'Overdue'].includes(label) },
            { id: 'overdue', isChip: label => label === 'Overdue' },
            { id: 'paid', isChip: label => label === 'Paid' },
            { id: 'draft', isChip: label => label === 'Draft' },
            { id: 'void', isChip: label => label === 'Void' },
        ],
    },
    {
        tab: 'estimates',
        kind: 'estimate',
        chips: [
            // An expired estimate's badge is Expired, so it is not under Pending or Accepted.
            { id: 'pending', isChip: label => label === 'Pending' },
            { id: 'accepted', isChip: label => label === 'Accepted' },
            { id: 'rejected', isChip: label => label === 'Rejected' },
            { id: 'closed', isChip: label => label === 'Closed' },
            { id: 'expired', isChip: label => label === 'Expired' },
        ],
    },
    {
        tab: 'sales-receipts',
        kind: 'sales_receipt',
        chips: [
            { id: 'paid', isChip: label => label === 'Paid' },
            { id: 'draft', isChip: label => label === 'Draft' },
            { id: 'void', isChip: label => label === 'Void' },
        ],
    },
    {
        tab: 'payments',
        kind: 'payment',
        chips: [
            { id: 'applied', isChip: label => label === 'Applied' },
            // Every "Credit $x" row.
            { id: 'credit-left', isChip: label => label.startsWith('Credit ') },
            { id: 'draft', isChip: label => label === 'Draft' },
            { id: 'void', isChip: label => label === 'Void' },
        ],
    },
    {
        tab: 'credit-memos',
        kind: 'credit_memo',
        chips: [
            { id: 'unapplied', isChip: label => label === 'Unapplied' },
            { id: 'applied', isChip: label => label === 'Applied' },
            { id: 'draft', isChip: label => label === 'Draft' },
            { id: 'void', isChip: label => label === 'Void' },
        ],
    },
]

describe('chipClause on a kind tab', () => {
    for (const { tab, kind, chips } of KIND_TAB_CHIPS) {
        it.each(chips)(`${tab}: chip $id keeps the rows whose badge reads it`, async chip => {
            const kindRows = KIND_ROWS[kind]()
            const expected = kindRows.expected(chip.isChip)
            expect(expected.length).toBeGreaterThan(0)
            expect(chipRuns(salesTabOf(tab), chip.id, kind)).toBe(true)
            expect((await kindRows.chip(tab, chip.id)).ids).toEqual(expected)
        })

        it(`${tab}: chip all keeps every row`, async () => {
            const kindRows = KIND_ROWS[kind]()
            expect(chipRuns(salesTabOf(tab), 'all', kind)).toBe(true)
            expect((await kindRows.chip(tab, 'all')).ids).toEqual(kindRows.all)
        })
    }

    it('lists an expired estimate under Expired only', async () => {
        const rows = KIND_ROWS.estimate()
        const expired = (await rows.chip('estimates', 'expired')).ids
        expect(expired).toEqual(['slest0000000083', 'slest0000000086'])
        expect((await rows.chip('estimates', 'pending')).ids).not.toContain('slest0000000086')
        expect((await rows.chip('estimates', 'accepted')).ids).not.toContain('slest0000000083')
    })
})

// The All sales chip table (spec §3), per kind; `null` is a "none" cell.
type RowRule<T> = ((row: T) => boolean) | null
const isPosted = (row: { status: string }) => row.status === 'posted'
const isDraft = (row: { status: string }) => row.status === 'draft'
const isVoid = (row: { status: string }) => row.status === 'void'
type EstimateFixture = (typeof SALES_LIST_ESTIMATES)[number]
const isExpiredEstimate = (row: EstimateFixture) =>
    (row.status === 'pending' || row.status === 'accepted') &&
    row.expiration_date !== '' &&
    row.expiration_date < today

const ALL_SALES_TABLE: {
    invoice: Record<string, RowRule<(typeof SALES_LIST_INVOICES)[number]>>
    estimate: Record<string, RowRule<EstimateFixture>>
    sales_receipt: Record<string, RowRule<(typeof SALES_LIST_SALES_RECEIPTS)[number]>>
    payment: Record<string, RowRule<(typeof SALES_LIST_PAYMENTS)[number]>>
    credit_memo: Record<string, RowRule<(typeof SALES_LIST_CREDIT_MEMOS)[number]>>
} = {
    invoice: {
        open: row => isPosted(row) && row.balance > 0,
        overdue: row =>
            isPosted(row) && row.balance > 0 && row.due_date !== '' && row.due_date < today,
        closed: row => isPosted(row) && row.balance === 0,
        draft: isDraft,
        void: isVoid,
    },
    estimate: {
        open: row =>
            (row.status === 'pending' || row.status === 'accepted') && !isExpiredEstimate(row),
        overdue: null,
        closed: row =>
            row.status === 'rejected' || row.status === 'closed' || isExpiredEstimate(row),
        draft: null,
        void: null,
    },
    sales_receipt: {
        open: null,
        overdue: null,
        closed: isPosted,
        draft: isDraft,
        void: isVoid,
    },
    payment: {
        open: row => isPosted(row) && row.credited > 0,
        overdue: null,
        closed: row => isPosted(row) && row.credited === 0,
        draft: isDraft,
        void: isVoid,
    },
    credit_memo: {
        open: row => isPosted(row) && row.balance > 0,
        overdue: null,
        closed: row => isPosted(row) && row.balance === 0,
        draft: isDraft,
        void: isVoid,
    },
}

const ALL_SALES_CHIPS = ['open', 'overdue', 'closed', 'draft', 'void'] as const

async function allSalesCase<T extends { id: string }>(
    kind: TransactionKind,
    rows: readonly T[],
    rule: RowRule<T>,
    chipId: string
) {
    const tab = salesTabOf('all')
    if (rule === null) {
        expect(chipRuns(tab, chipId, kind)).toBe(false)
        return
    }
    expect(chipRuns(tab, chipId, kind)).toBe(true)
    const expected = rows
        .filter(rule)
        .map(row => row.id)
        .sort()
    const { ids } = await keep(rows, row => chipClause(tab, chipId, kind, row, today))
    expect(ids).toEqual(expected)
}

describe('chipClause and chipRuns on All sales', () => {
    it.each(ALL_SALES_CHIPS)('chip %s keeps per invoice what the table says', chip =>
        allSalesCase('invoice', SALES_LIST_INVOICES, ALL_SALES_TABLE.invoice[chip], chip))
    it.each(ALL_SALES_CHIPS)('chip %s keeps per estimate what the table says', chip =>
        allSalesCase('estimate', SALES_LIST_ESTIMATES, ALL_SALES_TABLE.estimate[chip], chip))
    it.each(ALL_SALES_CHIPS)('chip %s keeps per sales receipt what the table says', chip =>
        allSalesCase(
            'sales_receipt',
            SALES_LIST_SALES_RECEIPTS,
            ALL_SALES_TABLE.sales_receipt[chip],
            chip
        ))
    it.each(ALL_SALES_CHIPS)('chip %s keeps per payment what the table says', chip =>
        allSalesCase('payment', SALES_LIST_PAYMENTS, ALL_SALES_TABLE.payment[chip], chip))
    it.each(ALL_SALES_CHIPS)('chip %s keeps per credit memo what the table says', chip =>
        allSalesCase(
            'credit_memo',
            SALES_LIST_CREDIT_MEMOS,
            ALL_SALES_TABLE.credit_memo[chip],
            chip
        ))

    it('runs Overdue only for invoices, Draft and Void not for estimates, Open not for receipts', () => {
        const tab = salesTabOf('all')
        const kinds: TransactionKind[] = [
            'invoice',
            'estimate',
            'sales_receipt',
            'payment',
            'credit_memo',
        ]
        expect(kinds.filter(kind => chipRuns(tab, 'overdue', kind))).toEqual(['invoice'])
        expect(chipRuns(tab, 'draft', 'estimate')).toBe(false)
        expect(chipRuns(tab, 'void', 'estimate')).toBe(false)
        expect(chipRuns(tab, 'open', 'sales_receipt')).toBe(false)
        expect(kinds.filter(kind => chipRuns(tab, 'all', kind))).toEqual(kinds)
    })

    it('chip all keeps every row of a kind', async () => {
        const { ids } = await keep(SALES_LIST_INVOICES, row =>
            chipClause(salesTabOf('all'), 'all', 'invoice', row, today)
        )
        expect(ids).toEqual(idsOf(SALES_LIST_INVOICES))
    })
})

describe('listedClause', () => {
    it('drops a void row that a correction replaced and keeps a plain void', async () => {
        const { ids } = await keep(SALES_LIST_INVOICES, row => listedClause(row))
        expect(ids).not.toContain('slinv0001043old')
        expect(ids).toContain('slinv0000001044')
        expect(ids).toContain('slinv0001043fix')
        expect(ids).toEqual(idsOf(SALES_LIST_INVOICES.filter(r => r.id !== 'slinv0001043old')))
    })
})

describe('rangeClauses', () => {
    it('gives no clause for all dates', async () => {
        const { ids, count } = await keep(SALES_LIST_INVOICES, row => rangeClauses(row, null))
        expect(count).toBe(0)
        expect(ids).toEqual(idsOf(SALES_LIST_INVOICES))
    })

    it('gives a start and an end clause for a range, inclusive at both ends', async () => {
        const range = { start: '2026-09-22', end: '2026-11-09' }
        const { ids, count } = await keep(SALES_LIST_INVOICES, row => rangeClauses(row, range))
        expect(count).toBe(2)
        expect(ids).toEqual(
            idsOf(SALES_LIST_INVOICES.filter(r => r.date >= range.start && r.date <= range.end))
        )
        expect(ids).toContain('slinv0000001045')
        expect(ids).toContain('slinv0000001049')
        expect(ids).not.toContain('slinv0000001048')
    })
})

describe('listRange', () => {
    it('gives no range for all dates', () => {
        expect(listRange('all-dates', '2026-11-10', 4)).toBeNull()
    })

    it('gives the fiscal year ranges from the fiscal start month', () => {
        expect(listRange('this-fiscal-year', '2026-11-10', 4)).toEqual({
            start: '2026-04-01',
            end: '2026-11-10',
        })
        expect(listRange('last-fiscal-year', '2026-11-10', 4)).toEqual({
            start: '2025-04-01',
            end: '2026-03-31',
        })
        expect(listRange('this-fiscal-year', '2026-02-15', 7)).toEqual({
            start: '2025-07-01',
            end: '2026-02-15',
        })
        expect(listRange('last-fiscal-year', '2026-02-15', 7)).toEqual({
            start: '2024-07-01',
            end: '2025-06-30',
        })
    })

    it('starts this quarter on a fiscal quarter', () => {
        expect(listRange('this-quarter', '2026-11-10', 2)).toEqual({
            start: '2026-11-01',
            end: '2026-11-10',
        })
    })

    it('gives the calendar month ranges', () => {
        expect(listRange('this-month', '2026-11-10', 4)).toEqual({
            start: '2026-11-01',
            end: '2026-11-10',
        })
        expect(listRange('last-month', '2026-03-10', 4)).toEqual({
            start: '2026-02-01',
            end: '2026-02-28',
        })
    })
})

function matchesPieces(row: { number: string; memo: string }, text: string): boolean {
    return searchPieces(text).every(piece => {
        const lower = piece.toLowerCase()
        return row.number.toLowerCase().includes(lower) || row.memo.toLowerCase().includes(lower)
    })
}

describe('searchClauses', () => {
    it("gives one clause per piece of '10 4', over number and memo", async () => {
        const { ids, count } = await keep(SALES_LIST_INVOICES, row => searchClauses(row, '10 4'))
        expect(count).toBe(searchPieces('10 4').length)
        expect(ids).toEqual(idsOf(SALES_LIST_INVOICES.filter(r => matchesPieces(r, '10 4'))))
    })

    it('gives one clause per piece where the text is cut, each matching number or memo', async () => {
        const { ids, count } = await keep(SALES_LIST_INVOICES, row =>
            searchClauses(row, '104%retainer')
        )
        expect(count).toBe(2)
        expect(ids).toEqual(['slinv0000001048'])
    })

    it('matches the memo regardless of case', async () => {
        const { ids } = await keep(SALES_LIST_INVOICES, row => searchClauses(row, 'MENU BOARDS'))
        expect(ids).toEqual(['slinv0000001045'])
    })

    it('gives no clause for blank text', async () => {
        expect((await keep(SALES_LIST_INVOICES, row => searchClauses(row, ''))).count).toBe(0)
        expect((await keep(SALES_LIST_INVOICES, row => searchClauses(row, '   '))).count).toBe(0)
    })
})

let next = 0
function listRow(over: Partial<DocumentListRow>): DocumentListRow {
    next++
    return {
        id: `row${String(next).padStart(12, '0')}`,
        kind: 'invoice',
        number: '',
        date: '2026-11-01',
        dueDate: '',
        total: 0,
        currency: 'USD',
        created: '2026-11-01 09:00:00.000Z',
        status: { label: 'Open', tone: 'warning' },
        sequence: 0,
        customerId: '',
        customerName: '',
        memo: '',
        reference: '',
        expires: '',
        balance: 0,
        entry: '',
        convertedInvoice: '',
        recordStatus: 'posted',
        ...over,
    }
}

const sorted = (rows: DocumentListRow[], sort: ListSort) =>
    [...rows].sort(compareListRows(sort)).map(row => row.id)

describe('compareListRows', () => {
    it('sorts No. by sequence: 999 before 1012 ascending', () => {
        const a = listRow({ id: 'n1012', number: '1012', sequence: 1012 })
        const b = listRow({ id: 'n999', number: '999', sequence: 999 })
        expect(sorted([a, b], { key: 'number', isAscending: true })).toEqual(['n999', 'n1012'])
        expect(sorted([b, a], { key: 'number', isAscending: false })).toEqual(['n1012', 'n999'])
    })

    it('puts a draft (sequence 0) first ascending and last descending', () => {
        const draft = listRow({ id: 'draft', number: '', sequence: 0 })
        const one = listRow({ id: 'n7', number: '7', sequence: 7 })
        const two = listRow({ id: 'n1048', number: '1048', sequence: 1048 })
        expect(sorted([one, two, draft], { key: 'number', isAscending: true })).toEqual([
            'draft',
            'n7',
            'n1048',
        ])
        expect(sorted([draft, one, two], { key: 'number', isAscending: false })).toEqual([
            'n1048',
            'n7',
            'draft',
        ])
    })

    it('puts an empty due date first ascending and last descending', () => {
        const none = listRow({ id: 'nodue', dueDate: '' })
        const early = listRow({ id: 'early', dueDate: '2026-10-01' })
        const late = listRow({ id: 'late', dueDate: '2026-12-01' })
        expect(sorted([late, none, early], { key: 'due', isAscending: true })).toEqual([
            'nodue',
            'early',
            'late',
        ])
        expect(sorted([none, early, late], { key: 'due', isAscending: false })).toEqual([
            'late',
            'early',
            'nodue',
        ])
    })

    it('puts an empty expiration date first ascending', () => {
        const none = listRow({ id: 'noexp', kind: 'estimate', expires: '' })
        const set = listRow({ id: 'exp', kind: 'estimate', expires: '2026-10-01' })
        expect(sorted([set, none], { key: 'expires', isAscending: true })).toEqual(['noexp', 'exp'])
    })

    it('keeps rows with the same value newest created first in both directions', () => {
        const older = listRow({ id: 'older', total: 500, created: '2026-11-01 08:00:00.000Z' })
        const newer = listRow({ id: 'newer', total: 500, created: '2026-11-02 08:00:00.000Z' })
        expect(sorted([older, newer], { key: 'amount', isAscending: true })).toEqual([
            'newer',
            'older',
        ])
        expect(sorted([older, newer], { key: 'amount', isAscending: false })).toEqual([
            'newer',
            'older',
        ])
        const a = listRow({ id: 'a', date: '2026-11-09', created: '2026-11-09 10:05:00.000Z' })
        const b = listRow({ id: 'b', date: '2026-11-09', created: '2026-11-09 16:20:00.000Z' })
        expect(sorted([a, b], { key: 'date', isAscending: true })).toEqual(['b', 'a'])
        expect(sorted([a, b], { key: 'date', isAscending: false })).toEqual(['b', 'a'])
    })

    it('sorts the signed amount: a credit memo of -40000 before an invoice of 0 ascending', () => {
        const memo = listRow({ id: 'memo', kind: 'credit_memo', total: -40_000 })
        const zero = listRow({ id: 'zero', kind: 'invoice', total: 0 })
        const big = listRow({ id: 'big', kind: 'invoice', total: 98_000 })
        expect(sorted([zero, big, memo], { key: 'amount', isAscending: true })).toEqual([
            'memo',
            'zero',
            'big',
        ])
    })

    it('sorts by balance', () => {
        const low = listRow({ id: 'low', balance: 100 })
        const high = listRow({ id: 'high', balance: 900 })
        expect(sorted([high, low], { key: 'balance', isAscending: true })).toEqual(['low', 'high'])
    })

    it('by default orders by date, newest first, then created, newest first', () => {
        expect(DEFAULT_LIST_SORT).toEqual({ key: 'date', isAscending: false })
        const old = listRow({ id: 'old', date: '2026-10-01' })
        const tieOld = listRow({
            id: 'tieOld',
            date: '2026-11-09',
            created: '2026-11-09 10:00:00.000Z',
        })
        const tieNew = listRow({
            id: 'tieNew',
            date: '2026-11-09',
            created: '2026-11-09 11:00:00.000Z',
        })
        expect(sorted([old, tieOld, tieNew], DEFAULT_LIST_SORT)).toEqual([
            'tieNew',
            'tieOld',
            'old',
        ])
    })
})

describe('kindDirection', () => {
    const all = salesTabOf('all')
    const memos = salesTabOf('credit-memos')

    it('is the opposite for a credit memo on a signed tab sorted by amount', () => {
        expect(kindDirection(all, 'credit_memo', { key: 'amount', isAscending: true })).toBe('desc')
        expect(kindDirection(all, 'credit_memo', { key: 'amount', isAscending: false })).toBe('asc')
    })

    it("is the sort's own direction otherwise", () => {
        expect(kindDirection(all, 'invoice', { key: 'amount', isAscending: true })).toBe('asc')
        expect(kindDirection(all, 'credit_memo', { key: 'date', isAscending: true })).toBe('asc')
        expect(kindDirection(all, 'credit_memo', { key: 'number', isAscending: false })).toBe(
            'desc'
        )
        expect(kindDirection(memos, 'credit_memo', { key: 'amount', isAscending: true })).toBe(
            'asc'
        )
        expect(kindDirection(memos, 'credit_memo', { key: 'amount', isAscending: false })).toBe(
            'desc'
        )
    })
})

describe('documentListWindow', () => {
    const sort = DEFAULT_LIST_SORT
    const day = (d: number) => `2026-11-${String(d).padStart(2, '0')}`

    it('merges the lists in the sort order and cuts to n, reporting more when a list reached n', () => {
        const invoices = [listRow({ id: 'i9', date: day(9) }), listRow({ id: 'i5', date: day(5) })]
        const payments = [listRow({ id: 'p8', kind: 'payment', date: day(8) })]
        const merged = documentListWindow([invoices, payments], 2, sort)
        expect(merged.rows.map(row => row.id)).toEqual(['i9', 'p8'])
        expect(merged.hasMore).toBe(true)
    })

    it('keeps every row and reports no more when no list reached n', () => {
        const invoices = [listRow({ id: 'i9', date: day(9) })]
        const payments = [listRow({ id: 'p8', kind: 'payment', date: day(8) })]
        const merged = documentListWindow([payments, invoices], 2, sort)
        expect(merged.rows.map(row => row.id)).toEqual(['i9', 'p8'])
        expect(merged.hasMore).toBe(false)
    })

    it('merges by the given sort', () => {
        const a = listRow({ id: 'a', sequence: 1012, number: '1012' })
        const b = listRow({ id: 'b', sequence: 999, number: '999', kind: 'payment' })
        const merged = documentListWindow([[a], [b]], 50, { key: 'number', isAscending: true })
        expect(merged.rows.map(row => row.id)).toEqual(['b', 'a'])
    })
})

describe('listControls', () => {
    it('shows a reader no New, no ticks and no batch', () => {
        expect(listControls(false, 'table')).toMatchObject({
            showNew: false,
            showTicks: false,
            showBatch: false,
        })
    })

    it('shows a writer everything in the table', () => {
        expect(listControls(true, 'table')).toEqual({
            showNew: true,
            showTicks: true,
            showBatch: true,
            showRowMenus: true,
            showFilters: true,
        })
    })

    it('shows the names column New and no ticks, batch, row menus or filters', () => {
        expect(listControls(true, 'names')).toEqual({
            showNew: true,
            showTicks: false,
            showBatch: false,
            showRowMenus: false,
            showFilters: false,
        })
    })
})

describe('tableMinWidth', () => {
    it('is 900 for the All sales columns and 886 for the Invoices columns for a writer', () => {
        expect(tableMinWidth(salesTabOf('all').columns, true)).toBe(900)
        expect(tableMinWidth(salesTabOf('invoices').columns, true)).toBe(886)
    })
})

describe('hasFilterSet', () => {
    it('is false for the default filters', () => {
        expect(DEFAULT_LIST_FILTERS).toEqual({
            search: '',
            chip: 'all',
            range: 'all-dates',
            customer: '',
        })
        expect(hasFilterSet(DEFAULT_LIST_FILTERS)).toBe(false)
    })

    it.each([
        ['a search', { search: 'retainer' }],
        ['a chip', { chip: 'open' }],
        ['a range', { range: 'this-month' }],
        ['a customer', { customer: 'bcust0000000001' }],
    ] as const)('is true with %s', (_label, change) => {
        expect(hasFilterSet({ ...DEFAULT_LIST_FILTERS, ...change })).toBe(true)
    })
})

describe('emptyTexts', () => {
    it("names the tab's noun", () => {
        expect(emptyTexts(salesTabOf('invoices'))).toEqual({
            yet: 'No invoices yet',
            match: 'No invoices match',
        })
        expect(emptyTexts(salesTabOf('all'))).toEqual({
            yet: 'No sales transactions yet',
            match: 'No sales transactions match',
        })
    })
})
