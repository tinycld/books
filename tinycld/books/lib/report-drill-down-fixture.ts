// Synthetic Transaction Detail by Account (the report a Profit and Loss figure opens)
// for the helix reference route and the e2e specs' constants. The run results are
// typed against core's report contract, so tsc checks every field. Money is integer
// cents, by the account's normal side (an expense reads positive, a refund to it
// negative).
//
// The lines add up to the Profit and Loss fixture's figures (profit-and-loss-fixture.ts):
// each account's section total equals its Total there, and the Expenses accounts add
// to Total Expenses (33,953.00). That is the rule the drill must keep (spec §5).
import type { ChoiceLabels, ParamValue } from '@tinycld/core/reports/lib/params'
import type { DisplayLayout, ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type {
    CellValue,
    DrillParams,
    DrillTarget,
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import {
    accountLabel,
    PL_ACCOUNTS,
    PL_SECTION_TITLES,
    PROFIT_AND_LOSS_FROM,
    PROFIT_AND_LOSS_HEADING,
    PROFIT_AND_LOSS_TODAY,
    type ProfitAndLossInput,
    profitAndLossResult,
} from './profit-and-loss-fixture'

export const TRANSACTION_DETAIL_TITLE = 'Transaction Detail by Account'
export const TRANSACTION_DETAIL_DESCRIPTION =
    'Posted lines of chosen accounts for a period, grouped by account.'
export const TRANSACTION_DETAIL_SHIPPED_KEY = 'books.transaction_detail'
export const TRANSACTION_DETAIL_HEADING = PROFIT_AND_LOSS_HEADING
const CURRENCY = 'USD'
const SPLIT = '-Split-'
const CHECKING = 'Cash and bank:Business checking'
const PAYABLE = 'Accounts payable'
const CARD = 'Credit card'

// --- The drill (core D1): what a drilled column carries when the reader can view the
// target (`ResultColumn.drill`). ---

export const TRANSACTION_DETAIL_REPORT_ID = 'rptxndetail0001'
export const TRANSACTION_DETAIL_TARGET: DrillTarget = {
    reportId: TRANSACTION_DETAIL_REPORT_ID,
    title: TRANSACTION_DETAIL_TITLE,
}

// --- Params, as the shipped spec declares them (server/report_transaction_detail.go
// builds the same list in Go; its test pins the Go side). ---

export const TRANSACTION_DETAIL_PARAMS: ParamDef[] = [
    {
        id: 'period',
        type: 'dateRange',
        label: 'Period',
        default: { preset: 'thisMonthToDate' },
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
            groupLabel: 'All {group} accounts',
        },
    },
]

type PlAccount = (typeof PL_ACCOUNTS)[number]
type PlType = PlAccount['type']

const accountById = (id: string) => PL_ACCOUNTS.find(acct => acct.id === id)

// The Accounts chip's labels, as POST /api/reports/param-options names them: an account
// by its full name, a type's whole-group pick by the type's label.
const TYPE_LABELS: Record<PlType, string> = {
    income: 'Income',
    cost_of_goods_sold: 'Cost of goods sold',
    expense: 'Expense',
    other_income: 'Other income',
    other_expense: 'Other expense',
}

export const TRANSACTION_DETAIL_ACCOUNT_LABELS: ChoiceLabels = new Map([
    ...PL_ACCOUNTS.map(acct => [acct.id, acct.full_name] as const),
    ...Object.entries(TYPE_LABELS).map(([type, label]) => [`group:${type}`, label] as const),
])

// --- The posted lines behind each Expenses account of the Profit and Loss. ---

/** One posted line as the report shows it: the cells the spec's columns compute. */
export interface TransactionLine {
    id: string
    account: string
    day: string
    type: string
    number: string
    name: string
    description: string
    split: string
    /** By the account's normal side. */
    amount: number
}

type LineInput = Omit<TransactionLine, 'id' | 'account'>

const RENT = 'placct000006600'
const LANDLORD = 'Harborview Commercial Properties Management Group LLC'
const RENT_MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']
const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
]

