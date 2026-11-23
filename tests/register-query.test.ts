import {
    BasicIndex,
    type Context,
    createCollection,
    createLiveQueryCollection,
    type InitialQueryBuilder,
    localOnlyCollectionOptions,
    type QueryBuilder,
} from '@tanstack/db'
import { describe, expect, it } from 'vitest'
import { REGISTER_ACCOUNT_ID } from '../tinycld/books/lib/account-register-fixture'
import { ACCOUNTS } from '../tinycld/books/lib/chart-of-accounts-fixture'
import {
    anyActivityQuery,
    openingTotalsQuery,
    registerLinesQuery,
    reversalOriginsQuery,
    subAccountQuery,
} from '../tinycld/books/lib/register-query'
import type {
    BooksAccountBalances,
    BooksAccounts,
    BooksCustomers,
    BooksJournalEntries,
    BooksJournalLines,
    BooksReconcileLines,
    BooksReconciliations,
    BooksVendors,
} from '../tinycld/books/types'
import {
    BALANCES,
    CLEARED_LINE,
    FINISHED_RECONCILIATION_ID,
    FINISHED_STATEMENT_DATE,
    MATCHED_LINE,
    PLAIN_LINE,
    PROGRESS_RECONCILIATION_ID,
    PROGRESS_STATEMENT_DATE,
    RANGE,
    RECONCILED_LINE,
    SEED_ENTRIES,
    SEED_LINES,
    SEED_RECONCILE_ROWS,
    SEED_RECONCILIATIONS,
} from './register-test-data'

const indexed = { autoIndex: 'eager' as const, defaultIndexType: BasicIndex }

function local<T extends { id: string }>(name: string, initialData: T[]) {
    return createCollection(
        localOnlyCollectionOptions({
            id: `${name}-${Math.random()}`,
            getKey: (row: T) => row.id,
            initialData,
            ...indexed,
        })
    )
}

function stores(seed: {
    lines?: BooksJournalLines[]
    entries?: BooksJournalEntries[]
    balances?: BooksAccountBalances[]
    reconcileRows?: BooksReconcileLines[]
    reconciliations?: BooksReconciliations[]
}) {
    return {
        reconciliations: local<BooksReconciliations>(
            'reconciliations',
            seed.reconciliations ?? SEED_RECONCILIATIONS
        ),
        reconcileRows: local<BooksReconcileLines>(
            'reconcile_lines',
            seed.reconcileRows ?? SEED_RECONCILE_ROWS
        ),
        lines: local<BooksJournalLines>('lines', seed.lines ?? SEED_LINES),
        entries: local<BooksJournalEntries>('entries', seed.entries ?? SEED_ENTRIES),
        balances: local<BooksAccountBalances>('balances', seed.balances ?? BALANCES),
        accounts: local<BooksAccounts>('accounts', ACCOUNTS),
        customers: local<BooksCustomers>('customers', []),
        vendors: local<BooksVendors>('vendors', []),
    }
}

async function run<TContext extends Context>(
    build: (query: InitialQueryBuilder) => QueryBuilder<TContext>
) {
    const live = createLiveQueryCollection({ query: build, startSync: true })
    await live.preload()
    return live.toArray
}

async function registerRows(
    seed: Parameters<typeof stores>[0],
    range: { start: string; end: string } = RANGE
) {
    const { lines, entries, customers, vendors, reconcileRows, reconciliations } = stores(seed)
    return run(
        registerLinesQuery(
            lines,
            entries,
            REGISTER_ACCOUNT_ID,
            range,
            { customers, vendors },
            reconcileRows,
            reconciliations
        )
    )
}

const expectedIds = SEED_LINES.filter(
    l =>
        l.account === REGISTER_ACCOUNT_ID &&
        l.posted &&
        l.date >= '2026-10-01' &&
        l.date <= RANGE.end
).map(l => l.id)

