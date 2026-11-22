import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { maxStoredAmount } from '../tinycld/books/lib/money-text'
import {
    accountParamTarget,
    batchResultText,
    countText,
    lineStatusText,
    offeredAccountKeyActions,
    RECONCILE_ACCOUNT_KEY_LABELS,
    RECONCILE_ACCOUNT_KEYS,
    RECONCILE_ACCOUNT_TYPES,
    RECONCILE_TEXTS,
    type ReconcileFilters,
    type ReconcileSort,
    reconcileStartSchema,
    reconcileTotals,
    shownRows,
    sideWords,
    stampedTotals,
} from '../tinycld/books/lib/reconcile'
import type { BooksReconcileLines } from '../tinycld/books/types'

// The pure parts of the reconcile screens (reconcile spec §3 "Words", "The summary band",
// "The start dialog"; plan checkpoint 2). `reconcileTotals` and `reconcileStartSchema` run the
// case table the Go test runs too (server/testdata/reconcile_cases.json), so the client and
// the server agree on the sums and on the date rule.

type TotalsCase = {
    name: string
    accountType: string
    beginning: number
    statement: number
    lines: { debit: number; credit: number }[]
    clearedOut: number
    clearedIn: number
    outCount: number
    inCount: number
    clearedBalance: number
    difference: number
}

type DateCase = { name: string; lastDate: string; date: string; ok: boolean }

const CASES: { totals: TotalsCase[]; dates: DateCase[] } = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'reconcile_cases.json'), 'utf8')
)

function reconciliation(
    seed: Partial<{
        beginning_balance: number
        statement_balance: number
        has_statement_totals: boolean
        statement_out: number
        statement_in: number
    }> = {}
) {
    return {
        beginning_balance: 0,
        statement_balance: 0,
        has_statement_totals: false,
        statement_out: 0,
        statement_in: 0,
        ...seed,
    }
}

function cleared(debit: number, credit: number) {
    return { debit, credit, isCleared: true }
}

function notCleared(debit: number, credit: number) {
    return { debit, credit, isCleared: false }
}

describe('RECONCILE_ACCOUNT_TYPES', () => {
    it('is bank and credit card', () => {
        expect(RECONCILE_ACCOUNT_TYPES).toEqual(['bank', 'credit_card'])
    })
})

