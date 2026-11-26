// Synthetic data for the helix reference route of the reconciliation history, the undo and
// the Reconciliation Report (the Reconciliation Report design spec). Plain data, and
// it imports only types and other plain data, because the seed graph runs in plain node
// (tests/seed-node.test.ts). Amounts are integer minor units (cents). Accounts are the
// seeded e2e book's, by number, and 1020, the long-named account of reconcile-fixture.ts.
//
// Signs follow reconcile-fixture.ts: `statement_balance` and `beginning_balance` are in the
// account's own sense (money in a bank account, owed on a card); `_out` is the credit side
// (a bank payment, a card charge) and `_in` the debit side.
import type { DisplayLayout, ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type {
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import type { BooksAccounts, BooksReconciledLines, BooksReconciliations } from '../types'
import { BANK_USERS } from './bank-connection-fixture'
import {
    RECONCILE_ACCOUNT_IDS,
    RECONCILE_ACCOUNTS,
    RECONCILE_LONG_MEMO,
    RECONCILE_LONG_PAYEE,
} from './reconcile-fixture'

const CURRENCY = 'USD'
const ACCOUNTS = RECONCILE_ACCOUNT_IDS

// 62 characters: the Reconciled cell and the card's third line must end in an ellipsis.
export const RECONCILIATION_LONG_PERSON =
    'Marcus Bellweather-Okonkwo of Harbor Lane Bookkeeping Partners'

const PEOPLE = {
    ana: BANK_USERS.ana,
    ben: BANK_USERS.ben,
    marcus: { id: 'bankusermarcusb', name: RECONCILIATION_LONG_PERSON },
} as const

export const RECONCILIATION_REPORT_IDS = {
    checkingAugust: 'rrptchk20260831',
    checkingSeptember: 'rrptchk20260930',
    checkingOctober: 'rrptchk20261031',
    savingsAugust: 'rrptsav20260831',
    savingsSeptember: 'rrptsav20260930',
    savingsOctober: 'rrptsav20261031',
    reserveSeptember: 'rrptrsv20260930',
    cardSeptember: 'rrptcrd20260930',
    cardOctober: 'rrptcrd20261031',
} as const

const IDS = RECONCILIATION_REPORT_IDS

// [day of the month, "<type> <number>" as the report's Transaction column prints it,
// payee, memo, credit side, debit side]
type Cleared = readonly [number, string, string, string, number, number]

interface StatementInput {
    id: string
    account: string
    statement_date: string
    beginning_balance: number
    finished_at: string
    by: { id: string; name: string }
    cleared: readonly Cleared[]
}

const STATEMENTS: readonly StatementInput[] = [
    // 1000 Business Checking, August: $4,210.35 − $1,980.25 + $4,250.00 = $6,480.10.
    {
        id: IDS.checkingAugust,
        account: ACCOUNTS.checking,
        statement_date: '2026-08-31',
        beginning_balance: 421_035,
        finished_at: '2026-09-04 17:12:00.000Z',
        by: PEOPLE.ana,
        cleared: [
            [3, 'Expense 4', 'Pacific Power', 'Electric, 1200 Harbor St', 14_218, 0],
            [7, 'Payment 998', 'Harbor Design', 'Invoice 1009', 0, 185_000],
            [
                14,
                'Bill payment 1031',
                'Hartwell Insurance',
                'Policy 44-1907, monthly premium',
                31_240,
                0,
            ],
            [21, 'Sales receipt 1004', 'Lumen Labs', 'Workshop, full day', 0, 240_000],
            [28, 'Transfer 5', '', 'To Business Savings', 152_567, 0],
        ],
    },
    // September: $6,480.10 − $3,555.10 + $2,075.00 = $5,000.00. The long payee and the
    // long memo are here.
    {
        id: IDS.checkingSeptember,
        account: ACCOUNTS.checking,
        statement_date: '2026-09-30',
        beginning_balance: 648_010,
        finished_at: '2026-10-06 16:40:00.000Z',
        by: PEOPLE.ana,
        cleared: [
            [2, 'Expense 9', 'Robertson & Associates', 'Retainer for September', 25_000, 0],
            [
                8,
                'Bill payment 1038',
                'Hartwell Insurance',
                'Policy 44-1907, monthly premium',
                31_240,
                0,
            ],
            [11, 'Payment 1001', 'Brightline Studio', 'Invoice 1014', 0, 190_000],
            [15, 'Bill payment 1039', 'Cedar & Pine LLC', RECONCILE_LONG_MEMO, 264_000, 0],
            [22, 'Sales receipt 1006', 'Lumen Labs', 'Site visit', 0, 17_500],
            [29, 'Expense 10', RECONCILE_LONG_PAYEE, 'Card processing fees', 35_270, 0],
        ],
    },
    // October, the latest of 1000: $5,000.00 − $550.00 + $175.00 = $4,625.00.
    {
        id: IDS.checkingOctober,
        account: ACCOUNTS.checking,
        statement_date: '2026-10-31',
        beginning_balance: 500_000,
        finished_at: '2026-11-21 20:04:00.000Z',
        by: PEOPLE.ana,
        cleared: [
            [3, 'Bill payment 1041', 'Robertson & Associates', 'Retainer for October', 30_000, 0],
            [
                12,
                'Expense 12',
                'Staples',
                'Shelving for the stock room, second delivery',
                22_875,
                0,
            ],
            [19, 'Payment 1003', 'Harbor Design', 'Invoice 1017', 0, 17_500],
            [28, 'Expense 15', 'First Community Bank', 'Monthly service fee', 2_125, 0],
        ],
    },
    // 1010 Business Savings, August: $0.00 + $2,504.12 = $2,504.12.
    {
        id: IDS.savingsAugust,
        account: ACCOUNTS.savings,
        statement_date: '2026-08-31',
        beginning_balance: 0,
        finished_at: '2026-09-04 17:31:00.000Z',
        by: PEOPLE.ben,
        cleared: [
            [5, 'Journal entry 1040', '', 'Opening deposit', 0, 250_000],
            [31, 'Journal entry 1043', '', 'Interest earned, August', 0, 412],
        ],
    },
    // September, the latest finished of 1010, by the person with the long name:
    // $2,504.12 − $10.00 + $29.31 = $2,523.43. 1010 also has October in progress.
    {
        id: IDS.savingsSeptember,
        account: ACCOUNTS.savings,
        statement_date: '2026-09-30',
        beginning_balance: 250_412,
        finished_at: '2026-10-06 16:52:00.000Z',
        by: PEOPLE.marcus,
        cleared: [
            [10, 'Journal entry 1045', '', 'Account maintenance fee', 1_000, 0],
            [18, 'Journal entry 1046', '', 'Fee refund', 0, 2_500],
            [30, 'Journal entry 1047', '', 'Interest earned, September', 0, 431],
        ],
    },
    // 1020, the account with the long name: a statement that cleared no transaction, so
    // its ending balance is its beginning balance. The report still has its section.
    {
        id: IDS.reserveSeptember,
        account: ACCOUNTS.reserve,
        statement_date: '2026-09-30',
        beginning_balance: 3_650_000,
        finished_at: '2026-10-07 09:15:00.000Z',
        by: PEOPLE.ben,
        cleared: [],
    },
    // 2100 Company Card, September. A card's balance is the amount owed: a charge (the
    // credit side) raises it. $0.00 + $1,710.75 − $500.00 = $1,210.75.
    {
        id: IDS.cardSeptember,
        account: ACCOUNTS.card,
        statement_date: '2026-09-30',
        beginning_balance: 0,
        finished_at: '2026-10-06 17:05:00.000Z',
        by: PEOPLE.ana,
        cleared: [
            [1, 'Journal entry 1044', '', 'Opening balance', 40_215, 0],
            [6, 'Expense 7', 'Delta Air Lines', 'Flight to client site, Denver', 41_820, 0],
            [13, 'Expense 8', 'Adobe', 'Creative Cloud, monthly', 5_999, 0],
            [20, 'Transfer 6', '', 'Card payment from Business Checking', 0, 50_000],
            [27, 'Expense 11', 'Staples', 'Desk chair and monitor arm', 83_041, 0],
        ],
    },
    // October, the latest of 2100: $1,210.75 + $462.05 − $808.60 = $864.20.
    {
        id: IDS.cardOctober,
        account: ACCOUNTS.card,
        statement_date: '2026-10-31',
        beginning_balance: 121_075,
        finished_at: '2026-11-21 20:19:00.000Z',
        by: PEOPLE.ana,
        cleared: [
            [4, 'Expense 23', 'Delta Air Lines', 'Flight to Denver', 31_840, 0],
            [9, 'Transfer 9', '', 'Card payment from Business Checking', 0, 70_000],
            [11, 'Expense 24', 'Adobe', 'Stock images', 7_900, 0],
            [18, 'Expense 25', 'Shell', 'Fuel', 6_465, 0],
            [25, 'Vendor refund 3', 'Staples', 'Returned monitor arm', 0, 10_860],
        ],
    },
]

const sum = (values: readonly number[]) => values.reduce((a, v) => a + v, 0)

function accountOf(id: string): BooksAccounts {
    const account = RECONCILE_ACCOUNTS.find(row => row.id === id)
    if (!account) throw new Error(`reconciliation-report fixture: no account ${id}`)
    return account
}

// A debit raises a bank account's balance and lowers the amount owed on a card.
function ownNet(
    account: BooksAccounts,
    line: Pick<BooksReconciledLines, 'debit' | 'credit'>
): number {
    const net = line.debit - line.credit
    return account.type === 'credit_card' ? -net : net
}

function serialId(prefix: string, n: number): string {
    return `${prefix}${n.toString().padStart(15 - prefix.length, '0')}`
}

// The report's own values of a cleared row: the Transaction label and the path the row
// opens come from the row's journal entry (Go `statementActivity()`, `entryOpenPath()`).
export type ReconciledLineRow = BooksReconciledLines & {
    transaction: string
    open: string
}

function linesOf(input: StatementInput): ReconciledLineRow[] {
    const month = input.statement_date.slice(0, 8)
    const prefix = input.id.slice(4, 7) + input.id.slice(11)
    return input.cleared.map(([day, transaction, payee, memo, credit, debit], index) => {
        const entry = serialId(`${prefix}en`, index + 1)
        return {
            id: serialId(`${prefix}ln`, index + 1),
            reconciliation: input.id,
            account: input.account,
            entry,
            date: `${month}${day.toString().padStart(2, '0')}`,
            debit,
            credit,
            position: 0,
            currency: CURRENCY,
            memo,
            payee,
            transaction,
            open: `books/entries/${entry}`,
        } satisfies ReconciledLineRow
    })
}

function finished(input: StatementInput): BooksReconciliations {
    const account = accountOf(input.account)
    const lines = linesOf(input)
    const out = lines.filter(line => line.credit > 0)
    const into = lines.filter(line => line.debit > 0)
    return {
        id: input.id,
        account: input.account,
        statement_date: input.statement_date,
        statement_balance: input.beginning_balance + sum(lines.map(line => ownNet(account, line))),
        has_statement_totals: false,
        statement_out: 0,
        statement_in: 0,
        status: 'finished',
        beginning_balance: input.beginning_balance,
        cleared_out: sum(out.map(line => line.credit)),
        cleared_in: sum(into.map(line => line.debit)),
        cleared_out_count: out.length,
        cleared_in_count: into.length,
        created_by: input.by.id,
        finished_by: input.by.id,
        finished_by_name: input.by.name,
        finished_at: input.finished_at,
        currency: CURRENCY,
        created: input.finished_at,
        updated: input.finished_at,
    } satisfies BooksReconciliations
}

// Every finished reconciliation: three statements of 1000, two of 1010, two of 2100 and
// one of the long-named 1020.
export const FINISHED_RECONCILIATIONS = STATEMENTS.map(finished) satisfies BooksReconciliations[]

export const RECONCILED_LINES = STATEMENTS.flatMap(linesOf) satisfies BooksReconciledLines[]

// 1010 Business Savings has October in progress, so the undo of its September statement is
// blocked (spec §3 "Undo").
export const RECONCILIATION_OPEN = {
    id: IDS.savingsOctober,
    account: ACCOUNTS.savings,
    statement_date: '2026-10-31',
    statement_balance: 254_010,
    has_statement_totals: false,
    statement_out: 0,
    statement_in: 0,
    status: 'in_progress',
    beginning_balance: 252_343,
    cleared_out: 0,
    cleared_in: 0,
    cleared_out_count: 0,
    cleared_in_count: 0,
    created_by: PEOPLE.ana.id,
    finished_by: '',
    finished_by_name: '',
    finished_at: '',
    currency: CURRENCY,
    created: '2026-11-20 15:00:00.000Z',
    updated: '2026-11-20 15:00:00.000Z',
} satisfies BooksReconciliations

export const OPEN_RECONCILIATIONS: BooksReconciliations[] = [RECONCILIATION_OPEN]

// The seed's own rows (seed.ts seedReconciliationReport): three entries on 2100 Company
// Card against 3000 Owner's Equity, on August days no e2e spec reads, and two finished
// reconciliations of 2100: Jul 31, 2026 at $0.00 with no cleared row (its statement balance
// is its beginning balance), then Aug 31, 2026 over the three entries. A charge credits 2100
// (it raises what is owed), the payment debits it: 48,250 + 9,900 − 20,000 = 38,150 owed.
// The two ids are fixed, 15 characters each; the latest's is how a second run knows it ran.
export const RECONCILIATION_REPORT_SEED = {
    account: '2100',
    entries: [
        { date: '2026-08-07', memo: 'Reconciliation report seed: office chairs', charge: 48_250 },
        { date: '2026-08-09', memo: 'Reconciliation report seed: software', charge: 9_900 },
        { date: '2026-08-23', memo: 'Reconciliation report seed: card payment', payment: 20_000 },
    ],
    earlier: { id: 'rrptseedcrd0731', statement_date: '2026-07-31', statement_balance: 0 },
    latest: { id: 'rrptseedcrd0831', statement_date: '2026-08-31', statement_balance: 38_150 },
} as const

// The history query's rows (spec §4 "Reads"): each finished reconciliation with its
// account, by statement date, newest first, then by account number.
export const RECONCILIATION_HISTORY = FINISHED_RECONCILIATIONS.map(reconciliation => ({
    ...reconciliation,
    accountRow: accountOf(reconciliation.account),
})).sort(
    (a, b) =>
        b.statement_date.localeCompare(a.statement_date) ||
        a.accountRow.number.localeCompare(b.accountRow.number)
)

export type ReconciliationHistoryRow = (typeof RECONCILIATION_HISTORY)[number]

export const EMPTY_RECONCILIATION_HISTORY: ReconciliationHistoryRow[] = []

// The account filter of the `filtered` state, and an account with no finished
// reconciliation for the empty state under a filter (`?account=` names it).
export const RECONCILIATION_FILTER_ACCOUNT = ACCOUNTS.checking
export const RECONCILIATION_NONE_ACCOUNT = ACCOUNTS.pettyCash

// --- The Reconciliation Report (spec §3 "The Reconciliation Report", §4 "Server") ---

export const RECONCILIATION_REPORT_HEADING = 'Harbor Lane Design LLC'
export const RECONCILIATION_REPORT_TITLE = 'Reconciliation Report'

// The params as the shipped spec declares them (server/report_reconciliation.go builds
// the same list in Go; `where` is left out here, the view does not read it).
export const RECONCILIATION_REPORT_PARAMS: ParamDef[] = [
    {
        id: 'accounts',
        type: 'choice',
        label: 'Account',
        multiple: true,
        optionsFrom: {
            source: 'books.accounts',
            value: [{ field: 'id' }],
            // accountLabel of server/report_spec_helpers.go: "<number> <full name>",
            // the full name alone for an account with no number.
            labelFormula: {
                op: 'if',
                args: [
                    { op: 'isEmpty', args: [{ path: [{ field: 'number' }] }] },
                    { path: [{ field: 'full_name' }] },
                    {
                        op: 'concat',
                        args: [
                            { path: [{ field: 'number' }] },
                            { value: ' ' },
                            { path: [{ field: 'full_name' }] },
                        ],
                    },
                ],
            },
            order: [{ field: 'number' }],
        },
    },
    {
        id: 'statement',
        type: 'choice',
        label: 'Statement',
        optionsFrom: {
            source: 'books.reconciliations',
            value: [{ field: 'id' }],
            label: [{ field: 'statement_date' }],
            group: [{ field: 'account' }, { field: 'full_name' }],
        },
    },
]

// What the view reads of the spec's groups: one level, the statement, open, ending in a
// subtotal row.
export const RECONCILIATION_REPORT_GROUPS: { subtotals?: boolean; open: boolean }[] = [
    { subtotals: true, open: true },
]

// A detail row keeps every line of an arrangement (core table-lines.ts rowLayout), so a
// line that holds only the section columns would be an empty line in each cleared row.
// Each arrangement puts the section columns on a line the cleared rows use.
//
// A phone row (measured at 390 and 375 in phase 3 pass 2; the helix ledger has the
// figures): date and transaction; payee, with the section row's Statement ending at the
// end of that line; memo; the three figures. Line 1 is the label's line (a cell there cuts
// the section's label) and the figures fill their line (three figures are all a 374 px
// row holds), so the payee's line is the one with room. Reconciled on is not listed, so a
// phone does not show it (the section row still names who reconciled the statement).
export const RECONCILIATION_REPORT_PHONE_LAYOUT: DisplayLayout = {
    width: 'mobile',
    tracks: 12,
    cells: [
        { col: 'date', line: 1, span: 4 },
        { col: 'transaction', line: 1, span: 8 },
        { col: 'payee', line: 2, span: 7 },
        { col: 'statement', line: 2, span: 5 },
        { col: 'memo', line: 3, span: 12 },
        { col: 'debit', line: 4, span: 4 },
        { col: 'credit', line: 4, span: 4 },
        { col: 'balance', line: 4, span: 4 },
    ],
}

// A tablet row: the date, the transaction and the figures on line 1; payee and memo on
// line 2, with the section row's Statement ending and Reconciled on at its end.
export const RECONCILIATION_REPORT_TABLET_LAYOUT: DisplayLayout = {
    width: 'tablet',
    minWidth: '600px',
    tracks: 12,
    cells: [
        { col: 'date', line: 1, span: 2 },
        { col: 'transaction', line: 1, span: 4 },
        { col: 'debit', line: 1, span: 2 },
        { col: 'credit', line: 1, span: 2 },
        { col: 'balance', line: 1, span: 2 },
        { col: 'payee', line: 2, span: 3 },
        { col: 'memo', line: 2, span: 3 },
        { col: 'statement', line: 2, span: 3 },
        { col: 'reconciled', line: 2, span: 3 },
    ],
}

// The display block of the shipped spec. `oneLine.minWidth` is the row width phase 3 pass
// 2 measured with this fixture's rows (the helix ledger, Phase notes, has the figures).
// Payee and memo wrap to two lines where their cell is narrow.
export const RECONCILIATION_REPORT_DISPLAY: NonNullable<ReportSpec['display']> = {
    oneLine: { minWidth: '1360px' },
    columns: {
        payee: { whiteSpace: 'normal', lineClamp: 2 },
        memo: { whiteSpace: 'normal', lineClamp: 2 },
        debit: { minWidth: 'max-content' },
        credit: { minWidth: 'max-content' },
        balance: { minWidth: 'max-content' },
    },
    layouts: [RECONCILIATION_REPORT_PHONE_LAYOUT, RECONCILIATION_REPORT_TABLET_LAYOUT],
}

// Statement ending and Reconciled on have a cell on section rows only (`detail: "blank"`,
// not figures, so group-only: the engine leaves them off the subtotal row).
export const RECONCILIATION_REPORT_COLUMNS: ResultColumn[] = [
    { id: 'date', label: 'Date', type: 'date' },
    { id: 'transaction', label: 'Transaction', type: 'text' },
    { id: 'payee', label: 'Payee', type: 'text' },
    { id: 'memo', label: 'Memo', type: 'text' },
    { id: 'statement', label: 'Statement ending', type: 'date', groupOnly: true },
    { id: 'reconciled', label: 'Reconciled on', type: 'datetime', groupOnly: true },
    { id: 'debit', label: 'Debit', type: 'money', currency: CURRENCY, aggregate: 'sum' },
    { id: 'credit', label: 'Credit', type: 'money', currency: CURRENCY, aggregate: 'sum' },
    { id: 'balance', label: 'Balance', type: 'money', currency: CURRENCY },
]

const blankZero = (cents: number): number | null => (cents === 0 ? null : cents)

const accountText = (account: BooksAccounts) => `${account.number} ${account.full_name}`

const groupId = (reconciliation: BooksReconciliations) =>
    `g:${JSON.stringify([reconciliation.id, CURRENCY])}`

function lineRows(reconciliation: BooksReconciliations, section: string): ResultRow[] {
    const account = accountOf(reconciliation.account)
    let balance = reconciliation.beginning_balance
    return RECONCILED_LINES.filter(line => line.reconciliation === reconciliation.id).map(line => {
        balance += ownNet(account, line)
        return {
            id: `d:${line.id}`,
            kind: 'detail',
            depth: 1,
            label: line.date,
            labelType: 'date',
            labelValue: line.date,
            section,
            open: line.open,
            cells: {
                transaction: line.transaction,
                payee: line.payee,
                memo: line.memo,
                debit: blankZero(line.debit),
                credit: blankZero(line.credit),
                balance,
            },
        }
    })
}

// One section: the statement's row ("1000 Business Checking · reconciled by Ana Ruiz",
// with Statement ending and Reconciled on), the opening row, the cleared rows with the
// running balance, and the total, whose Balance is the statement ending balance.
//
// The rows are as the engine sends them (assemble.go groupWithLabel): the subtotal row has
// the group row's cells but those of the group-only columns (Statement ending, Reconciled
// on). Core's view keeps only the group-only cells on an open group row that its subtotal
// row follows (reports/lib/rows.ts rowCells), so they show on the section row.
function sectionRows(reconciliation: BooksReconciliations): ResultRow[] {
    const account = accountOf(reconciliation.account)
    const id = groupId(reconciliation)
    const label = `${accountText(account)} · reconciled by ${reconciliation.finished_by_name}`
    // The engine adds each side on the section's rows, so a side with no line reads 0, not
    // blank (only a cleared row leaves its zero side blank).
    const figures = {
        debit: reconciliation.cleared_in,
        credit: reconciliation.cleared_out,
        balance: reconciliation.statement_balance,
    }
    const group: ResultRow = {
        id,
        kind: 'group',
        depth: 0,
        level: 1,
        label,
        groupKey: [reconciliation.id, CURRENCY],
        expanded: true,
        canExpand: true,
        cells: {
            statement: reconciliation.statement_date,
            reconciled: reconciliation.finished_at,
            ...figures,
        },
    }
    const opening: ResultRow = {
        id: `opening:${JSON.stringify([reconciliation.id, CURRENCY])}`,
        kind: 'opening',
        depth: 1,
        label: 'Beginning balance',
        section: id,
        groupKey: [reconciliation.id, CURRENCY],
        cells: { balance: reconciliation.beginning_balance },
    }
    const subtotal: ResultRow = {
        id: `s:${JSON.stringify([reconciliation.id, CURRENCY])}`,
        kind: 'subtotal',
        depth: 0,
        level: 1,
        label: `Total ${label}`,
        section: id,
        cells: { ...figures },
    }
    return [group, opening, ...lineRows(reconciliation, id), subtotal]
}

// Debit and Credit add; a sum of the balances of several statements means nothing.
function totalRow(shown: readonly BooksReconciliations[]): ResultRow {
    return {
        id: `total:${JSON.stringify([CURRENCY])}`,
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: {
            debit: sum(shown.map(row => row.cleared_in)),
            credit: sum(shown.map(row => row.cleared_out)),
            balance: null,
        },
    }
}

export interface ReconciliationReportInput {
    /** Account ids the Account filter keeps. */
    accounts?: string[]
    /** The one reconciliation the Statement filter keeps. */
    statement?: string
}

// By account number, then statement date, newest first.
function shownStatements(input: ReconciliationReportInput): BooksReconciliations[] {
    return FINISHED_RECONCILIATIONS.filter(
        row =>
            (!input.accounts || input.accounts.includes(row.account)) &&
            (!input.statement || input.statement === row.id)
    ).sort(
        (a, b) =>
            accountOf(a.account).number.localeCompare(accountOf(b.account).number) ||
            b.statement_date.localeCompare(a.statement_date)
    )
}

function resolvedParams(input: ReconciliationReportInput): ResolvedParam[] {
    return [
        input.accounts
            ? { id: 'accounts', type: 'choice', list: input.accounts }
            : { id: 'accounts', type: 'choice', unset: true },
        input.statement
            ? { id: 'statement', type: 'choice', value: input.statement }
            : { id: 'statement', type: 'choice', unset: true },
    ]
}

export function reconciliationReportResult(input: ReconciliationReportInput = {}): RunResult {
    const shown = shownStatements(input)
    return {
        columns: RECONCILIATION_REPORT_COLUMNS,
        rows: [...shown.flatMap(sectionRows), totalRow(shown)],
        notices: [],
        topics: [
            'collection/books_reconciled_lines',
            'collection/books_reconciliations',
            'collection/books_accounts',
            'collection/books_journal_entries',
        ],
        heading: RECONCILIATION_REPORT_HEADING,
        page: null,
        params: resolvedParams(input),
        headerLines: [],
    }
}

// No finished reconciliation under the filters: only the Total row, which then has no cell
// (as the engine sends it), so the view is empty.
export function emptyReconciliationReportResult(): RunResult {
    const input = { accounts: [RECONCILIATION_NONE_ACCOUNT] }
    return { ...reconciliationReportResult(input), rows: [{ ...totalRow([]), cells: {} }] }
}

// The chips' labels, which the view reads from the server in the product: a statement by
// its day, an account by its number and name.
export const RECONCILIATION_REPORT_LABELS = {
    accounts: RECONCILE_ACCOUNTS.map(account => [account.id, accountText(account)] as const),
    statements: FINISHED_RECONCILIATIONS.map(row => [row.id, row.statement_date] as const),
}

// --- The figures, worked out by hand from the rows above (cents). An edit to a cleared
// row that changes a sum must change these too. ---

export const RECONCILIATION_REPORT_ENDINGS: Record<string, number> = {
    [IDS.checkingAugust]: 648_010,
    [IDS.checkingSeptember]: 500_000,
    [IDS.checkingOctober]: 462_500,
    [IDS.savingsAugust]: 250_412,
    [IDS.savingsSeptember]: 252_343,
    [IDS.reserveSeptember]: 3_650_000,
    [IDS.cardSeptember]: 121_075,
    [IDS.cardOctober]: 86_420,
}

for (const row of FINISHED_RECONCILIATIONS) {
    const expected = RECONCILIATION_REPORT_ENDINGS[row.id]
    if (row.statement_balance !== expected) {
        throw new Error(
            `reconciliation-report fixture: ${row.id} ends at ${row.statement_balance}, not ${expected}`
        )
    }
}

// Each statement of an account begins where the one before it ended.
for (const row of FINISHED_RECONCILIATIONS) {
    const earlier = FINISHED_RECONCILIATIONS.filter(
        other => other.account === row.account && other.statement_date < row.statement_date
    ).sort((a, b) => b.statement_date.localeCompare(a.statement_date))[0]
    if (earlier && earlier.statement_balance !== row.beginning_balance) {
        throw new Error(
            `reconciliation-report fixture: ${row.id} does not begin where ${earlier.id} ended`
        )
    }
}