// Ten monthly bills of 1,800.00, and a rent paid twice in March with its void reversal:
// both show, and they cancel. Rent or lease's total is the P&L's 18,000.00.
const RENT_LINES: LineInput[] = [
    ...RENT_MONTHS.map((month, i) => ({
        day: `2026-${month}-01`,
        type: 'Bill',
        number: `B-${101 + i}`,
        name: LANDLORD,
        description: `Studio suite 4B rent, ${MONTH_NAMES[i]}`,
        split: PAYABLE,
        amount: 180000,
    })),
    {
        day: '2026-03-02',
        type: 'Journal entry',
        number: 'JE-24',
        name: LANDLORD,
        description: 'March rent paid from checking by mistake',
        split: CHECKING,
        amount: 180000,
    },
    {
        day: '2026-03-04',
        type: 'Void reversal',
        number: 'JE-25',
        name: LANDLORD,
        description: 'Void: March rent paid from checking by mistake',
        split: CHECKING,
        amount: -180000,
    },
]

// Every Expenses account's lines (Rent or lease above). Repairs and maintenance has a
// charge and its refund: its section total is 0.00. Meals with clients has no number.
const EXPENSE_LINES: Record<string, LineInput[]> = {
    placct000006000: [
        {
            day: '2026-02-12',
            type: 'Bill',
            number: 'B-118',
            name: 'Brightline Media Co.',
            description: 'Spring trade-show booth deposit',
            split: PAYABLE,
            amount: 150000,
        },
        {
            day: '2026-05-20',
            type: 'Journal entry',
            number: 'JE-61',
            name: '',
            description: 'Social campaign, May',
            split: CARD,
            amount: 90000,
        },
        {
            day: '2026-09-08',
            type: 'Bill',
            number: 'B-161',
            name: 'Brightline Media Co.',
            description: 'Fall catalog design and print run',
            split: PAYABLE,
            amount: 100000,
        },
    ],
    placct000006100: ['2026-03-31', '2026-06-30', '2026-09-30', '2026-10-31'].map((day, i) => ({
        day,
        type: 'Journal entry',
        number: `JE-${30 + i * 25}`,
        name: '',
        description: 'Account service fee',
        split: CHECKING,
        amount: 7160,
    })),
    placct000006200: [
        {
            day: '2026-01-05',
            type: 'Journal entry',
            number: 'JE-2',
            name: 'Cascade Mutual Insurance',
            description: 'Annual general liability policy',
            split: CHECKING,
            amount: 180000,
        },
        {
            day: '2026-04-01',
            type: 'Journal entry',
            number: 'JE-19',
            name: 'Cascade Mutual Insurance',
            description:
                'Professional liability premium, second quarter installment for the errors and omissions policy',
            split: CHECKING,
            amount: 47500,
        },
        {
            day: '2026-07-01',
            type: 'Journal entry',
            number: 'JE-38',
            name: 'Cascade Mutual Insurance',
            description: 'Insurance installment',
            split: CHECKING,
            amount: 47500,
        },
    ],
    placct000006300: [
        {
            day: '2026-02-27',
            type: 'Bill',
            number: 'B-121',
            name: 'Okafor & Lindqvist LLP',
            description: 'Operating agreement amendment',
            split: PAYABLE,
            amount: 160000,
        },
        {
            day: '2026-08-14',
            type: 'Bill',
            number: 'B-152',
            name: 'Okafor & Lindqvist LLP',
            description: 'Trademark filing — Harbor Lane wordmark and logo, two classes',
            split: PAYABLE,
            amount: 250000,
        },
    ],
    placct000006400: [
        {
            day: '2026-01-19',
            type: 'Journal entry',
            number: 'JE-6',
            name: '',
            description: 'Desk chairs (2)',
            split: CARD,
            amount: 112000,
        },
        {
            day: '2026-06-03',
            type: 'Journal entry',
            number: 'JE-70',
            name: '',
            description: 'Printer toner and paper',
            split: CARD,
            amount: 38525,
        },
        {
            day: '2026-10-15',
            type: 'Journal entry',
            number: 'JE-109',
            name: '',
            description: 'Kitchen supplies and postage',
            split: SPLIT,
            amount: 43000,
        },
    ],
    placct000006410: [
        {
            day: '2026-01-02',
            type: 'Journal entry',
            number: 'JE-1',
            name: 'Summit IT Services',
            description: 'Design suite, annual plan',
            split: CARD,
            amount: 86400,
        },
    ],
    [RENT]: RENT_LINES,
    placct000006700: [
        {
            day: '2026-03-16',
            type: 'Bill',
            number: 'B-133',
            name: 'Pacific Door & Lock',
            description: 'Front door closer replaced',
            split: PAYABLE,
            amount: 18500,
        },
        {
            day: '2026-05-04',
            type: 'Journal entry',
            number: 'JE-63',
            name: 'Pacific Door & Lock',
            description: 'Refund: closer under warranty',
            split: CHECKING,
            amount: -18500,
        },
    ],
    placct000006900: ['2026-02-10', '2026-05-11', '2026-08-10', '2026-10-12'].map((day, i) => ({
        day,
        type: 'Bill',
        number: `B-${125 + i * 12}`,
        name: 'Portland General Electric',
        description: 'Electricity, studio suite 4B',
        split: PAYABLE,
        amount: 55365,
    })),
    placct00000meal: [
        {
            day: '2026-04-22',
            type: 'Journal entry',
            number: 'JE-55',
            name: '',
            description: 'Lunch with Northwind Traders — Q2 review',
            split: CARD,
            amount: 18650,
        },
        {
            day: '2026-09-30',
            type: 'Journal entry',
            number: 'JE-102',
            name: '',
            description: 'Client dinner, West Annex project kickoff',
            split: CARD,
            amount: 22625,
        },
    ],
}