describe('reconcileTotals', () => {
    it.each(CASES.totals.map(c => [c.name, c] as const))('%s', (_name, c) => {
        const totals = reconcileTotals(
            c.lines.map(line => cleared(line.debit, line.credit)),
            reconciliation({ beginning_balance: c.beginning, statement_balance: c.statement }),
            c.accountType
        )
        expect(totals.beginning).toBe(c.beginning)
        expect(totals.clearedOut).toBe(c.clearedOut)
        expect(totals.clearedIn).toBe(c.clearedIn)
        expect(totals.outCount).toBe(c.outCount)
        expect(totals.inCount).toBe(c.inCount)
        expect(totals.clearedBalance).toBe(c.clearedBalance)
        expect(totals.difference).toBe(c.difference)
        expect(totals.isTooLarge).toBe(false)
    })

    it('adds nothing for a row that is not cleared', () => {
        const rows = [
            cleared(50_000, 0),
            notCleared(0, 25_000),
            cleared(0, 30_000),
            notCleared(17_500, 0),
        ]
        const totals = reconcileTotals(
            rows,
            reconciliation({ beginning_balance: 100_000, statement_balance: 115_200 }),
            'bank'
        )
        expect(totals.clearedOut).toBe(30_000)
        expect(totals.clearedIn).toBe(50_000)
        expect(totals.outCount).toBe(1)
        expect(totals.inCount).toBe(1)
        expect(totals.clearedBalance).toBe(120_000)
        expect(totals.difference).toBe(-4_800)
    })

    it('adds nothing when no row is cleared', () => {
        const totals = reconcileTotals(
            [notCleared(50_000, 0), notCleared(0, 9_000)],
            reconciliation({ beginning_balance: 7_000, statement_balance: 57_000 }),
            'credit_card'
        )
        expect(totals.clearedOut).toBe(0)
        expect(totals.clearedIn).toBe(0)
        expect(totals.outCount).toBe(0)
        expect(totals.inCount).toBe(0)
        expect(totals.clearedBalance).toBe(7_000)
        expect(totals.difference).toBe(50_000)
    })

    it('gives each side the statement total less the cleared sum: 0, under (positive), over (negative)', () => {
        const rows = [cleared(0, 55_000), cleared(17_500, 0)]
        const even = reconcileTotals(
            rows,
            reconciliation({
                has_statement_totals: true,
                statement_out: 55_000,
                statement_in: 17_500,
            }),
            'bank'
        )
        expect(even.outOff).toBe(0)
        expect(even.inOff).toBe(0)

        const off = reconcileTotals(
            rows,
            reconciliation({
                has_statement_totals: true,
                statement_out: 58_000,
                statement_in: 15_000,
            }),
            'bank'
        )
        expect(off.outOff).toBe(3_000)
        expect(off.inOff).toBe(-2_500)

        const card = reconcileTotals(
            rows,
            reconciliation({
                has_statement_totals: true,
                statement_out: 50_000,
                statement_in: 20_000,
            }),
            'credit_card'
        )
        expect(card.outOff).toBe(-5_000)
        expect(card.inOff).toBe(2_500)
    })

    it('sets isTooLarge when a sum is above maxStoredAmount', () => {
        const half = Math.ceil(maxStoredAmount / 2) + 1
        const deposits = reconcileTotals(
            [cleared(half, 0), cleared(half, 0)],
            reconciliation(),
            'bank'
        )
        expect(deposits.isTooLarge).toBe(true)

        const payments = reconcileTotals(
            [cleared(0, half), cleared(0, half)],
            reconciliation(),
            'credit_card'
        )
        expect(payments.isTooLarge).toBe(true)

        const fits = reconcileTotals(
            [cleared(half, 0), notCleared(half, 0)],
            reconciliation(),
            'bank'
        )
        expect(fits.isTooLarge).toBe(false)
    })
})