describe('registerLinesQuery', () => {
    it('returns the 17 posted lines of the account inside the range', async () => {
        const rows = await registerRows({})
        expect(rows).toHaveLength(17)
        expect(rows.map(r => r.id).sort()).toEqual([...expectedIds].sort())
        expect(rows.every(r => r.account === REGISTER_ACCOUNT_ID)).toBe(true)
        expect(rows.every(r => r.posted)).toBe(true)
        expect(rows.every(r => r.date <= RANGE.end)).toBe(true)
    })

    it('loads the month before range.start for the month-aligned opening', async () => {
        const rows = await registerRows({}, { start: '2026-10-10', end: '2026-10-23' })
        const dates = rows.map(r => r.date)
        expect(dates.filter(d => d < '2026-10-10').length).toBeGreaterThan(0)
        expect(dates).toContain('2026-10-01')
        expect(dates.every(d => d >= '2026-10-01')).toBe(true)
    })

    it('attaches each entry and the entry other lines', async () => {
        const rows = await registerRows({})
        for (const row of rows) {
            const entry = SEED_ENTRIES.find(e => e.id === row.entry)
            expect(row.entryRecord?.number).toBe(entry?.number)
        }
        const payroll = rows.find(r => r.entry === 'je_1050')
        expect(payroll?.entryLines.map(l => l.id).sort()).toEqual(
            SEED_LINES.filter(l => l.entry === 'je_1050')
                .map(l => l.id)
                .sort()
        )
        expect(payroll?.entryLines).toHaveLength(3)
    })

    it('stays correct when the entries collection is much larger than the lines', async () => {
        const mine = new Set(
            SEED_LINES.filter(l => l.account === REGISTER_ACCOUNT_ID).map(l => l.entry)
        )
        const lines = SEED_LINES.filter(l => mine.has(l.entry))
        const extra = Array.from({ length: 60 }, (_, i) => ({
            ...SEED_ENTRIES[0],
            id: `je_extra_${i}`,
            number: `JE-9${i}`,
        }))
        const entries = [...SEED_ENTRIES, ...extra]
        expect(entries.length).toBeGreaterThan(lines.length)
        const rows = await registerRows({ lines, entries })
        expect(rows.map(r => r.id).sort()).toEqual([...expectedIds].sort())
        expect(rows.every(r => r.entryRecord?.id === r.entry)).toBe(true)
    })

    it('stays correct when the entries collection is smaller than the lines', async () => {
        const mine = new Set(
            SEED_LINES.filter(l => l.account === REGISTER_ACCOUNT_ID).map(l => l.entry)
        )
        const entries = SEED_ENTRIES.filter(e => mine.has(e.id))
        expect(entries.length).toBeLessThan(SEED_LINES.length)
        const rows = await registerRows({ entries })
        expect(rows.map(r => r.id).sort()).toEqual([...expectedIds].sort())
        expect(rows.every(r => r.entryRecord?.id === r.entry)).toBe(true)
    })

    // Reconcile spec §4 "Reads" (register), plan settled difference 3: one materialize of the
    // line's `books_reconcile_lines` row, whose id is the line id.
    it("attaches each line's books_reconcile_lines row, and none for a line without one", async () => {
        const rows = await registerRows({})
        const byId = (id: string) => rows.find(r => r.id === id)
        expect(byId(RECONCILED_LINE.id)?.reconcileRow).toMatchObject({
            id: RECONCILED_LINE.id,
            reconciliation: FINISHED_RECONCILIATION_ID,
            finished: true,
            bank_matched: false,
        })
        expect(byId(CLEARED_LINE.id)?.reconcileRow).toMatchObject({
            reconciliation: PROGRESS_RECONCILIATION_ID,
            finished: false,
        })
        expect(byId(MATCHED_LINE.id)?.reconcileRow).toMatchObject({
            reconciliation: '',
            bank_matched: true,
        })
        expect(byId(PLAIN_LINE.id)).toBeDefined()
        expect(byId(PLAIN_LINE.id)?.reconcileRow).toBeUndefined()
    })

    // Fix round 1 of checkpoint 6 (one query): the drawer's "Statement of <day>" comes from the
    // reconciliation row that the line's own view row names, materialized inside the lines
    // query, not from a second query's id → date map.
    it("attaches the statement day of the reconciliation the line's view row names", async () => {
        const rows = await registerRows({})
        const byId = (id: string) => rows.find(r => r.id === id)
        expect(byId(RECONCILED_LINE.id)?.reconcileRow?.statement?.statement_date).toBe(
            FINISHED_STATEMENT_DATE
        )
        expect(byId(CLEARED_LINE.id)?.reconcileRow?.statement?.statement_date).toBe(
            PROGRESS_STATEMENT_DATE
        )
        expect(byId(MATCHED_LINE.id)?.reconcileRow).toBeDefined()
        expect(byId(MATCHED_LINE.id)?.reconcileRow?.statement).toBeUndefined()
    })

    it('keeps the line and its view row when its reconciliation row is not loaded', async () => {
        const rows = await registerRows({ reconciliations: [] })
        expect(rows.map(r => r.id).sort()).toEqual([...expectedIds].sort())
        const reconciled = rows.find(r => r.id === RECONCILED_LINE.id)
        expect(reconciled?.reconcileRow).toMatchObject({
            reconciliation: FINISHED_RECONCILIATION_ID,
            finished: true,
        })
        expect(reconciled?.reconcileRow?.statement).toBeUndefined()
    })

    it('keeps every line when the view holds no row at all', async () => {
        const rows = await registerRows({ reconcileRows: [] })
        expect(rows.map(r => r.id).sort()).toEqual([...expectedIds].sort())
        expect(rows.every(r => r.reconcileRow === undefined)).toBe(true)
    })
})

