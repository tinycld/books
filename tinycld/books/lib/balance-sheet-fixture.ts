// Synthetic Balance Sheet for the helix reference route and the e2e spec's constants.
// The run results are typed against core's report contract, so tsc checks every
// field. Money is integer cents; a percent cell is already a percent (12.5 = 12.5%).
//
// Core checkpoint 0 (spec §4) has not landed when this file is written, so four of
// its parts are drawn as the spec says they will arrive:
// - G3: `ResultColumn.heading` does not exist yet; `BALANCE_SHEET_HEADINGS` holds the
//   dated headings and the reference route puts them in the table's column labels
//   (Customize keeps the plain labels). Checkpoint 0 adds `heading` to the result.
// - G7: the hidden key columns (side, class rank, kind rank) are left out of
//   `BALANCE_SHEET_COLUMNS`, as the engine will leave them out of the result.
// - G1: an account with no class or kind sits directly under its parent (Equity
//   accounts at depth 1, Fixed assets accounts at depth 2). Core's `endsInSubtotal`
//   reads `depth + 1` as the level until G1 sends `ResultRow.level`, so the route
//   reads subtotals from the rows alone (visibleRows without the spec).
// - G4 / G8: Retained earnings and Net income are computed rows inside Equity, added
//   to Total Equity; Change and % change on every computed row and total come from
//   that row's own Current and Prior year.
import type { DisplayLayout, ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type {
    CellValue,
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import type { BooksAccounts } from '../types'

export const BALANCE_SHEET_TITLE = 'Balance Sheet'
export const BALANCE_SHEET_DESCRIPTION =
    'What the business owns and owes on one day, beside the same day a year earlier.'
export const BALANCE_SHEET_SHIPPED_KEY = 'books.balance_sheet'
export const BALANCE_SHEET_HEADING = 'Harbor Lane Design LLC'
// The default As of, Today, resolved on the reference day; the prior-year day is
// the same day twelve months earlier (core addMonths; Feb 29 → Feb 28).
export const BALANCE_SHEET_AS_OF = '2026-11-08'
export const BALANCE_SHEET_PRIOR_DAY = '2025-11-08'
/** G3's dated headings in the reader's short day form. */
export const BALANCE_SHEET_HEADINGS = { current: 'Nov 8, 2026', prior: 'Nov 8, 2025' }
const CURRENCY = 'USD'

export const SECTION_TITLES = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity' }
export const RETAINED_EARNINGS_LABEL = 'Retained earnings'
export const NET_INCOME_LABEL = 'Net income'
export const TOTAL_LIABILITIES_AND_EQUITY_LABEL = 'Total liabilities and equity'

// The params as the shipped spec declares them (server/report_balance_sheet.go builds
// the same list in Go; its test pins the Go side).
export const BALANCE_SHEET_PARAMS: ParamDef[] = [
    { id: 'asOf', type: 'asOf', label: 'As of', default: { preset: 'today' } },
    {
        id: 'rows',
        type: 'choice',
        label: 'Rows',
        options: [
            { value: 'nonzero', label: 'Non-zero' },
            { value: 'active', label: 'Active' },
        ],
        default: 'nonzero',
    },
]

type Side = keyof typeof SECTION_TITLES
type BalanceSheetType = Extract<
    BooksAccounts['type'],
    | 'bank'
    | 'accounts_receivable'
    | 'other_current_asset'
    | 'fixed_asset'
    | 'other_asset'
    | 'accounts_payable'
    | 'credit_card'
    | 'other_current_liability'
    | 'long_term_liability'
    | 'equity'
>

interface Placement {
    side: Side
    /** The class label, or null: the class level is skipped (G1). */
    cls: string | null
    /** The kind (type) label, or null: the kind level is skipped (G1). */
    kind: string | null
}

// Spec §5's class / kind table, in rank order (the Go table is the one that ships).
export const BALANCE_SHEET_PLACEMENT: Record<BalanceSheetType, Placement> = {
    bank: { side: 'asset', cls: 'Current assets', kind: 'Bank accounts' },
    accounts_receivable: { side: 'asset', cls: 'Current assets', kind: 'Accounts receivable' },
    other_current_asset: { side: 'asset', cls: 'Current assets', kind: 'Other current assets' },
    fixed_asset: { side: 'asset', cls: 'Fixed assets', kind: null },
    other_asset: { side: 'asset', cls: 'Other assets', kind: null },
    accounts_payable: { side: 'liability', cls: 'Current liabilities', kind: 'Accounts payable' },
    credit_card: { side: 'liability', cls: 'Current liabilities', kind: 'Credit cards' },
    other_current_liability: {
        side: 'liability',
        cls: 'Current liabilities',
        kind: 'Other current liabilities',
    },
    long_term_liability: { side: 'liability', cls: 'Long-term liabilities', kind: null },
    equity: { side: 'equity', cls: null, kind: null },
}

type BalanceSheetAccount = Pick<BooksAccounts, 'id' | 'number' | 'full_name'> & {
    type: BalanceSheetType
    /** Balance by the account's normal side on the as-of day. */
    current: number
    /** Balance by the account's normal side on the prior-year day. */
    prior: number
}

// Chart order inside each type: number, then full name. Accounts payable nets to
// 0.00 on both days (every bill paid), so under Rows = Non-zero its type hides with
// its total (G5) and it shows only under Active. Undeposited funds has no prior-year
// balance (% change blank). Accumulated depreciation and Owner's draws are contra
// accounts and read negative. The prepaid account's long name exercises the ellipsis.
export const BALANCE_SHEET_ACCOUNTS = [
    {
        id: 'bsacct00checkng',
        number: '1010',
        full_name: 'Cash and bank:Business checking',
        type: 'bank',
        current: 2431055,
        prior: 1890210,
    },
    {
        id: 'bsacct00savings',
        number: '1020',
        full_name: 'Cash and bank:Business savings',
        type: 'bank',
        current: 1000000,
        prior: 500000,
    },
    {
        id: 'bsacct00receivb',
        number: '1100',
        full_name: 'Accounts receivable',
        type: 'accounts_receivable',
        current: 645000,
        prior: 312000,
    },
    {
        id: 'bsacct00undepos',
        number: '1200',
        full_name: 'Undeposited funds',
        type: 'other_current_asset',
        current: 127500,
        prior: 0,
    },
    {
        id: 'bsacct00prepaid',
        number: '1300',
        full_name: 'Prepaid expenses:Professional liability insurance premium (annual policy)',
        type: 'other_current_asset',
        current: 180000,
        prior: 240000,
    },
    {
        id: 'bsacct00equipmt',
        number: '1500',
        full_name: 'Equipment',
        type: 'fixed_asset',
        current: 2800000,
        prior: 2800000,
    },
    {
        id: 'bsacct00accumdp',
        number: '1590',
        full_name: 'Accumulated depreciation',
        type: 'fixed_asset',
        current: -840000,
        prior: -280000,
    },
    {
        id: 'bsacct00deposit',
        number: '1900',
        full_name: 'Security deposits',
        type: 'other_asset',
        current: 250000,
        prior: 250000,
    },
    {
        id: 'bsacct00payable',
        number: '2000',
        full_name: 'Accounts payable',
        type: 'accounts_payable',
        current: 0,
        prior: 0,
    },
    {
        id: 'bsacct0000card0',
        number: '2100',
        full_name: 'Credit card',
        type: 'credit_card',
        current: 128477,
        prior: 96320,
    },
    {
        id: 'bsacct00salestx',
        number: '2200',
        full_name: 'Sales tax payable',
        type: 'other_current_liability',
        current: 51230,
        prior: 38810,
    },
    {
        id: 'bsacct000notes0',
        number: '2700',
        full_name: 'Notes payable',
        type: 'long_term_liability',
        current: 1425000,
        prior: 1950000,
    },
    {
        id: 'bsacct00owneqty',
        number: '3000',
        full_name: 'Owner’s equity',
        type: 'equity',
        current: 2000000,
        prior: 2000000,
    },
    {
        id: 'bsacct00draws00',
        number: '3200',
        full_name: 'Owner’s draws',
        type: 'equity',
        current: -1200000,
        prior: -600000,
    },
] satisfies BalanceSheetAccount[]

/** Net income on each column's day: the fiscal year to date (spec §3). */
const NET_INCOME = { current: 1537583, prior: 1341080 }

// The opened account's posted lines, labelled "<date> · <entry number> · <memo>", by
// the account's normal side. Lines on or before the prior-year day add to its
// prior-year balance (18,902.10); all of them add to its current one (24,310.55).
export const OPENED_ACCOUNT_ID = 'bsacct00checkng'
const OPENED_LINES = [
    {
        id: 'bsline000000001',
        day: '2025-01-02',
        label: '2025-01-02 · JE-1 · Opening balances',
        net: 1500000,
    },
    {
        id: 'bsline000000014',
        day: '2025-06-30',
        label: '2025-06-30 · JE-14 · Client payment — Northwind Traders',
        net: 640210,
    },
    {
        id: 'bsline000000022',
        day: '2025-10-01',
        label: '2025-10-01 · JE-22 · October rent',
        net: -250000,
    },
    {
        id: 'bsline000000041',
        day: '2026-02-14',
        label: '2026-02-14 · JE-41 · Payment on invoice 1042 — West Annex renovation drawings',
        net: 985000,
    },
    {
        id: 'bsline000000055',
        day: '2026-07-01',
        label: '2026-07-01 · JE-55 · Transfer to savings',
        net: -500000,
    },
    {
        id: 'bsline000000063',
        day: '2026-10-30',
        label: '2026-10-30 · JE-63 · Retainer deposit',
        net: 55845,
    },
]

// The result's columns. G7's hidden key columns are not in a result.
export const BALANCE_SHEET_COLUMNS: ResultColumn[] = [
    {
        id: 'account',
        label: 'Account',
        type: 'relation',
        labelCell: 'account@label',
        labelType: 'text',
    },
    { id: 'current', label: 'Current', type: 'money', currency: CURRENCY },
    { id: 'prior', label: 'Prior year', type: 'money', currency: CURRENCY },
    { id: 'change', label: 'Change', type: 'money', currency: CURRENCY },
    { id: 'pct', label: '% change', type: 'number', format: 'percent' },
]

/** What the view reads of the spec's groups: four levels, every one open with totals. */
export const BALANCE_SHEET_GROUPS = [
    { subtotals: true, open: true },
    { subtotals: true, open: true },
    { subtotals: true, open: true },
    { open: false },
]

// Spec §5 `display`: the label narrows first; figures keep their full width. A phone
// row wraps onto the label, then Current · Prior year · Change (% change is not in it);
// a tablet row onto the label, then all four figures.
export const BALANCE_SHEET_PHONE_LAYOUT: DisplayLayout = {
    width: 'mobile',
    tracks: 3,
    cells: [
        { col: 'account', line: 1, span: 3 },
        { col: 'current', line: 2 },
        { col: 'prior', line: 2 },
        { col: 'change', line: 2 },
    ],
}

export const BALANCE_SHEET_TABLET_LAYOUT: DisplayLayout = {
    width: 'tablet',
    minWidth: '600px',
    tracks: 4,
    cells: [
        { col: 'account', line: 1, span: 4 },
        { col: 'current', line: 2 },
        { col: 'prior', line: 2 },
        { col: 'change', line: 2 },
        { col: 'pct', line: 2 },
    ],
}

export const BALANCE_SHEET_DISPLAY: NonNullable<ReportSpec['display']> = {
    columns: {
        account: { minWidth: '12ch' },
        current: { minWidth: 'max-content' },
        prior: { minWidth: 'max-content' },
        change: { minWidth: 'max-content' },
        pct: { minWidth: 'max-content' },
    },
    layouts: [BALANCE_SHEET_PHONE_LAYOUT, BALANCE_SHEET_TABLET_LAYOUT],
}

export type RowsChoice = 'nonzero' | 'active'

export interface BalanceSheetInput {
    rows?: RowsChoice
    /** The account whose posted lines show beneath it. */
    openId?: string
    /** Collapse all: every section folded. */
    isCollapsed?: boolean
    /** A book with no posted lines. */
    isEmpty?: boolean
}

interface Pair {
    current: number
    prior: number
}

const ZERO: Pair = { current: 0, prior: 0 }
const addPair = (a: Pair, b: Pair): Pair => ({
    current: a.current + b.current,
    prior: a.prior + b.prior,
})
const sumPairs = (pairs: Pair[]): Pair => pairs.reduce(addPair, ZERO)

// G8: Change and % change come from the row's own Current and Prior year. % change is
// Change ÷ |Prior year| × 100, blank when Prior year is zero.
function figures(pair: Pair): Record<string, CellValue> {
    const change = pair.current - pair.prior
    return {
        current: pair.current,
        prior: pair.prior,
        change,
        pct: pair.prior === 0 ? null : (change / Math.abs(pair.prior)) * 100,
    }
}

const keyId = (prefix: string, key: unknown[]) => `${prefix}:${JSON.stringify([...key, CURRENCY])}`

const accountLabel = (acct: BalanceSheetAccount) =>
    acct.number ? `${acct.number} ${acct.full_name}` : acct.full_name

const placementOf = (acct: BalanceSheetAccount) => BALANCE_SHEET_PLACEMENT[acct.type]

function isShown(acct: BalanceSheetAccount, rows: RowsChoice): boolean {
    return rows === 'active' || acct.current !== 0 || acct.prior !== 0
}

function lineRows(section: string, depth: number): ResultRow[] {
    return OPENED_LINES.map(line => ({
        id: `d:${line.id}`,
        kind: 'detail',
        depth,
        label: line.label,
        section,
        cells: {
            current: line.net,
            prior: line.day <= BALANCE_SHEET_PRIOR_DAY ? line.net : 0,
            change: null,
            pct: null,
        },
    }))
}

function accountRows(
    acct: BalanceSheetAccount,
    key: unknown[],
    section: string,
    depth: number,
    openId: string | undefined
): ResultRow[] {
    const groupKey = [...key, acct.id]
    const id = keyId('g', groupKey)
    const isOpen = acct.id === openId
    const row: ResultRow = {
        id,
        kind: 'group',
        depth,
        label: accountLabel(acct),
        section,
        groupKey: [...groupKey, CURRENCY],
        expanded: isOpen,
        canExpand: true,
        cells: { account: acct.id, 'account@label': accountLabel(acct), ...figures(acct) },
    }
    return isOpen ? [row, ...lineRows(id, depth + 1)] : [row]
}

interface Built {
    rows: ResultRow[]
    total: Pair
}

// One level of the outline: a group row, what sits under it, and its total row.
function groupRows(
    label: string,
    key: unknown[],
    section: string,
    depth: number,
    inner: (id: string) => Built
): Built {
    const id = keyId('g', key)
    const body = inner(id)
    const head: ResultRow = {
        id,
        kind: 'group',
        depth,
        label,
        section,
        groupKey: [...key, CURRENCY],
        expanded: true,
        canExpand: true,
        cells: figures(body.total),
    }
    const subtotal: ResultRow = {
        id: keyId('s', key),
        kind: 'subtotal',
        depth,
        label: `Total ${label}`,
        section: id,
        groupKey: [...key, CURRENCY],
        cells: figures(body.total),
    }
    return { rows: [head, ...body.rows, subtotal], total: body.total }
}

function joinBuilt(parts: Built[]): Built {
    return {
        rows: parts.flatMap(p => p.rows),
        total: sumPairs(parts.map(p => p.total)),
    }
}

const uniqueOf = <T>(values: T[]) => [...new Set(values)]

// Accounts under one parent, grouped by the next level's label; a null label (a
// skipped level, G1) puts its accounts directly under the parent, one depth less.
function levelRows(
    accounts: BalanceSheetAccount[],
    level: 'cls' | 'kind',
    key: unknown[],
    section: string,
    depth: number,
    openId: string | undefined
): Built {
    const labels = uniqueOf(accounts.map(acct => placementOf(acct)[level]))
    return joinBuilt(
        labels.map(label => {
            const under = accounts.filter(acct => placementOf(acct)[level] === label)
            if (label === null) return leafOrNext(under, level, key, section, depth, openId)
            const childKey = [...key, label]
            return groupRows(label, childKey, section, depth, id =>
                leafOrNext(under, level, childKey, id, depth + 1, openId)
            )
        })
    )
}

function leafOrNext(
    accounts: BalanceSheetAccount[],
    level: 'cls' | 'kind',
    key: unknown[],
    section: string,
    depth: number,
    openId: string | undefined
): Built {
    if (level === 'cls') return levelRows(accounts, 'kind', key, section, depth, openId)
    return {
        rows: accounts.flatMap(acct => accountRows(acct, key, section, depth, openId)),
        total: sumPairs(accounts),
    }
}

function computedRow(id: string, label: string, depth: number, pair: Pair): ResultRow {
    return { id: `c:${id}`, kind: 'computed', depth, label, cells: figures(pair) }
}

// Retained earnings is this sample book's balancing figure on each day (in the app
// both computed rows are read from posted lines, spec §5): every posted entry
// balances, so assets = liabilities + equity accounts + retained earnings + net income.
function retainedEarnings(accounts: BalanceSheetAccount[]): Pair {
    const bySide = (side: Side) =>
        sumPairs(accounts.filter(acct => placementOf(acct).side === side))
    const others = addPair(addPair(bySide('liability'), bySide('equity')), NET_INCOME)
    const assets = bySide('asset')
    return { current: assets.current - others.current, prior: assets.prior - others.prior }
}

interface SectionBuilt extends Built {
    side: Side
}

function sectionRows(
    side: Side,
    accounts: BalanceSheetAccount[],
    computed: { re: Pair; ni: Pair },
    input: BalanceSheetInput
): SectionBuilt {
    const key = [side]
    const id = keyId('g', key)
    const isOpen = !input.isCollapsed
    const under = accounts.filter(acct => placementOf(acct).side === side)
    const body = levelRows(under, 'cls', key, id, 1, input.openId)
    // G4: Retained earnings and Net income sit inside Equity, before its total, and
    // count in it; folded with the section, they do not show.
    const extra =
        side === 'equity'
            ? [
                  computedRow('retainedEarnings', RETAINED_EARNINGS_LABEL, 1, computed.re),
                  computedRow('netIncome', NET_INCOME_LABEL, 1, computed.ni),
              ]
            : []
    const total = side === 'equity' ? sumPairs([body.total, computed.re, computed.ni]) : body.total
    const head: ResultRow = {
        id,
        kind: 'group',
        depth: 0,
        label: SECTION_TITLES[side],
        groupKey: [...key, CURRENCY],
        expanded: isOpen,
        canExpand: true,
        cells: figures(total),
    }
    // A layout section always ends in its total, open or folded.
    const subtotal: ResultRow = {
        id: keyId('s', key),
        kind: 'subtotal',
        depth: 0,
        label: `Total ${SECTION_TITLES[side]}`,
        section: id,
        groupKey: [...key, CURRENCY],
        cells: figures(total),
    }
    const inside = isOpen ? [...body.rows, ...extra] : []
    return { side, rows: [head, ...inside, subtotal], total }
}

function resolvedParams(rows: RowsChoice): ResolvedParam[] {
    return [
        { id: 'asOf', type: 'asOf', value: BALANCE_SHEET_AS_OF },
        { id: 'rows', type: 'choice', value: rows },
    ]
}

export function balanceSheetResult(input: BalanceSheetInput = {}): RunResult {
    const rowsChoice = input.rows ?? 'nonzero'
    const book: BalanceSheetAccount[] = input.isEmpty ? [] : BALANCE_SHEET_ACCOUNTS
    const computed = input.isEmpty
        ? { re: ZERO, ni: ZERO }
        : { re: retainedEarnings(book), ni: NET_INCOME }
    // G5: a class or kind whose every account the Rows choice hides does not show.
    const shown = book.filter(acct => isShown(acct, rowsChoice))
    const sides: Side[] = ['asset', 'liability', 'equity']
    const sections = sides.map(side => sectionRows(side, shown, computed, input))
    const totalOf = (side: Side) => sections.find(s => s.side === side)?.total ?? ZERO
    const totalLE = computedRow(
        'totalLE',
        TOTAL_LIABILITIES_AND_EQUITY_LABEL,
        0,
        addPair(totalOf('liability'), totalOf('equity'))
    )
    return {
        columns: BALANCE_SHEET_COLUMNS,
        rows: [...sections.flatMap(s => s.rows), totalLE],
        notices: [],
        topics: [
            'collection/books_journal_lines',
            'collection/books_journal_entries',
            'collection/books_accounts',
            'collection/books_settings',
        ],
        heading: BALANCE_SHEET_HEADING,
        page: null,
        params: resolvedParams(rowsChoice),
    }
}

/** Total Assets and Total liabilities and equity of a result, for the checks that they match. */
export function balanceSheetTotals(result: RunResult): {
    assets: Pair
    liabilitiesAndEquity: Pair
} {
    const pairOf = (id: string): Pair => {
        const cells = result.rows.find(row => row.id === id)?.cells ?? {}
        return { current: Number(cells.current ?? 0), prior: Number(cells.prior ?? 0) }
    }
    return {
        assets: pairOf(keyId('s', ['asset'])),
        liabilitiesAndEquity: pairOf('c:totalLE'),
    }
}