describe('reconcileStartSchema', () => {
    const TODAY = '2026-11-21'

    function values(
        seed: Partial<Record<'balance' | 'date' | 'statementOut' | 'statementIn', string>>
    ) {
        return { balance: '500.00', date: '2026-11-20', statementOut: '', statementIn: '', ...seed }
    }

    function issuesOf(lastDate: string, seed: Parameters<typeof values>[0], today: string = TODAY) {
        const result = reconcileStartSchema(lastDate, today).safeParse(values(seed))
        if (result.success) return []
        return result.error.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message,
        }))
    }

    function pathsOf(lastDate: string, seed: Parameters<typeof values>[0]) {
        return issuesOf(lastDate, seed).map(issue => issue.path)
    }

    // The case table has no today; one far after every case date keeps the today rule out.
    it.each(CASES.dates.map(c => [c.name, c] as const))('%s', (_name, c) => {
        const result = reconcileStartSchema(c.lastDate, '2030-12-31').safeParse(
            values({ date: c.date })
        )
        expect(result.success).toBe(c.ok)
        if (!c.ok) {
            expect(result.error?.issues.map(issue => issue.path.join('.'))).toContain('date')
        }
    })

    it('accepts a full start with both statement totals', () => {
        expect(issuesOf('2026-09-30', { statementOut: '580.00', statementIn: '175.00' })).toEqual(
            []
        )
    })

    it('refuses an empty ending balance', () => {
        expect(pathsOf('', { balance: '' })).toEqual(['balance'])
        expect(pathsOf('', { balance: '   ' })).toEqual(['balance'])
    })

    it('refuses malformed money', () => {
        expect(pathsOf('', { balance: '12.3.4' })).toEqual(['balance'])
        expect(pathsOf('', { balance: 'abc' })).toEqual(['balance'])
    })

    it('refuses an ending balance above maxStoredAmount', () => {
        // maxStoredAmount is 2^53-1 cents: 90,071,992,547,409.91.
        expect(pathsOf('', { balance: '90071992547409.91' })).toEqual([])
        expect(pathsOf('', { balance: '90071992547409.92' })).toEqual(['balance'])
        expect(pathsOf('', { balance: '-90071992547409.92' })).toEqual(['balance'])
    })

    it('accepts a negative ending balance (an overdrawn account)', () => {
        expect(pathsOf('', { balance: '-120.00' })).toEqual([])
        expect(pathsOf('', { balance: '-1,250.50' })).toEqual([])
    })

    it('refuses a day that is not real', () => {
        expect(pathsOf('', { date: '2026-02-30' })).toEqual(['date'])
        expect(pathsOf('', { date: '2026-13-01' })).toEqual(['date'])
        expect(pathsOf('', { date: '' })).toEqual(['date'])
    })

    it('refuses a date on the last reconciled statement date, naming it', () => {
        expect(issuesOf('2026-09-30', { date: '2026-09-30' })).toEqual([
            {
                path: 'date',
                message: 'The date must be after Sep 30, 2026, the last reconciled statement.',
            },
        ])
        expect(issuesOf('2026-09-30', { date: '2026-10-01' })).toEqual([])
    })

    it('refuses a date after today', () => {
        expect(issuesOf('', { date: '2026-11-22' })).toEqual([
            { path: 'date', message: 'The date cannot be after today.' },
        ])
        expect(issuesOf('', { date: TODAY })).toEqual([])
    })

    it('refuses one statement total without the other', () => {
        const both = { path: 'statementIn', message: 'Enter both totals, or neither.' }
        expect(issuesOf('', { statementOut: '580.00', statementIn: '' })).toEqual([both])
        expect(issuesOf('', { statementOut: '', statementIn: '175.00' })).toEqual([both])
        expect(issuesOf('', { statementOut: '', statementIn: '' })).toEqual([])
    })

    it('refuses a negative statement total', () => {
        expect(pathsOf('', { statementOut: '-5.00', statementIn: '175.00' })).toEqual([
            'statementOut',
        ])
        expect(pathsOf('', { statementOut: '580.00', statementIn: '-1.00' })).toEqual([
            'statementIn',
        ])
        expect(pathsOf('', { statementOut: '0', statementIn: '0.00' })).toEqual([])
    })
})

describe('sideWords', () => {
    it('names a bank account’s sides Payments and Deposits, payments taken away', () => {
        expect(sideWords('bank')).toEqual({
            out: 'Payments',
            in: 'Deposits',
            outColumn: 'Payment',
            inColumn: 'Deposit',
            outOne: 'payment',
            outMany: 'payments',
            inOne: 'deposit',
            inMany: 'deposits',
            outOperator: '−',
            inOperator: '+',
        })
    })

    it('names a credit card account’s sides Charges and Payments, charges added', () => {
        expect(sideWords('credit_card')).toEqual({
            out: 'Charges',
            in: 'Payments',
            outColumn: 'Charge',
            inColumn: 'Payment',
            outOne: 'charge',
            outMany: 'charges',
            inOne: 'payment',
            inMany: 'payments',
            outOperator: '+',
            inOperator: '−',
        })
    })
})