/** Every line of the fixture, in the report's order inside each account (date, then posting). */
export const TRANSACTION_LINES: TransactionLine[] = Object.entries(EXPENSE_LINES).flatMap(
    ([account, lines]) =>
        [...lines]
            .sort((a, b) => a.day.localeCompare(b.day))
            .map((line, i) => ({ ...line, account, id: `tdline${account.slice(-6)}${i}` }))
)

// --- The report's columns, display and view spec. ---

// Every column is sortable (F8); Amount is the line by its account's normal side.
export const TRANSACTION_DETAIL_COLUMNS: ResultColumn[] = [
    {
        id: 'account',
        label: 'Account / Date',
        type: 'relation',
        labelCell: 'account@label',
        labelType: 'text',
        sortable: true,
    },
    { id: 'type', label: 'Type', type: 'text', sortable: true },
    { id: 'number', label: 'No.', type: 'text', sortable: true },
    { id: 'name', label: 'Name', type: 'text', sortable: true },
    { id: 'description', label: 'Description', type: 'text', sortable: true },
    { id: 'split', label: 'Split', type: 'text', sortable: true },
    {
        id: 'amount',
        label: 'Amount',
        type: 'money',
        currency: CURRENCY,
        aggregate: 'sum',
        sortable: true,
    },
]

/** What the view reads of the spec: one group level (the account), open, with subtotals. */
export const TRANSACTION_DETAIL_VIEW_SPEC = {
    groups: [{ subtotals: true, open: true }],
    columns: [],
}

// Spec §3 Narrow widths: a phone row (and a row of the 480 px drill panel) wraps onto
// three lines: date · type · No.; Name · Description; Split · Amount.
export const TRANSACTION_DETAIL_PHONE_LAYOUT: DisplayLayout = {
    width: 'mobile',
    tracks: 3,
    cells: [
        { col: 'account', line: 1 },
        { col: 'type', line: 1 },
        { col: 'number', line: 1 },
        { col: 'name', line: 2 },
        { col: 'description', line: 2, span: 2 },
        { col: 'split', line: 3, span: 2 },
        { col: 'amount', line: 3 },
    ],
}

// A tablet row keeps the figures on the date's line and the long text on the line below.
export const TRANSACTION_DETAIL_TABLET_LAYOUT: DisplayLayout = {
    width: 'tablet',
    minWidth: '600px',
    tracks: 12,
    cells: [
        { col: 'account', line: 1, span: 3 },
        { col: 'type', line: 1, span: 3 },
        { col: 'number', line: 1, span: 2 },
        { col: 'amount', line: 1, span: 4 },
        { col: 'name', line: 2, span: 3 },
        { col: 'description', line: 2, span: 5 },
        { col: 'split', line: 2, span: 4 },
    ],
}

// The one line is tried only from this row width: below it the seven columns cut
// Name, Description and Split to a few characters. Phase 3 pass 2 (lesson 30): at a
// 956 px row (1280 window with the Books sidebar) core's fit drew the tablet layout,
// so one line does not fit there; 390 and the 480 panel draw the phone layout. On
// core's report route (no package sidebar) a 1280 window gives a 1216 px row, which
// draws one line with Date, No. and Amount whole (only a long Description ends in an
// ellipsis), and a 1024 window gives a 960 px row, which draws the tablet layout.
// Server: transactionDetailDisplay in server/report_transaction_detail.go.
export const TRANSACTION_DETAIL_ONE_LINE_MIN_WIDTH = '960px'

