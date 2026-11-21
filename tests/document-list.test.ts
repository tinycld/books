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
import * as documentList from '../tinycld/books/lib/document-list'
import {
    chipClause,
    chipRuns,
    compareListRows,
    DEFAULT_LIST_FILTERS,
    DEFAULT_LIST_SORT,
    type DocumentListRow,
    type DocumentListTab,
    documentListWindow,
    emptyTexts,
    hasFilterSet,
    isSalesKind,
    isSalesRow,
    kindDirection,
    type ListSort,
    listControls,
    listedClause,
    listRange,
    rangeClauses,
    searchClauses,
    sortField,
    tableMinWidthFor,
} from '../tinycld/books/lib/document-list'
import { searchPieces } from '../tinycld/books/lib/list-search'
import {
    creditMemoRow,
    estimateRow,
    invoiceRow,
    paymentRow,
    refundReceiptRow,
    salesReceiptRow,
    TRANSACTION_TYPE_LABELS,
    type TransactionKind,
} from '../tinycld/books/lib/party-transactions'
import { purchaseTabOf } from '../tinycld/books/lib/purchase-lists'
import {
    customerTransactionsTab,
    SALES_TABS,
    type SalesKind,
    salesTabOf,
} from '../tinycld/books/lib/sales-lists'
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

// The sales lists fixture has no refund receipts: one of each status (refund receipt spec
// §3.13), and a void original a correction replaced.
const REFUND_BASE = {
    number: '',
    date: '2026-11-05',
    total: 15_000,
    currency: 'USD',
    created: '2026-11-05 09:00:00.000Z',
    memo: '',
    replaced_by: '',
}
const REFUND_ROWS = [
    { ...REFUND_BASE, id: 'slrr00000001001', status: 'posted', number: '1001' },
    { ...REFUND_BASE, id: 'slrr00000001002', status: 'posted', number: '1002' },
    { ...REFUND_BASE, id: 'slrrdraft000001', status: 'draft' },
    { ...REFUND_BASE, id: 'slrr00000001003', status: 'void', number: '1003' },
    {
        ...REFUND_BASE,
        id: 'slrr0001004old0',
        status: 'void',
        number: '1004',
        replaced_by: 'slrr0001004fix0',
    },
    { ...REFUND_BASE, id: 'slrr0001004fix0', status: 'posted', number: '1004' },
] as const

// Write-off spec §3.6 (Q11): the fixture's invoices carry `written_off` 0 (a value the
// fixture sets wins), and three rows a write-off touched: one written off whole (balance 0),
// one a payment's void opened again (balance above 0), and a void one.
const WRITTEN_OFF_BASE = {
    ...SALES_LIST_INVOICES[1],
    date: '2026-11-10',
    due_date: '2026-12-10',
    memo: 'Written off',
    total: 40_000,
    replaced_by: '',
}
const INVOICE_ROWS = [
    ...SALES_LIST_INVOICES.map(row => ({ written_off: 0, ...row })),
    {
        ...WRITTEN_OFF_BASE,
        id: 'slinvwrittenoff',
        status: 'posted' as const,
        number: '1101',
        balance: 0,
        written_off: 40_000,
    },
    {
        ...WRITTEN_OFF_BASE,
        id: 'slinvworeopened',
        status: 'posted' as const,
        number: '1102',
        balance: 10_000,
        written_off: 40_000,
    },
    {
        ...WRITTEN_OFF_BASE,
        id: 'slinvwovoid0001',
        status: 'void' as const,
        number: '1103',
        balance: 0,
        written_off: 40_000,
    },
]