describe('accountParamTarget', () => {
    const checking = { account: { id: 'acctchecking001', type: 'bank' }, inProgress: undefined }
    const savings = {
        account: { id: 'acctsavings0001', type: 'bank' },
        inProgress: { id: 'recsavings00001' },
    }
    const card = { account: { id: 'acctcard0000001', type: 'credit_card' }, inProgress: undefined }
    const expense = { account: { id: 'acctexpense0001', type: 'expense' }, inProgress: undefined }
    const rows = [checking, savings, card, expense]

    it('opens the work screen of a listed account’s reconciliation in progress', () => {
        expect(
            accountParamTarget({
                accountId: 'acctsavings0001',
                canWrite: true,
                rows,
                paramInProgress: undefined,
            })
        ).toEqual({ kind: 'work', id: 'recsavings00001' })
    })

    it('opens the work screen of an inactive account’s reconciliation in progress', () => {
        expect(
            accountParamTarget({
                accountId: 'acctinactive001',
                canWrite: true,
                rows,
                paramInProgress: { id: 'recinactive0001', account: 'acctinactive001' },
            })
        ).toEqual({ kind: 'work', id: 'recinactive0001' })
    })

    it('opens the start dialog for a listed account with none in progress', () => {
        expect(
            accountParamTarget({
                accountId: 'acctchecking001',
                canWrite: true,
                rows,
                paramInProgress: undefined,
            })
        ).toEqual({ kind: 'start', accountId: 'acctchecking001' })
        expect(
            accountParamTarget({
                accountId: 'acctcard0000001',
                canWrite: true,
                rows,
                paramInProgress: undefined,
            })
        ).toEqual({ kind: 'start', accountId: 'acctcard0000001' })
    })

    it('does nothing for a reader', () => {
        expect(
            accountParamTarget({
                accountId: 'acctchecking001',
                canWrite: false,
                rows,
                paramInProgress: undefined,
            })
        ).toEqual({ kind: 'none' })
        expect(
            accountParamTarget({
                accountId: 'acctsavings0001',
                canWrite: false,
                rows,
                paramInProgress: undefined,
            })
        ).toEqual({ kind: 'none' })
    })

    it('does nothing for an unknown id or no id', () => {
        expect(
            accountParamTarget({
                accountId: 'acctunknown0001',
                canWrite: true,
                rows,
                paramInProgress: undefined,
            })
        ).toEqual({ kind: 'none' })
        expect(
            accountParamTarget({
                accountId: undefined,
                canWrite: true,
                rows,
                paramInProgress: undefined,
            })
        ).toEqual({ kind: 'none' })
    })

    it('does nothing for an account of a type that cannot be reconciled', () => {
        expect(
            accountParamTarget({
                accountId: 'acctexpense0001',
                canWrite: true,
                rows,
                paramInProgress: undefined,
            })
        ).toEqual({ kind: 'none' })
    })
})

// A finished reconciliation's band reads the sums the server stamped at finish, not its lines.
describe('stampedTotals', () => {
    function stamped(
        seed: Partial<{
            beginning_balance: number
            statement_balance: number
            cleared_out: number
            cleared_in: number
            cleared_out_count: number
            cleared_in_count: number
        }>
    ) {
        return {
            ...reconciliation(),
            cleared_out: 0,
            cleared_in: 0,
            cleared_out_count: 0,
            cleared_in_count: 0,
            ...seed,
        }
    }

    it('gives a bank reconciliation its stamped counts and takes payments away', () => {
        const totals = stampedTotals(
            stamped({
                beginning_balance: 100_000,
                statement_balance: 95_000,
                cleared_out: 30_000,
                cleared_in: 20_000,
                cleared_out_count: 3,
                cleared_in_count: 2,
            }),
            'bank'
        )
        expect(totals.outCount).toBe(3)
        expect(totals.inCount).toBe(2)
        expect(totals.beginning).toBe(100_000)
        expect(totals.clearedOut).toBe(30_000)
        expect(totals.clearedIn).toBe(20_000)
        expect(totals.clearedBalance).toBe(90_000)
        expect(totals.difference).toBe(5_000)
    })

    it('gives a card reconciliation its stamped counts and adds charges', () => {
        const totals = stampedTotals(
            stamped({
                beginning_balance: 50_000,
                statement_balance: 70_000,
                cleared_out: 30_000,
                cleared_in: 10_000,
                cleared_out_count: 4,
                cleared_in_count: 0,
            }),
            'credit_card'
        )
        expect(totals.outCount).toBe(4)
        expect(totals.inCount).toBe(0)
        expect(totals.clearedBalance).toBe(70_000)
        expect(totals.difference).toBe(0)
    })
})