describe('reversalOriginsQuery', () => {
    it('returns the id and number of the reversed entry', async () => {
        const { entries } = stores({})
        const rows = await run(reversalOriginsQuery(entries, ['je_1046']))
        expect(rows.map(({ id, number }) => ({ id, number }))).toEqual([
            { id: 'je_1046', number: 'JE-1046' },
        ])
    })
})

describe('openingTotalsQuery', () => {
    it('sums the periods before the month of range.start', async () => {
        const { balances } = stores({})
        const rows = await run(openingTotalsQuery(balances, REGISTER_ACCOUNT_ID, RANGE))
        expect(rows).toHaveLength(1)
        expect(rows[0].debit_total).toBe(10_715_500)
        expect(rows[0].credit_total).toBe(9_289_250)
    })

    it('leaves out the period that holds range.start', async () => {
        const { balances } = stores({})
        const rows = await run(
            openingTotalsQuery(balances, REGISTER_ACCOUNT_ID, {
                start: '2026-08-10',
                end: '2026-10-23',
            })
        )
        expect(rows).toHaveLength(0)
    })

    it('returns no row for an account without balance rows', async () => {
        const { balances } = stores({})
        const rows = await run(openingTotalsQuery(balances, 'acct_exp_0002', RANGE))
        expect(rows).toHaveLength(0)
    })
})

describe('subAccountQuery and anyActivityQuery', () => {
    it('finds a sub-account of a parent and none for a leaf', async () => {
        const { accounts } = stores({})
        const parent = await run(subAccountQuery(accounts, 'acct_bank_0001'))
        const leaf = await run(subAccountQuery(accounts, REGISTER_ACCOUNT_ID))
        expect(parent).toHaveLength(1)
        expect(parent[0].id).not.toBe('acct_bank_0001')
        expect(leaf).toHaveLength(0)
    })

    it('finds one balance row for the register account and none for an idle account', async () => {
        const { balances } = stores({})
        const busy = await run(anyActivityQuery(balances, REGISTER_ACCOUNT_ID))
        const idle = await run(anyActivityQuery(balances, 'acct_exp_0002'))
        expect(busy).toHaveLength(1)
        expect(busy[0].account).toBe(REGISTER_ACCOUNT_ID)
        expect(idle).toHaveLength(0)
    })
})