export const TRANSACTION_DETAIL_DISPLAY: NonNullable<ReportSpec['display']> = {
    oneLine: { minWidth: TRANSACTION_DETAIL_ONE_LINE_MIN_WIDTH },
    columns: {
        type: { minWidth: '12ch' },
        number: { minWidth: 'max-content' },
        name: { minWidth: '16ch' },
        split: { minWidth: '20ch' },
        description: { flexGrow: 2 },
        amount: { minWidth: 'max-content' },
    },
    layouts: [TRANSACTION_DETAIL_PHONE_LAYOUT, TRANSACTION_DETAIL_TABLET_LAYOUT],
}

// --- Run results. ---

const groupId = (account: string) => `g:${JSON.stringify([account, CURRENCY])}`

const sumOf = (lines: readonly TransactionLine[]) => lines.reduce((sum, l) => sum + l.amount, 0)

function detailRow(section: string, line: TransactionLine): ResultRow {
    const cells: Record<string, CellValue> = {
        type: line.type,
        number: line.number,
        name: line.name,
        description: line.description,
        split: line.split,
        amount: line.amount,
    }
    return {
        id: `d:${line.id}`,
        kind: 'detail',
        depth: 1,
        label: line.day,
        labelType: 'date',
        labelValue: line.day,
        section,
        cells,
    }
}

function sectionRows(acct: PlAccount, lines: readonly TransactionLine[]): ResultRow[] {
    const id = groupId(acct.id)
    const label = accountLabel(acct)
    const total = sumOf(lines)
    const group: ResultRow = {
        id,
        kind: 'group',
        depth: 0,
        level: 1,
        label,
        groupKey: [acct.id, CURRENCY],
        expanded: true,
        canExpand: true,
        cells: { account: acct.id, 'account@label': label, amount: total },
    }
    const subtotal: ResultRow = {
        id: `s:${JSON.stringify([acct.id, CURRENCY])}`,
        kind: 'subtotal',
        depth: 0,
        level: 1,
        label: `Total ${label}`,
        section: id,
        groupKey: [acct.id, CURRENCY],
        cells: { amount: total },
    }
    return [group, ...lines.map(line => detailRow(id, line)), subtotal]
}

function totalRow(lines: readonly TransactionLine[]): ResultRow {
    return {
        id: `total:${JSON.stringify([CURRENCY])}`,
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: { amount: lines.length === 0 ? null : sumOf(lines) },
    }
}

export interface TransactionDetailInput {
    /** Account ids the Accounts param chose. */
    accounts?: string[]
    /** A whole account type the Accounts param chose ("All Expense accounts"). */
    type?: PlType
    from?: string
    to?: string
}

function chosenAccounts(input: TransactionDetailInput): PlAccount[] {
    if (input.type) return PL_ACCOUNTS.filter(acct => acct.type === input.type)
    return (input.accounts ?? []).flatMap(id => accountById(id) ?? [])
}

export function transactionDetailResult(input: TransactionDetailInput): RunResult {
    const from = input.from ?? PROFIT_AND_LOSS_FROM
    const to = input.to ?? PROFIT_AND_LOSS_TODAY
    const inPeriod = (line: TransactionLine) => line.day >= from && line.day <= to
    const sections = chosenAccounts(input)
        .map(acct => ({
            acct,
            lines: TRANSACTION_LINES.filter(l => l.account === acct.id && inPeriod(l)),
        }))
        .filter(section => section.lines.length > 0)
    const lines = sections.flatMap(section => section.lines)
    const accounts: ResolvedParam = input.type
        ? {
              id: 'accounts',
              type: 'choice',
              list: sections.map(s => s.acct.id),
              groups: [input.type],
          }
        : { id: 'accounts', type: 'choice', list: input.accounts ?? [] }
    return {
        columns: TRANSACTION_DETAIL_COLUMNS,
        rows: [...sections.flatMap(s => sectionRows(s.acct, s.lines)), totalRow(lines)],
        notices: [],
        topics: [
            'collection/books_journal_lines',
            'collection/books_journal_entries',
            'collection/books_accounts',
            'collection/books_customers',
            'collection/books_vendors',
            'collection/books_settings',
        ],
        heading: TRANSACTION_DETAIL_HEADING,
        page: null,
        params: [{ id: 'period', type: 'dateRange', from, to }, accounts],
        headerLines: [],
    }
}