describe('countText', () => {
    it('is singular for 1 and plural for 0 and for more', () => {
        expect(countText(1, 'payment', 'payments')).toBe('1 payment')
        expect(countText(0, 'payment', 'payments')).toBe('0 payments')
        expect(countText(3, 'payment', 'payments')).toBe('3 payments')
    })
})

// The accounts screen's key map (reconcile spec §3 "Keys"; §4 "Tests the plan must carry").
describe('accounts screen keys', () => {
    it('maps ↓ / J, ↑ / K and ↵', () => {
        expect(RECONCILE_ACCOUNT_KEYS).toEqual({
            next: ['ArrowDown', 'j'],
            previous: ['ArrowUp', 'k'],
            open: ['Enter'],
        })
    })

    it('labels each action once', () => {
        expect(RECONCILE_ACCOUNT_KEY_LABELS).toEqual({
            next: 'Next account',
            previous: 'Previous account',
            open: 'Reconcile, resume or view',
        })
    })

    it('offers ↵ only while a row has the focus', () => {
        expect(offeredAccountKeyActions(false)).toEqual(['next', 'previous'])
        expect(offeredAccountKeyActions(true)).toEqual(['next', 'previous', 'open'])
    })
})

// The work screen's shown rows (reconcile spec §3 "Toolbar", "The list (wide)"; §4 "Reads":
// the side, the search, the Show choice and the column order, computed from the one lines
// query's rows). A row is the lines query's row: the view's columns, then isCleared and
// clearedId (hooks/useReconcileLines.ts).
type LineRow = BooksReconcileLines & { isCleared: boolean; clearedId: string }

