// Synthetic Profit and Loss (both shipped reports) for the helix reference route and
// the e2e spec's constants. The run results are typed against core's report contract,
// so tsc checks every field. Money is integer cents; a percent cell is already a
// percent (12.5 = 12.5%).
//
// The by-month result has the shape core checkpoint 0 gives it (spec §4): every month
// of the period is a column (P2), the months come before Total (P3), and each month
// is headed in words (P4). Until checkpoint 0 lands, the words are the column's plain
// label; checkpoint 0 types them (the pivot column's typed label), and checkpoint 1
// moves this fixture to that shape.
import type { DisplayLayout, ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type {
    CellValue,
    Notice,
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import type { BooksAccounts } from '../types'

export const PROFIT_AND_LOSS_TITLE = 'Profit and Loss'
export const PROFIT_AND_LOSS_DESCRIPTION =
    'Income and expenses for a period, and what is left, on the accrual basis.'
export const PROFIT_AND_LOSS_SHIPPED_KEY = 'books.profit_and_loss'
export const PROFIT_AND_LOSS_BY_MONTH_TITLE = 'Profit and Loss by Month'
export const PROFIT_AND_LOSS_BY_MONTH_DESCRIPTION =
    'Income and expenses month by month for a period, on the accrual basis.'
export const PROFIT_AND_LOSS_BY_MONTH_SHIPPED_KEY = 'books.profit_and_loss_by_month'
export const PROFIT_AND_LOSS_HEADING = 'Harbor Lane Design LLC'
// The default period, This fiscal year to date (fiscal year from January), resolved
// on the reference day.
export const PROFIT_AND_LOSS_FROM = '2026-01-01'
export const PROFIT_AND_LOSS_TODAY = '2026-11-09'
// A period longer than the 36-month cap (Q13): 47 months, the first 36 shown.
export const PROFIT_AND_LOSS_LONG_FROM = '2023-01-01'
export const PIVOT_MAX_COLUMNS = 36
const CURRENCY = 'USD'

export const PL_SECTION_TITLES = {
    income: 'Income',
    cost_of_goods_sold: 'Cost of goods sold',
    expense: 'Expenses',
    other_income: 'Other income',
    other_expense: 'Other expenses',
}
export const PL_COMPUTED_LABELS = {
    grossProfit: 'Gross profit',
    netOperatingIncome: 'Net operating income',
    netOtherIncome: 'Net other income',
    netIncome: 'Net income',
}

// The params as the shipped specs declare them (server/report_profit_and_loss.go
// builds the same list in Go; its test pins the Go side).
export const PROFIT_AND_LOSS_PARAMS: ParamDef[] = [
    {
        id: 'period',
        type: 'dateRange',
        label: 'Period',
        default: { preset: 'thisFiscalYearToDate' },
    },
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

type PlType = keyof typeof PL_SECTION_TITLES
const PL_TYPES = Object.keys(PL_SECTION_TITLES) as PlType[]

type PlAccount = Pick<BooksAccounts, 'id' | 'number' | 'full_name'> & {
    type: Extract<BooksAccounts['type'], PlType>
    /** The period's amount by the account's normal side. */
    amount: number
    /** Each month's amount, when it is not the even split (a month with no line is 0). */
    months?: number[]
}

// The starter chart's P&L accounts, in chart order inside each type (number, then full
// name). Discounts and refunds given is a contra income account and reads negative.
// Repairs and maintenance has a charge and its refund in the period: it nets to 0.00,
// so it shows only under Rows = Active. "Meals with clients" has no number (full name
// alone). The software sub-account's long name exercises the ellipsis. Insurance's
// months follow its three posted lines (OPENED_LINES).
export const PL_ACCOUNTS = [
    {
        id: 'placct000004000',
        number: '4000',
        full_name: 'Service income',
        type: 'income',
        amount: 8425000,
    },
    {
        id: 'placct000004100',
        number: '4100',
        full_name: 'Product sales',
        type: 'income',
        amount: 1248000,
    },
    {
        id: 'placct000004200',
        number: '4200',
        full_name: 'Discounts and refunds given',
        type: 'income',
        amount: -115000,
    },
    {
        id: 'placct000005000',
        number: '5000',
        full_name: 'Cost of goods sold',
        type: 'cost_of_goods_sold',
        amount: 532000,
    },
    {
        id: 'placct000006000',
        number: '6000',
        full_name: 'Advertising and marketing',
        type: 'expense',
        amount: 340000,
    },
    {
        id: 'placct000006100',
        number: '6100',
        full_name: 'Bank charges and fees',
        type: 'expense',
        amount: 28640,
    },
    {
        id: 'placct000006200',
        number: '6200',
        full_name: 'Insurance',
        type: 'expense',
        amount: 275000,
        months: [180000, 0, 0, 47500, 0, 0, 47500, 0, 0, 0, 0],
    },
    {
        id: 'placct000006300',
        number: '6300',
        full_name: 'Legal and professional fees',
        type: 'expense',
        amount: 410000,
    },
    {
        id: 'placct000006400',
        number: '6400',
        full_name: 'Office and general',
        type: 'expense',
        amount: 193525,
    },
    {
        id: 'placct000006410',
        number: '6410',
        full_name: 'Office and general:Software subscriptions and cloud storage (annual plans)',
        type: 'expense',
        amount: 86400,
    },
    {
        id: 'placct000006600',
        number: '6600',
        full_name: 'Rent or lease',
        type: 'expense',
        amount: 1800000,
    },
    {
        id: 'placct000006700',
        number: '6700',
        full_name: 'Repairs and maintenance',
        type: 'expense',
        amount: 0,
        months: [0, 0, 18500, 0, -18500, 0, 0, 0, 0, 0, 0],
    },
    {
        id: 'placct000006900',
        number: '6900',
        full_name: 'Utilities',
        type: 'expense',
        amount: 221460,
    },
    {
        id: 'placct00000meal',
        number: '',
        full_name: 'Meals with clients',
        type: 'expense',
        amount: 41275,
    },
    {
        id: 'placct000004900',
        number: '4900',
        full_name: 'Interest earned',
        type: 'other_income',
        amount: 14218,
    },
    {
        id: 'placct000006950',
        number: '6950',
        full_name: 'Depreciation',
        type: 'other_expense',
        amount: 560000,
    },
] satisfies PlAccount[]

// Product sales and Interest earned have no line in April: their April cell reads 0.00.
const NO_APRIL = new Set(['placct000004100', 'placct000004900'])
// Each account's place in the chart varies its monthly split.
const ACCOUNT_INDEX = new Map<string, number>(PL_ACCOUNTS.map((acct, i) => [acct.id, i]))
const APRIL = 3

// The opened account's posted lines in the period, labelled "<date> · <entry number> ·
// <memo>" (the entry's memo when the line has none), by the account's normal side.
// They add to Insurance's 2,750.00.
export const OPENED_ACCOUNT_ID = 'placct000006200'
export const OPENED_LINES = [
    {
        id: 'plline000000002',
        label: '2026-01-05 · JE-2 · Annual general liability policy',
        amount: 180000,
    },
    {
        id: 'plline000000019',
        label: '2026-04-01 · JE-19 · Professional liability premium, second quarter installment for the errors and omissions policy',
        amount: 47500,
    },
    {
        id: 'plline000000038',
        label: '2026-07-01 · JE-38 · Insurance installment',
        amount: 47500,
    },
]

const MONTH_WORDS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
]

interface Month {
    key: string
    words: string
}

// Every month the period touches, in order (P2), keyed as the engine's month bucket.
function monthsOf(from: string, to: string): Month[] {
    const [fromYear, fromMonth] = from.split('-').map(Number)
    const [toYear, toMonth] = to.split('-').map(Number)
    const count = (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1
    return Array.from({ length: count }, (_, i) => {
        const index = fromMonth - 1 + i
        const year = fromYear + Math.floor(index / 12)
        const month = index % 12
        return {
            key: `${year}-${String(month + 1).padStart(2, '0')}`,
            words: `${MONTH_WORDS[month]} ${year}`,
        }
    })
}

export const PL_MONTHS = monthsOf(PROFIT_AND_LOSS_FROM, PROFIT_AND_LOSS_TODAY)

// An account's amount split over the months in whole cents, unevenly; the last month
// takes the rest, so the months add to the total.
function splitMonths(acct: PlAccount, index: number, count: number): number[] {
    if (acct.months && acct.months.length === count) return acct.months
    const weights = Array.from({ length: count }, (_, m) => {
        if (count === PL_MONTHS.length && m === APRIL && NO_APRIL.has(acct.id)) return 0
        return 6 + ((m * 7 + index * 3) % 5)
    })
    const sum = weights.reduce((a, b) => a + b, 0)
    const out = weights.map(w => Math.trunc((acct.amount * w) / sum))
    out[count - 1] += acct.amount - out.reduce((a, b) => a + b, 0)
    return out
}

export type Report = 'total' | 'byMonth'
export type RowsChoice = 'nonzero' | 'active'

export interface ProfitAndLossInput {
    report?: Report
    rows?: RowsChoice
    /** The account whose posted lines show beneath it (Profit and Loss only). */
    openId?: string
    /** Collapse all: every section folded. */
    isCollapsed?: boolean
    /** A period with no posted P&L line. */
    isEmpty?: boolean
    /** By month over a period longer than the 36-month cap. */
    isLong?: boolean
}

// A row's figures: its Total, its month cells (shown months only) and its % of income.
interface Figures {
    amount: number
    months: number[]
}

const ZERO = (count: number): Figures => ({ amount: 0, months: Array(count).fill(0) })

function addFigures(a: Figures, b: Figures, sign = 1): Figures {
    return {
        amount: a.amount + sign * b.amount,
        months: a.months.map((v, m) => v + sign * (b.months[m] ?? 0)),
    }
}

const sumFigures = (count: number, parts: Figures[]) =>
    parts.reduce((total, part) => addFigures(total, part), ZERO(count))

// % of income: the row's Total ÷ Total Income × 100 (P1, Q11); blank with no income.
function cellsOf(
    figures: Figures,
    income: number,
    months: Month[],
    pivotCount: number
): Record<string, CellValue> {
    const monthCells = Object.fromEntries(
        months.slice(0, pivotCount).map((_, m) => [`amount.p${m}`, figures.months[m] ?? 0])
    )
    return {
        ...monthCells,
        amount: figures.amount,
        pct: income === 0 ? null : (figures.amount / income) * 100,
    }
}

const keyId = (prefix: string, key: unknown[]) => `${prefix}:${JSON.stringify([...key, CURRENCY])}`

export const accountLabel = (acct: Pick<PlAccount, 'number' | 'full_name'>) =>
    acct.number ? `${acct.number} ${acct.full_name}` : acct.full_name

function isShown(acct: PlAccount, rows: RowsChoice): boolean {
    return rows === 'active' || acct.amount !== 0
}

/** What the view reads of the spec's groups: the sections open with totals, accounts closed. */
export const PL_GROUPS = [{ subtotals: true, open: true }, { open: false }]

/** What `visibleRows` reads of the spec: the groups, and a layout (its sections). */
export const PL_SUBTOTAL_SPEC = { groups: PL_GROUPS, layout: PL_TYPES }

// Spec §5 `display`: the label narrows first; figures keep their full width. On a
// phone a Profit and Loss row wraps onto the label, then Total · % of income. The
// by-month report has no arrangement: core's automatic lines below one line's width.
export const PROFIT_AND_LOSS_PHONE_LAYOUT: DisplayLayout = {
    width: 'mobile',
    tracks: 2,
    cells: [
        { col: 'account', line: 1, span: 2 },
        { col: 'amount', line: 2 },
        { col: 'pct', line: 2 },
    ],
}

const DISPLAY_COLUMNS: NonNullable<ReportSpec['display']>['columns'] = {
    account: { minWidth: '12ch' },
    amount: { minWidth: 'max-content' },
    pct: { minWidth: 'max-content' },
}

// Without a one-line gate a 390 phone still fits the three columns on one line (the
// label cut to a few characters), so the phone arrangement would never be used; the
// gate keeps one line to rows of 600 px and wider (tablet and up).
export const PROFIT_AND_LOSS_ONE_LINE_MIN_WIDTH = '600px'

export const PROFIT_AND_LOSS_DISPLAY: NonNullable<ReportSpec['display']> = {
    oneLine: { minWidth: PROFIT_AND_LOSS_ONE_LINE_MIN_WIDTH },
    columns: DISPLAY_COLUMNS,
    layouts: [PROFIT_AND_LOSS_PHONE_LAYOUT],
}

export const PROFIT_AND_LOSS_BY_MONTH_DISPLAY: NonNullable<ReportSpec['display']> = {
    columns: DISPLAY_COLUMNS,
}

const ACCOUNT_COLUMN: ResultColumn = {
    id: 'account',
    label: 'Account',
    type: 'relation',
    labelCell: 'account@label',
    labelType: 'text',
}
const TOTAL_COLUMN: ResultColumn = {
    id: 'amount',
    label: 'Total',
    type: 'money',
    aggregate: 'sum',
    currency: CURRENCY,
}
const PCT_COLUMN: ResultColumn = {
    id: 'pct',
    label: '% of income',
    type: 'percent',
    format: 'percent',
}

// The section key column (`sec`) is hidden (G7), so it is not in a result. In the
// by-month report the month columns sit before Total, their cell column (P3).
function columnsOf(report: Report, months: Month[], pivotCount: number): ResultColumn[] {
    if (report === 'total') return [ACCOUNT_COLUMN, TOTAL_COLUMN, PCT_COLUMN]
    const monthColumns = months.slice(0, pivotCount).map(
        (month, m): ResultColumn => ({
            id: `amount.p${m}`,
            label: month.words,
            type: 'money',
            aggregate: 'sum',
            currency: CURRENCY,
            pivot: { cell: 'amount', key: month.key },
        })
    )
    return [ACCOUNT_COLUMN, ...monthColumns, TOTAL_COLUMN, PCT_COLUMN]
}

interface Ctx {
    report: Report
    months: Month[]
    pivotCount: number
    income: number
    input: ProfitAndLossInput
}

function lineRows(section: string): ResultRow[] {
    return OPENED_LINES.map(line => ({
        id: `d:${line.id}`,
        kind: 'detail',
        depth: 2,
        label: line.label,
        section,
        cells: { amount: line.amount, pct: null },
    }))
}

function accountRows(acct: PlAccount, figures: Figures, ctx: Ctx): ResultRow[] {
    const groupKey = [acct.type, acct.id]
    const id = keyId('g', groupKey)
    // A pivot's innermost level never opens; in Profit and Loss an account opens into its lines.
    const canExpand = ctx.report === 'total'
    const isOpen = canExpand && acct.id === ctx.input.openId
    const row: ResultRow = {
        id,
        kind: 'group',
        depth: 1,
        level: 2,
        label: accountLabel(acct),
        section: keyId('g', [acct.type]),
        groupKey: [...groupKey, CURRENCY],
        expanded: isOpen,
        canExpand,
        cells: {
            account: acct.id,
            'account@label': accountLabel(acct),
            ...cellsOf(figures, ctx.income, ctx.months, ctx.pivotCount),
        },
    }
    return isOpen ? [row, ...lineRows(id)] : [row]
}

interface SectionBuilt {
    rows: ResultRow[]
    total: Figures
}

// A section always shows, also when empty (Q5): its title, its accounts, and
// "Total <section>"; folded, only the title and the total.
function sectionRows(type: PlType, accounts: PlAccount[], ctx: Ctx): SectionBuilt {
    const count = ctx.months.length
    const under = accounts.filter(acct => acct.type === type)
    const figures = under.map(acct => ({
        acct,
        figures: {
            amount: acct.amount,
            months: splitMonths(acct, ACCOUNT_INDEX.get(acct.id) ?? 0, count),
        },
    }))
    const total = sumFigures(
        count,
        figures.map(f => f.figures)
    )
    const rowsChoice = ctx.input.rows ?? 'nonzero'
    const shown = figures.filter(f => isShown(f.acct, rowsChoice))
    const id = keyId('g', [type])
    const isOpen = !ctx.input.isCollapsed
    const cells = cellsOf(total, ctx.income, ctx.months, ctx.pivotCount)
    const head: ResultRow = {
        id,
        kind: 'group',
        depth: 0,
        level: 1,
        label: PL_SECTION_TITLES[type],
        groupKey: [type, CURRENCY],
        expanded: isOpen,
        canExpand: true,
        cells,
    }
    const subtotal: ResultRow = {
        id: keyId('s', [type]),
        kind: 'subtotal',
        depth: 0,
        level: 1,
        label: `Total ${PL_SECTION_TITLES[type]}`,
        section: id,
        groupKey: [type, CURRENCY],
        cells,
    }
    const inside = isOpen ? shown.flatMap(f => accountRows(f.acct, f.figures, ctx)) : []
    return { rows: [head, ...inside, subtotal], total }
}

function computedRow(id: keyof typeof PL_COMPUTED_LABELS, figures: Figures, ctx: Ctx): ResultRow {
    return {
        id: `c:${id}`,
        kind: 'computed',
        depth: 0,
        label: PL_COMPUTED_LABELS[id],
        cells: cellsOf(figures, ctx.income, ctx.months, ctx.pivotCount),
    }
}

function capNotice(months: Month[]): Notice[] {
    const left = months.length - PIVOT_MAX_COLUMNS
    if (left <= 0) return []
    return [
        {
            code: 'pivotCap',
            message: `The pivot shows its first ${PIVOT_MAX_COLUMNS} columns; ${left} more are left out.`,
            leftOut: left,
        },
    ]
}

export function profitAndLossResult(input: ProfitAndLossInput = {}): RunResult {
    const report = input.report ?? 'total'
    const from = input.isLong ? PROFIT_AND_LOSS_LONG_FROM : PROFIT_AND_LOSS_FROM
    const months = report === 'byMonth' ? monthsOf(from, PROFIT_AND_LOSS_TODAY) : []
    const pivotCount = Math.min(months.length, PIVOT_MAX_COLUMNS)
    const book: PlAccount[] = input.isEmpty ? [] : PL_ACCOUNTS
    const income = book
        .filter(acct => acct.type === 'income')
        .reduce((sum, acct) => sum + acct.amount, 0)
    const ctx: Ctx = { report, months, pivotCount, income, input }
    const built = Object.fromEntries(
        PL_TYPES.map(type => [type, sectionRows(type, book, ctx)])
    ) as Record<PlType, SectionBuilt>
    const totalOf = (type: PlType) => built[type].total
    const grossProfit = addFigures(totalOf('income'), totalOf('cost_of_goods_sold'), -1)
    const netOperatingIncome = addFigures(grossProfit, totalOf('expense'), -1)
    const netOtherIncome = addFigures(totalOf('other_income'), totalOf('other_expense'), -1)
    const netIncome = addFigures(netOperatingIncome, netOtherIncome)
    const rows = [
        ...built.income.rows,
        ...built.cost_of_goods_sold.rows,
        computedRow('grossProfit', grossProfit, ctx),
        ...built.expense.rows,
        computedRow('netOperatingIncome', netOperatingIncome, ctx),
        ...built.other_income.rows,
        ...built.other_expense.rows,
        computedRow('netOtherIncome', netOtherIncome, ctx),
        computedRow('netIncome', netIncome, ctx),
    ]
    const period: ResolvedParam = {
        id: 'period',
        type: 'dateRange',
        from,
        to: PROFIT_AND_LOSS_TODAY,
    }
    return {
        columns: columnsOf(report, months, pivotCount),
        rows,
        notices: capNotice(months),
        topics: [
            'collection/books_journal_lines',
            'collection/books_journal_entries',
            'collection/books_accounts',
            'collection/books_settings',
        ],
        heading: PROFIT_AND_LOSS_HEADING,
        page: null,
        params: [period, { id: 'rows', type: 'choice', value: input.rows ?? 'nonzero' }],
    }
}

/** A row's cell of a result by row id, for the checks that the statement adds up. */
export function plCell(result: RunResult, rowId: string, col = 'amount'): CellValue {
    return result.rows.find(row => row.id === rowId)?.cells[col] ?? null
}