// --- What a drill sets: the Profit and Loss row's figure, and its target params. ---

/**
 * The source's own period: a figure over the whole period keeps it (spec §3). The
 * drill's `{ param: "period" }` copies the period as the run was given it, else its
 * default (core drill.go givenParam): the P&L's default preset.
 */
const PL_PERIOD_JSON = { preset: 'thisFiscalYearToDate' }
export const PL_PERIOD_VALUE: ParamValue = { kind: 'preset', preset: 'thisFiscalYearToDate' }

/** An account row's Total opens that account. */
export function accountDrillValues(accountId: string): Record<string, ParamValue> {
    return {
        period: PL_PERIOD_VALUE,
        accounts: { kind: 'choice', values: [accountId] },
    }
}

/** A section's heading and its "Total <section>" open the section's whole type. */
export function sectionDrillValues(type: PlType): Record<string, ParamValue> {
    return {
        period: PL_PERIOD_VALUE,
        accounts: { kind: 'choice', values: [], groups: [type] },
    }
}

/**
 * The Profit and Loss run's `amount@drill` cells by row id (spec §5 "Drills added"):
 * every account row, and every section's heading and subtotal. Computed rows and
 * % of income have none. Each value is in the run request's JSON form, as core's
 * engine writes it (drill.go drillParams): the one item of the multiple-choice
 * Accounts as a list of one id, a `{ group }` pick as `[{ group: <type> }]`.
 */
export function profitAndLossDrillCells(rows: readonly ResultRow[]): Record<string, DrillParams> {
    const out: Record<string, DrillParams> = {}
    for (const row of rows) {
        const [type, account] = (row.groupKey ?? []) as [PlType, string | undefined]
        if (row.kind === 'group' && row.level === 2 && account) {
            out[row.id] = { period: PL_PERIOD_JSON, accounts: [account] }
        } else if ((row.kind === 'group' || row.kind === 'subtotal') && row.level === 1) {
            out[row.id] = { period: PL_PERIOD_JSON, accounts: [{ group: type }] }
        }
    }
    return out
}

/** The P&L's Total column, whose figures open Transaction Detail by Account. */
const PL_DRILLED_COLUMN = 'amount'

// A `@drill` cell is not a CellValue (core types.ts R12): the row carries it as the
// server sends it, and core reads it only through drillCellParams.
function withDrillCell(row: ResultRow, drill: DrillParams | undefined): ResultRow {
    if (!drill) return row
    const cells: Record<string, unknown> = { ...row.cells, [`${PL_DRILLED_COLUMN}@drill`]: drill }
    return { ...row, cells: cells as ResultRow['cells'] }
}

/**
 * The Profit and Loss run as core's engine sends it to a reader who can view
 * Transaction Detail by Account: the Total column carries the drill target, and each
 * account row, section heading and section total its `amount@drill` cell.
 */
export function profitAndLossDrilledResult(input: ProfitAndLossInput = {}): RunResult {
    const result = profitAndLossResult(input)
    const cells = profitAndLossDrillCells(result.rows)
    return {
        ...result,
        columns: result.columns.map(column =>
            column.id === PL_DRILLED_COLUMN
                ? { ...column, drill: TRANSACTION_DETAIL_TARGET }
                : column
        ),
        rows: result.rows.map(row => withDrillCell(row, cells[row.id])),
    }
}

/** The opened figure of the reference: 6600 Rent or lease's Total, 18,000.00. */
export const DRILL_ACCOUNT_ID = RENT
export const DRILL_ACCOUNT_LABEL = '6600 Rent or lease'
export const DRILL_ACCOUNT_TOTAL = 1800000
/** The opened section of the reference: Expenses, 33,953.00. */
export const DRILL_SECTION_TYPE: PlType = 'expense'
export const DRILL_SECTION_TITLE = PL_SECTION_TITLES.expense
export const DRILL_SECTION_TOTAL = 3395300
/** A P&L by Month cell: March, a whole month inside the period. */
export const DRILL_MONTH_FROM = '2026-03-01'
export const DRILL_MONTH_TO = '2026-03-31'
/** A period with no posted line of the opened account: the empty state. */
export const DRILL_EMPTY_FROM = '2026-11-02'