function line(seed: Partial<LineRow> & Pick<LineRow, 'id'>): LineRow {
    return {
        line: seed.id,
        account: 'acctreconcile01',
        entry: `entry-${seed.id}`,
        date: '2026-10-01',
        debit: 0,
        credit: 0,
        memo: '',
        number: '10',
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
    return line({
        reconciliation: 'recnworkscreen1',
        isCleared: true,
        clearedId: `c-${seed.id}`,
        ...seed,
    })
}

const ALL_FILTERS: ReconcileFilters = { side: 'all', search: '', show: 'all' }
const BY_DATE: ReconcileSort = { column: 'date', direction: 'asc' }

function idsOf(rows: readonly { id: string }[]): string[] {
    return rows.map(row => row.id)
}

// Two payments and two deposits, each on its own day, one of each cleared. No text of the
// $250.00 payment holds "250"; the memo of the $175.00 deposit does ("Invoice 2501").
const PAY_RETAINER = line({
    id: 'payretainer0001',
    date: '2026-10-03',
    number: '12',
    credit: 25_000,
    payee: 'Robertson & Associates',
    memo: 'Retainer for October',
})
const PAY_POWER = clearedLine({
    id: 'paypower0000001',
    date: '2026-10-05',
    number: '13',
    credit: 4_500,
    payee: 'Pacific Power',
    memo: 'Account 4471-220',
})
const DEP_INVOICE = line({
    id: 'depinvoice00001',
    date: '2026-10-04',
    number: '14',
    debit: 17_500,
    payee: 'Harborview Kitchen',
    memo: 'Invoice 2501 deposit',
})
const DEP_INTEREST = clearedLine({
    id: 'depinterest0001',
    date: '2026-10-06',
    number: '15',
    debit: 2_500,
    memo: 'Interest',
})

// Out of order on purpose: shownRows sorts.
const ROWS = [DEP_INTEREST, PAY_POWER, DEP_INVOICE, PAY_RETAINER]

function shown(filters: Partial<ReconcileFilters>, sort: ReconcileSort = BY_DATE): string[] {
    return idsOf(shownRows(ROWS, { ...ALL_FILTERS, ...filters }, sort))
}

describe('shownRows', () => {
    it('keeps every row, oldest first, with no filter', () => {
        expect(shown({})).toEqual([PAY_RETAINER.id, DEP_INVOICE.id, PAY_POWER.id, DEP_INTEREST.id])
    })

    it('keeps only rows with a credit on the out side, only rows with a debit on the in side', () => {
        expect(shown({ side: 'out' })).toEqual([PAY_RETAINER.id, PAY_POWER.id])
        expect(shown({ side: 'in' })).toEqual([DEP_INVOICE.id, DEP_INTEREST.id])
    })

    it('keeps a row only when each piece of the search is in its number, payee or memo', () => {
        // One piece in the memo, the other in the payee.
        expect(shown({ search: 'retainer%robertson' })).toEqual([PAY_RETAINER.id])
        // The second piece is in no text of the retainer row.
        expect(shown({ search: 'retainer%pacific' })).toEqual([])
        // The number.
        expect(shown({ search: '14' })).toEqual([DEP_INVOICE.id])
        expect(shown({ search: '13%power' })).toEqual([PAY_POWER.id])
    })

    it('ignores case in the search', () => {
        expect(shown({ search: 'ROBERTSON' })).toEqual([PAY_RETAINER.id])
        expect(shown({ search: 'harborVIEW%INVOICE' })).toEqual([DEP_INVOICE.id])
    })

    it('also keeps a row whose amount is the searched amount', () => {
        // "250" is in the deposit's memo and is the retainer's amount; $25.00 is not $250.00.
        expect(shown({ search: '250' })).toEqual([PAY_RETAINER.id, DEP_INVOICE.id])
        // "250.00" is in no text: only the amount matches.
        expect(shown({ search: '250.00' })).toEqual([PAY_RETAINER.id])
        expect(shown({ search: '175' })).toEqual([DEP_INVOICE.id])
    })

    it('keeps only the rows that are not cleared, or only the cleared rows', () => {
        expect(shown({ show: 'uncleared' })).toEqual([PAY_RETAINER.id, DEP_INVOICE.id])
        expect(shown({ show: 'cleared' })).toEqual([PAY_POWER.id, DEP_INTEREST.id])
    })

    it('applies the side, the search and Show together', () => {
        expect(shown({ side: 'out', show: 'uncleared', search: 'robertson' })).toEqual([
            PAY_RETAINER.id,
        ])
        expect(shown({ side: 'in', show: 'uncleared', search: 'robertson' })).toEqual([])
        expect(shown({ side: 'out', show: 'cleared', search: 'pacific' })).toEqual([PAY_POWER.id])
        expect(shown({ side: 'out', show: 'cleared', search: 'robertson' })).toEqual([])
        expect(shown({ side: 'in', show: 'cleared', search: '25.00' })).toEqual([DEP_INTEREST.id])
    })

    it('orders by date, then entry number, then id by default', () => {
        const late = line({ id: 'zz0000000000001', date: '2026-10-02', number: '20' })
        const lateSameNumber = line({ id: 'aa0000000000001', date: '2026-10-02', number: '20' })
        const lateLowNumber = line({ id: 'mm0000000000001', date: '2026-10-02', number: '19' })
        const early = line({ id: 'yy0000000000001', date: '2026-10-01', number: '30' })
        const rows = [late, early, lateSameNumber, lateLowNumber]
        expect(idsOf(shownRows(rows, ALL_FILTERS, BY_DATE))).toEqual([
            early.id,
            lateLowNumber.id,
            lateSameNumber.id,
            late.id,
        ])
    })

    it('sorts by date newest first', () => {
        expect(shown({}, { column: 'date', direction: 'desc' })).toEqual([
            DEP_INTEREST.id,
            PAY_POWER.id,
            DEP_INVOICE.id,
            PAY_RETAINER.id,
        ])
    })

    it('sorts by the out amount both ways, with the in side last', () => {
        const up = shown({}, { column: 'out', direction: 'asc' })
        expect(up.slice(0, 2)).toEqual([PAY_POWER.id, PAY_RETAINER.id])
        expect([...up.slice(2)].sort()).toEqual([DEP_INTEREST.id, DEP_INVOICE.id].sort())

        const down = shown({}, { column: 'out', direction: 'desc' })
        expect(down.slice(0, 2)).toEqual([PAY_RETAINER.id, PAY_POWER.id])
        expect([...down.slice(2)].sort()).toEqual([DEP_INTEREST.id, DEP_INVOICE.id].sort())
    })

    it('sorts by the in amount both ways, with the out side last', () => {
        const up = shown({}, { column: 'in', direction: 'asc' })
        expect(up.slice(0, 2)).toEqual([DEP_INTEREST.id, DEP_INVOICE.id])
        expect([...up.slice(2)].sort()).toEqual([PAY_POWER.id, PAY_RETAINER.id].sort())

        const down = shown({}, { column: 'in', direction: 'desc' })
        expect(down.slice(0, 2)).toEqual([DEP_INVOICE.id, DEP_INTEREST.id])
        expect([...down.slice(2)].sort()).toEqual([PAY_POWER.id, PAY_RETAINER.id].sort())
    })

    it('sorts only the rows the filters keep', () => {
        expect(shown({ side: 'out' }, { column: 'out', direction: 'desc' })).toEqual([
            PAY_RETAINER.id,
            PAY_POWER.id,
        ])
    })
})

// The result line of the two batches (reconcile spec §3 "Clearing").
describe('batchResultText', () => {
    it('counts the cleared and the uncleared transactions', () => {
        expect(batchResultText({ action: 'clear', done: 42, failed: 0, messages: [] })).toBe(
            'Cleared 42 transactions.'
        )
        expect(batchResultText({ action: 'unclear', done: 42, failed: 0, messages: [] })).toBe(
            'Uncleared 42 transactions.'
        )
        expect(batchResultText({ action: 'unclear', done: 1, failed: 0, messages: [] })).toBe(
            'Uncleared 1 transaction.'
        )
        expect(batchResultText({ action: 'clear', done: 1, failed: 0, messages: [] })).toBe(
            'Cleared 1 transaction.'
        )
    })

    it('reads the server’s message when every failure has the same one', () => {
        const message = 'This reconciliation is finished.'
        expect(
            batchResultText({ action: 'clear', done: 40, failed: 2, messages: [message, message] })
        ).toBe(message)
        expect(
            batchResultText({ action: 'unclear', done: 0, failed: 1, messages: [message] })
        ).toBe(message)
    })

    it('counts the failures of the batch when their messages differ', () => {
        expect(
            batchResultText({
                action: 'clear',
                done: 39,
                failed: 3,
                messages: ['Expense 12 is void.', 'Expense 13 is void.', 'Expense 12 is void.'],
            })
        ).toBe('3 of 42 transactions could not be cleared. Try again.')
    })
})

// The register's Status word of a line (reconcile spec §3 "The account register").
describe('lineStatusText', () => {
    const word = (reconciliation: string, finished: boolean, bank_matched: boolean) =>
        lineStatusText({ reconciliation, finished, bank_matched })

    it('is empty for a line with no view row', () => {
        expect(lineStatusText(undefined)).toBe('')
    })

    it('reads Reconciled for a line of a finished reconciliation', () => {
        expect(word('rec_finished_01', true, false)).toBe('Reconciled')
        expect(word('rec_finished_01', true, true)).toBe('Reconciled')
    })

    it('reads Cleared for a line of a reconciliation in progress', () => {
        expect(word('rec_progress_01', false, false)).toBe('Cleared')
    })

    it('reads Matched for a line that is only matched to a bank transaction', () => {
        expect(word('', false, true)).toBe('Matched')
    })

    it('reads Cleared for a line that is cleared and matched', () => {
        expect(word('rec_progress_01', false, true)).toBe('Cleared')
    })

    it('is empty for a line that is neither cleared nor matched', () => {
        expect(word('', false, false)).toBe('')
    })
})

describe('the transport failure text', () => {
    it('asks to check the connection', () => {
        expect(RECONCILE_TEXTS.sendFailed).toBe(
            'The change could not be sent. Check your connection and try again.'
        )
    })
})
