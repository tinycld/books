// Synthetic Trial Balance for the helix reference route and the e2e seed. The ledger
// names its accounts by the seeded e2e book's keys (seed-accounts.ts), its
// retained-earnings account included. The run results are typed
// against core's report contract, so tsc checks every field. Money is integer cents.
import type { ParamDef } from '@tinycld/core/reports/lib/spec'
import type {
    ParamOptionsPage,
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import type { BooksAccounts } from '../types'
import { SEED_ACCOUNTS } from './seed-accounts'

// "Today" for the reference captures, so End of last month resolves to a stable day.
export const TRIAL_BALANCE_TODAY = '2026-11-04'
export const TRIAL_BALANCE_AS_OF = '2026-10-31'
export const TRIAL_BALANCE_HEADING = 'Harbor Lane Design LLC'
export const TRIAL_BALANCE_TITLE = 'Trial Balance'
const CURRENCY = 'USD'

// The params as the shipped spec declares them (server/report_trial_balance.go builds
// the same list in Go; its test pins the Go side).
export const TRIAL_BALANCE_PARAMS: ParamDef[] = [
    { id: 'asOf', type: 'asOf', label: 'As of', default: { preset: 'endOfLastMonth' } },
    {
        id: 'rows',
        type: 'choice',
        label: 'Rows',
        options: [
            { value: 'nonzero', label: 'Non-zero' },
            { value: 'active', label: 'Active' },
            { value: 'all', label: 'All' },
        ],
        default: 'nonzero',
    },
    {
        id: 'accounts',
        type: 'choice',
        label: 'Accounts',
        multiple: true,
        optionsFrom: {
            source: 'books.accounts',
            value: [{ field: 'id' }],
            label: [{ field: 'full_name' }],
            group: [{ field: 'type' }],
        },
    },
]

// A posted entry two calendar years before the seed runs, so the seeded book's Trial
// Balance shows the retained-earnings fold. [account key, debit, credit] in cents.
export const PRIOR_YEAR_SEED = {
    yearsAgo: 2,
    day: '08-15',
    memo: 'Prior-year consulting',
    lines: [
        ['receivable', 300000, 0],
        ['consulting', 0, 300000],
    ] as [string, number, number][],
}

type TrialBalanceAccount = Pick<
    BooksAccounts,
    'id' | 'number' | 'full_name' | 'type' | 'inactive'
> & {
    key: string
}

function account(key: string, id: string, fullName?: string): TrialBalanceAccount {
    const seeded = SEED_ACCOUNTS.find(a => a.key === key)
    if (!seeded) throw new Error(`trial-balance fixture: no seeded account ${key}`)
    return {
        id,
        key,
        number: seeded.number,
        full_name: fullName ?? seeded.name,
        type: seeded.type,
        inactive: seeded.inactive === true,
    } satisfies TrialBalanceAccount
}

// Chart order: account type in account_types.json order, then number.
export const TRIAL_BALANCE_ACCOUNTS: TrialBalanceAccount[] = [
    account('checking', 'tbacct00checkng'),
    account('receivable', 'tbacct0receivbl'),
    account('equipment', 'tbacct0equipmnt'),
    account('card', 'tbacct0000card0'),
    account('equity', 'tbacct000equity'),
    account('retained', 'tbacct0retained'),
    account('consulting', 'tbacct0consultg'),
    account('rent', 'tbacct00000rent'),
    account('software', 'tbacct0software'),
    account('design-tools', 'tbacct0designtl', 'Software Subscriptions:Design Tools'),
    account('petty', 'tbacct000petty0'),
]

// Net (debits − credits) as of TRIAL_BALANCE_AS_OF. Software Subscriptions has no
// lines (it shows only under Rows = All); Old Petty Cash nets to zero (Active shows
// 0.00, Non-zero hides it). Debit and credit balances each add to 33,649.00.
const NET: Record<string, number | null> = {
    checking: 2220000,
    receivable: 750000,
    equipment: 210000,
    card: -114900,
    equity: -2500000,
    retained: -300000,
    consulting: -450000,
    rent: 180000,
    software: null,
    'design-tools': 4900,
    petty: 0,
}

// The opened account's posted lines, labelled "<date> · <entry number> · <memo>".
const CHECKING_LINES = [
    { id: 'tbline000000002', label: '2026-01-02 · JE-2 · Owner investment', net: 2500000 },
    { id: 'tbline000000003', label: '2026-01-05 · JE-3 · January rent', net: -180000 },
    { id: 'tbline000000004', label: '2026-03-12 · JE-6 · Card payment', net: -100000 },
    { id: 'tbline000000005', label: '2026-04-01 · JE-7 · Petty cash float', net: -5000 },
    { id: 'tbline000000006', label: '2026-04-30 · JE-8 · Petty cash returned', net: 5000 },
]

export const TRIAL_BALANCE_COLUMNS: ResultColumn[] = [
    {
        id: 'account',
        label: 'Account',
        type: 'relation',
        labelCell: 'account@label',
        labelType: 'text',
    },
    { id: 'number', label: 'No.', type: 'text' },
    { id: 'debit', label: 'Debit', type: 'money', currency: CURRENCY },
    { id: 'credit', label: 'Credit', type: 'money', currency: CURRENCY },
]

type RowsChoice = 'nonzero' | 'active' | 'all'

function debitOf(net: number | null): number | null {
    if (net === null) return null
    return net >= 0 ? net : null
}

function creditOf(net: number | null): number | null {
    if (net === null || net >= 0) return null
    return -net
}

function isShown(net: number | null, rows: RowsChoice): boolean {
    if (rows === 'all') return true
    if (rows === 'active') return net !== null
    return net !== null && net !== 0
}

function accountRow(acct: TrialBalanceAccount, expanded: boolean): ResultRow {
    const net = NET[acct.key] ?? null
    return {
        id: `g:${JSON.stringify([acct.id, CURRENCY])}`,
        kind: 'group',
        depth: 0,
        label: acct.full_name,
        groupKey: [acct.id, CURRENCY],
        expanded,
        canExpand: net !== null,
        cells: {
            account: acct.id,
            'account@label': acct.full_name,
            number: acct.number,
            debit: debitOf(net),
            credit: creditOf(net),
        },
    }
}

function lineRows(section: string): ResultRow[] {
    return CHECKING_LINES.map(line => ({
        id: `d:${line.id}`,
        kind: 'detail',
        depth: 1,
        label: line.label,
        section,
        cells: { number: '', debit: debitOf(line.net), credit: creditOf(line.net) },
    }))
}

function totalRow(shown: TrialBalanceAccount[]): ResultRow {
    const nets = shown.map(acct => NET[acct.key] ?? null)
    const sum = (values: (number | null)[]) => values.reduce<number>((a, v) => a + (v ?? 0), 0)
    return {
        id: `total:${JSON.stringify([CURRENCY])}`,
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: { debit: sum(nets.map(debitOf)), credit: sum(nets.map(creditOf)) },
    }
}

interface ResultInput {
    rows: RowsChoice
    /** Account ids the Accounts filter keeps. */
    accounts?: string[]
    openKey?: string
    asOf?: string
}

function resolvedParams(input: ResultInput): ResolvedParam[] {
    return [
        { id: 'asOf', type: 'asOf', value: input.asOf ?? TRIAL_BALANCE_AS_OF },
        { id: 'rows', type: 'choice', value: input.rows },
        input.accounts
            ? { id: 'accounts', type: 'choice', list: input.accounts }
            : { id: 'accounts', type: 'choice', unset: true },
    ]
}

export function trialBalanceResult(input: ResultInput): RunResult {
    const shown = TRIAL_BALANCE_ACCOUNTS.filter(
        acct =>
            isShown(NET[acct.key] ?? null, input.rows) &&
            (!input.accounts || input.accounts.includes(acct.id))
    )
    const rows = shown.flatMap(acct => {
        const isOpen = acct.key === input.openKey
        const row = accountRow(acct, isOpen)
        return isOpen ? [row, ...lineRows(row.id)] : [row]
    })
    return {
        columns: TRIAL_BALANCE_COLUMNS,
        rows: [...rows, totalRow(shown)],
        notices: [],
        topics: [
            'collection/books_journal_lines',
            'collection/books_accounts',
            'collection/books_settings',
        ],
        heading: TRIAL_BALANCE_HEADING,
        page: null,
        params: resolvedParams(input),
    }
}

// A run as of a day before any posted line: only the Total row, so the view is empty.
export function emptyTrialBalanceResult(asOf: string, accounts?: string[]): RunResult {
    return {
        ...trialBalanceResult({ rows: 'nonzero', asOf, accounts }),
        rows: [totalRow([])],
    }
}

// The Accounts picker's first page, as POST /api/reports/param-options answers it.
export const ACCOUNT_OPTIONS_PAGE: ParamOptionsPage = {
    options: TRIAL_BALANCE_ACCOUNTS.filter(acct => !acct.inactive).map(acct => ({
        value: acct.id,
        label: acct.full_name,
        group: acct.type,
    })),
    groups: [
        { value: 'bank', label: 'Bank' },
        { value: 'accounts_receivable', label: 'Accounts receivable' },
        { value: 'fixed_asset', label: 'Fixed asset' },
        { value: 'credit_card', label: 'Credit card' },
        { value: 'equity', label: 'Equity' },
        { value: 'income', label: 'Income' },
        { value: 'expense', label: 'Expense' },
    ],
}