// Apply credit spec §3.5 (Q7): the fixture's credit memos carry `applied` 0 (a value the
// fixture sets wins), and two rows an application touched: one applied in full (balance 0,
// Applied) and one applied in part (balance above 0, still Unapplied).
const APPLIED_MEMO_BASE = {
    ...SALES_LIST_CREDIT_MEMOS[1],
    date: '2026-11-12',
    memo: 'Applied to an invoice',
    total: 25_000,
}
const CREDIT_MEMO_ROWS = [
    ...SALES_LIST_CREDIT_MEMOS.map(row => ({ applied: 0, ...row })),
    {
        ...APPLIED_MEMO_BASE,
        id: 'slcmappliedfull',
        status: 'posted' as const,
        number: '28',
        balance: 0,
        applied: 25_000,
    },
    {
        ...APPLIED_MEMO_BASE,
        id: 'slcmappliedpart',
        status: 'posted' as const,
        number: '29',
        balance: 10_000,
        applied: 15_000,
    },
    // A void memo with balance 0 and a stored `applied` above zero: Applied needs posted.
    {
        ...APPLIED_MEMO_BASE,
        id: 'slcmappliedvoid',
        status: 'void' as const,
        number: '30',
        balance: 0,
        applied: 15_000,
    },
]

// The rows of one kind with the badge label each one shows on SALES_LIST_TODAY.
const KIND_ROWS = {
    invoice: () => keepBadges(INVOICE_ROWS, row => invoiceRow(row, today).status.label, 'invoice'),
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
        keepBadges(CREDIT_MEMO_ROWS, row => creditMemoRow(row).status.label, 'credit_memo'),
    refund_receipt: () =>
        keepBadges(REFUND_ROWS, row => refundReceiptRow(row).status.label, 'refund_receipt'),
} satisfies Record<SalesKind, unknown>

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
    kind: SalesKind
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
            { id: 'written-off', isChip: label => label === 'Written off' },
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
            { id: 'refunded', isChip: label => label === 'Refunded' },
            { id: 'draft', isChip: label => label === 'Draft' },
            { id: 'void', isChip: label => label === 'Void' },
        ],
    },
    {
        tab: 'refund-receipts',
        kind: 'refund_receipt',
        chips: [
            { id: 'refunded', isChip: label => label === 'Refunded' },
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

    // Apply credit spec §3.5: Applied is balance 0 with a part applied, Refunded balance 0
    // with nothing applied; a memo applied in part stays under Unapplied.
    it('credit-memos: Applied keeps only the memo applied in full, Refunded only the refunded one', async () => {
        const rows = KIND_ROWS.credit_memo()
        expect((await rows.chip('credit-memos', 'applied')).ids).toEqual(['slcmappliedfull'])
        expect((await rows.chip('credit-memos', 'refunded')).ids).toEqual(['slcm00000000026'])
        expect((await rows.chip('credit-memos', 'unapplied')).ids).toEqual([
            'slcm00000000027',
            'slcmappliedpart',
        ])
        expect((await rows.chip('credit-memos', 'void')).ids).toContain('slcmappliedvoid')
        expect((await rows.chip('credit-memos', 'applied')).ids).not.toContain('slcmappliedvoid')
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
    invoice: Record<string, RowRule<(typeof INVOICE_ROWS)[number]>>
    estimate: Record<string, RowRule<EstimateFixture>>
    sales_receipt: Record<string, RowRule<(typeof SALES_LIST_SALES_RECEIPTS)[number]>>
    payment: Record<string, RowRule<(typeof SALES_LIST_PAYMENTS)[number]>>
    credit_memo: Record<string, RowRule<(typeof CREDIT_MEMO_ROWS)[number]>>
    refund_receipt: Record<string, RowRule<(typeof REFUND_ROWS)[number]>>
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
    // As the sales receipt: a posted refund is closed.
    refund_receipt: {
        open: null,
        overdue: null,
        closed: isPosted,
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
        allSalesCase('invoice', INVOICE_ROWS, ALL_SALES_TABLE.invoice[chip], chip))
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
        allSalesCase('credit_memo', CREDIT_MEMO_ROWS, ALL_SALES_TABLE.credit_memo[chip], chip))
    it.each(ALL_SALES_CHIPS)('chip %s keeps per refund receipt what the table says', chip =>
        allSalesCase('refund_receipt', REFUND_ROWS, ALL_SALES_TABLE.refund_receipt[chip], chip))

    it('runs Overdue only for invoices, Draft and Void not for estimates, Open not for receipts', () => {
        const tab = salesTabOf('all')
        const kinds: TransactionKind[] = [
            'invoice',
            'estimate',
            'sales_receipt',
            'payment',
            'credit_memo',
            'refund_receipt',
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
        partyId: '',
        partyName: '',
        memo: '',
        reference: '',
        expires: '',
        balance: 0,
        entry: '',
        convertedInvoice: '',
        recordStatus: 'posted',
        category: { kind: 'none' },
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

    it('is the opposite for a refund receipt and a write-off sorted by amount on every tab', () => {
        const customer = customerTransactionsTab('all')
        for (const tab of [all, customer]) {
            for (const kind of ['refund_receipt', 'write_off'] as const) {
                expect(kindDirection(tab, kind, { key: 'amount', isAscending: true })).toBe('desc')
                expect(kindDirection(tab, kind, { key: 'amount', isAscending: false })).toBe('asc')
                expect(kindDirection(tab, kind, { key: 'date', isAscending: true })).toBe('asc')
            }
        }
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
    // Checkpoint 4: every area has the row actions, so the controls depend on the access and
    // the layout only (two arguments).
    it('shows a reader row menus and no New, no ticks and no batch', () => {
        expect(listControls(false, 'table')).toEqual({
            showNew: false,
            showTicks: false,
            showBatch: false,
            showRowMenus: true,
            showFilters: true,
        })
    })

    it('shows a writer ticks, batch and row menus in the table', () => {
        expect(listControls(true, 'table')).toEqual({
            showNew: true,
            showTicks: true,
            showBatch: true,
            showRowMenus: true,
            showFilters: true,
        })
    })

    it('shows a writer ticks, batch and row menus on the cards', () => {
        expect(listControls(true, 'cards')).toMatchObject({
            showTicks: true,
            showBatch: true,
            showRowMenus: true,
        })
    })

    it('takes two arguments', () => {
        expect(listControls.length).toBe(2)
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

// The table's minimum with the cells `listControls` gives the tab's area (fix round 1: the
// old `tableMinWidth(tab, canWrite)` drew a row menu for every area and is gone).
function minWidthOf(tab: DocumentListTab, canWrite: boolean): number {
    return tableMinWidthFor(tab, listControls(canWrite, 'table'))
}

describe('tableMinWidthFor', () => {
    it('is 900 for the All sales columns and 886 for the Invoices columns for a writer', () => {
        expect(minWidthOf(salesTabOf('all'), true)).toBe(900)
        expect(minWidthOf(salesTabOf('invoices'), true)).toBe(886)
    })

    it('is 28 less for a Sales reader, who has a left pad for the tick box', () => {
        expect(minWidthOf(salesTabOf('all'), false)).toBe(872)
        expect(minWidthOf(salesTabOf('invoices'), false)).toBe(858)
    })

    it('is 912 for an All purchases writer, with the tick box and the row menu', () => {
        expect(minWidthOf(purchaseTabOf('all'), true)).toBe(912)
    })

    it('has no tableMinWidth(tab, canWrite) beside it', () => {
        expect(documentList).not.toHaveProperty('tableMinWidth')
    })
})

describe('hasFilterSet', () => {
    it('is false for the default filters', () => {
        expect(DEFAULT_LIST_FILTERS).toEqual({
            search: '',
            chip: 'all',
            range: 'all-dates',
            party: '',
        })
        expect(hasFilterSet(DEFAULT_LIST_FILTERS)).toBe(false)
    })

    it.each([
        ['a search', { search: 'retainer' }],
        ['a chip', { chip: 'open' }],
        ['a range', { range: 'this-month' }],
        ['a party', { party: 'bcust0000000001' }],
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
        expect(emptyTexts(salesTabOf('refund-receipts'))).toEqual({
            yet: 'No refund receipts yet',
            match: 'No refund receipts match',
        })
    })
})

describe('the refund receipts tab', () => {
    it('lists the rows of kind refund_receipt only, and All sales lists them too', () => {
        expect(chipRuns(salesTabOf('refund-receipts'), 'all', 'refund_receipt')).toBe(true)
        expect(chipRuns(salesTabOf('refund-receipts'), 'all', 'sales_receipt')).toBe(false)
        expect(chipRuns(salesTabOf('all'), 'all', 'refund_receipt')).toBe(true)
    })

    it('drops a void original that a correction replaced', async () => {
        const { ids } = await keep(REFUND_ROWS, row => listedClause(row))
        expect(ids).not.toContain('slrr0001004old0')
        expect(ids).toContain('slrr0001004fix0')
        expect(ids).toContain('slrr00000001003')
    })

    it('sorts by date, number and amount on the stored columns', () => {
        expect(sortField('refund_receipt', 'date')).toBe('date')
        expect(sortField('refund_receipt', 'number')).toBe('sequence')
        expect(sortField('refund_receipt', 'amount')).toBe('total')
    })
})

// Write-off spec §3.6 (Q11, Q12).
describe('the write-off on the lists', () => {
    const settledRows = [
        { id: 'wopaid000000001', status: 'posted', balance: 0, written_off: 0 },
        { id: 'wowrittenoff001', status: 'posted', balance: 0, written_off: 40_000 },
        { id: 'wodraft00000001', status: 'draft', balance: 0, written_off: 0 },
        { id: 'wovoid000000001', status: 'void', balance: 0, written_off: 40_000 },
        { id: 'woopen000000001', status: 'posted', balance: 10_000, written_off: 40_000 },
    ]
    const chipOn = (tabKey: string, chipId: string) =>
        keep(settledRows, row => chipClause(salesTabOf(tabKey), chipId, 'invoice', row, today))

    it('the invoice chip paid takes a settled row with written_off 0 only', async () => {
        expect((await chipOn('invoices', 'paid')).ids).toEqual(['wopaid000000001'])
    })

    it('the invoice chip written-off takes a settled row with written_off above 0 only', async () => {
        expect(chipRuns(salesTabOf('invoices'), 'written-off', 'invoice')).toBe(true)
        expect((await chipOn('invoices', 'written-off')).ids).toEqual(['wowrittenoff001'])
    })

    it('the All sales closed chip still takes both settled rows', async () => {
        expect((await chipOn('all', 'closed')).ids).toEqual(['wopaid000000001', 'wowrittenoff001'])
    })

    it('no Sales tab runs the write-off query, under any chip', () => {
        for (const tab of SALES_TABS) {
            for (const chip of tab.chips) {
                expect(chipRuns(tab, chip.id, 'write_off')).toBe(false)
            }
        }
    })

    it('the customer tab runs it with the filter all or write_off, and not for another kind', () => {
        expect(chipRuns(customerTransactionsTab('all'), 'all', 'write_off')).toBe(true)
        expect(chipRuns(customerTransactionsTab('write_off'), 'all', 'write_off')).toBe(true)
        expect(chipRuns(customerTransactionsTab('invoice'), 'all', 'write_off')).toBe(false)
    })

    it('sorts a write-off by date, number and its amount', () => {
        expect(sortField('write_off', 'date')).toBe('date')
        expect(sortField('write_off', 'number')).toBe('sequence')
        expect(sortField('write_off', 'amount')).toBe('amount')
    })
})

// A kind missing from SALES_KINDS falls to the purchase side (`isPurchaseRow`), so the
// customer Transactions tab drops its rows. The kinds come from the source: every key of
// TRANSACTION_TYPE_LABELS (a Record over TransactionKind) and every kind the customer tab
// lists.
describe('isSalesKind', () => {
    const transactionKinds = Object.keys(TRANSACTION_TYPE_LABELS) as TransactionKind[]
    const customerKinds = customerTransactionsTab('all').kinds

    it('the customer tab lists every transaction kind, write_off included', () => {
        expect([...customerKinds].sort()).toEqual([...transactionKinds].sort())
        expect(customerKinds).toContain('write_off')
    })

    it.each(transactionKinds)('takes %s as a sales kind', kind => {
        expect(isSalesKind(kind)).toBe(true)
        expect(isSalesRow({ kind })).toBe(true)
    })
})
