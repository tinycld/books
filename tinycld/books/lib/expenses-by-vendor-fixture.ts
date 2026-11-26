// Synthetic Expenses by Vendor for the helix reference route
// (the Expenses by Vendor design spec). The vendors are the seeded ones
// (vendor-form-fixture.ts), so their names and inactive marks are typed against the
// generated `BooksVendors`. The run results are typed against core's report contract, so
// tsc checks every field. Money is integer cents.
import type { DisplayLayout, ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type {
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import { VENDOR_IDS, VENDORS, type VendorFixtureRecord } from './vendor-form-fixture'

export const EXPENSES_BY_VENDOR_HEADING = 'Harbor Lane Design LLC'
export const EXPENSES_BY_VENDOR_TITLE = 'Expenses by Vendor'
// The shipped report's description (spec §2).
export const EXPENSES_BY_VENDOR_DESCRIPTION =
    'What you spent with each vendor in a period, from posted transactions on expense accounts.'
// "Today" for the reference captures. The default Period is This fiscal year to date, and
// the fiscal year starts in January.
export const EXPENSES_BY_VENDOR_TODAY = '2026-11-21'
export const EXPENSES_BY_VENDOR_FROM = '2026-01-01'
export const EXPENSES_BY_VENDOR_TO = EXPENSES_BY_VENDOR_TODAY
// December 2025 holds one bill and one vendor credit of the same amount, of two vendors:
// each row is not zero, the Total is zero, so % of expenses is blank on every row.
export const EXPENSES_BY_VENDOR_ZERO_FROM = '2025-12-01'
export const EXPENSES_BY_VENDOR_ZERO_TO = '2025-12-31'
// No posted expense line: the empty report.
export const EXPENSES_BY_VENDOR_EMPTY_FROM = '2025-07-01'
export const EXPENSES_BY_VENDOR_EMPTY_TO = '2025-09-30'
// The seed's one entry (plan D5, seedExpensesByVendor in seed.ts): a posted journal
// entry on 6200 Software Subscriptions that nets to zero, so no statement figure moves.
// It gives the seeded book an expense line for the inactive Coastal Coffee Roasters and
// one for the long-named Willamette vendor; the credit names no vendor. 6200 has no 1099
// box, so no 1099 figure moves either. Money is integer cents; the account is its seed
// number.
export const EXPENSES_BY_VENDOR_SEED = {
    date: '2026-09-16',
    memo: 'Seed expenses by vendor: software by vendor',
    lines: [
        { account: '6200', debit: 9600, credit: 0, vendor: VENDOR_IDS.coastalCoffee },
        { account: '6200', debit: 18400, credit: 0, vendor: VENDOR_IDS.willamette },
        { account: '6200', debit: 0, credit: 28000, vendor: '' },
    ],
}
const CURRENCY = 'USD'
const NO_VENDOR_LABEL = 'No vendor'
const INACTIVE_SUFFIX = ' (inactive)'

export type MethodChoice = 'accrual' | 'cash'
export type RowsChoice = 'nonzero' | 'activity'
export type OrderChoice = 'name' | 'amount'

const METHOD_LABELS: Record<MethodChoice, string> = { accrual: 'Accrual', cash: 'Cash' }

// The params as the shipped spec declares them (spec §4; server/report_expenses_by_vendor.go
// builds the same list in Go from `methodParam()`, `rowsParam()` and `vendorsParam()`, and
// its test pins the Go side).
export const EXPENSES_BY_VENDOR_PARAMS: ParamDef[] = [
    {
        id: 'period',
        type: 'dateRange',
        label: 'Period',
        default: { preset: 'thisFiscalYearToDate' },
    },
    {
        id: 'method',
        type: 'choice',
        label: 'Method',
        options: [
            { value: 'accrual', label: METHOD_LABELS.accrual },
            { value: 'cash', label: METHOD_LABELS.cash },
        ],
        default: 'accrual',
        header: '{label} basis',
    },
    {
        id: 'rows',
        type: 'choice',
        label: 'Rows',
        options: [
            { value: 'nonzero', label: 'Non-zero' },
            { value: 'activity', label: 'With activity' },
        ],
        default: 'nonzero',
    },
    {
        id: 'vendors',
        type: 'choice',
        label: 'Vendor',
        multiple: true,
        header: 'Vendor: {label}',
        optionsFrom: {
            source: 'books.vendors',
            value: [{ field: 'id' }],
            label: [{ field: 'display_name' }],
        },
    },
    {
        id: 'order',
        type: 'choice',
        label: 'Order',
        options: [
            { value: 'name', label: 'Name' },
            { value: 'amount', label: 'Largest expenses' },
        ],
        default: 'name',
    },
]

// What the view reads of the spec's groups: one level, the vendor, which opens on a
// press and ends in no subtotal row.
export const EXPENSES_BY_VENDOR_GROUPS: { subtotals?: boolean; open: boolean }[] = [{ open: false }]

// A phone row: the name on line 1, Total and % of expenses on line 2.
export const EXPENSES_BY_VENDOR_PHONE_LAYOUT: DisplayLayout = {
    width: 'mobile',
    tracks: 2,
    cells: [
        { col: 'name', line: 1, span: 2 },
        { col: 'amount', line: 2 },
        { col: 'pct', line: 2 },
    ],
}

// The display block of the shipped spec (spec §4): a long name and an opened line's label
// wrap to three lines and a figure is never cut. `oneLine.minWidth` is the row width
// phase 3 pass 2 measured with this fixture's rows (the helix ledger, Phase notes, has
// the figures).
export const EXPENSES_BY_VENDOR_DISPLAY: NonNullable<ReportSpec['display']> = {
    oneLine: { minWidth: '640px' },
    columns: {
        name: { whiteSpace: 'normal', lineClamp: 3 },
        amount: { minWidth: 'max-content' },
        pct: { minWidth: 'max-content' },
    },
    layouts: [EXPENSES_BY_VENDOR_PHONE_LAYOUT],
}

export const EXPENSES_BY_VENDOR_COLUMNS: ResultColumn[] = [
    {
        id: 'name',
        label: 'Vendor',
        type: 'relation',
        labelCell: 'name@label',
        labelType: 'text',
    },
    { id: 'amount', label: 'Total', type: 'money', aggregate: 'sum', currency: CURRENCY },
    { id: 'pct', label: '% of expenses', type: 'percent', format: 'percent', scale: 2 },
]

type ExpenseVendor = Pick<VendorFixtureRecord, 'id' | 'display_name' | 'inactive'>

function vendor(name: string): ExpenseVendor {
    const found = VENDORS.find(v => v.display_name === name)
    if (!found) throw new Error(`expenses-by-vendor fixture: no seeded vendor ${name}`)
    return {
        id: found.id,
        display_name: found.display_name,
        inactive: found.inactive,
    } satisfies ExpenseVendor
}

// Expense accounts as Books `accountLabel()` writes them: "<number> <full name>", or the
// full name alone for an account with no number.
const ACCOUNTS = {
    cogs: '5000 Cost of goods sold',
    operating: '6000 Operating expenses',
    badDebts: '6050 Bad debts',
    payrollTaxes: '6120 Operating expenses:Payroll:Payroll taxes',
    platform: '6111.1 Operating expenses:Payroll:Wages:Engineering:Platform team',
    rent: '6200 Operating expenses:Rent',
    utilities: '6210 Operating expenses:Utilities',
    legal: '6300 Operating expenses:Legal and professional fees',
    travel: 'Travel, lodging and conference registration for the annual partner summit',
    bank: '7000 Bank charges',
}

// One row of `books.basis_lines` on an expense account: a posted journal line (layer
// `ledger`), or a cash-basis row (layer `cash`), which only a Cash run reads.
interface Line {
    id: string
    layer: 'ledger' | 'cash'
    date: string
    /** "<type> <number>", as `entryTypeNumber()` gives it. */
    doc: string
    account: string
    /** The line's memo, or its entry's (lineDescriptionFormula()); '' when both are blank. */
    description: string
    /** Debit minus credit, in cents: an expense is positive, a vendor credit negative. */
    net: number
    /** The app path the row opens (Books entryOpenPath()). */
    open: string
}

const pad = (n: number) => String(n).padStart(5, '0')

// One payment of a bill: what it pays, of the bill's total.
interface BillPayment {
    number: number
    date: string
    paid: number
    of: number
}

interface DocumentInput {
    number: number
    date: string
    /** One per expense line of the document: account, description, cents. */
    lines: [account: string, description: string, cents: number][]
}

function ledgerLines(
    prefix: string,
    doc: string,
    open: string,
    input: DocumentInput,
    sign: 1 | -1
): Line[] {
    return input.lines.map(([account, description, cents], index) => ({
        id: `${prefix}${pad(input.number)}${index + 1}`,
        layer: 'ledger',
        date: input.date,
        doc,
        account,
        description,
        net: sign * cents,
        open,
    }))
}

// The cash-basis row that takes a deferred document's line out on its own date
// (server/cash_basis.go: each posted line negated, with the kind's memo).
const takenOut = (line: Line, memo: string): Line => ({
    ...line,
    id: `${line.id}x`,
    layer: 'cash',
    description: memo,
    net: -line.net,
})

// The share of a bill's line a payment brings back on the payment's date; the row names
// the payment's entry. The fixture's shares are whole cents.
function broughtBack(line: Line, billNumber: number, payment: BillPayment): Line {
    const share = (line.net * payment.paid) / payment.of
    if (!Number.isInteger(share)) {
        throw new Error(`expenses-by-vendor fixture: share of Bill ${billNumber} is ${share}`)
    }
    return {
        ...line,
        id: `${line.id}p${payment.number}`,
        layer: 'cash',
        date: payment.date,
        doc: `Bill payment ${payment.number}`,
        description: `Bill ${billNumber} paid (cash basis)`,
        net: share,
        open: `books/bill-payments/evpayment0${pad(payment.number)}`,
    }
}

// A posted bill: its expense lines, and on the cash basis each line taken out on the
// bill's date and brought back by each payment's share.
function bill(input: DocumentInput, payments: BillPayment[] = []): Line[] {
    const lines = ledgerLines(
        'evbil',
        `Bill ${input.number}`,
        `books/bills/evbill0000${pad(input.number)}`,
        input,
        1
    )
    return lines.flatMap(line => [
        line,
        takenOut(line, 'Unpaid bill (cash basis)'),
        ...payments.map(payment => broughtBack(line, input.number, payment)),
    ])
}

// A payment of the whole bill.
const paidInFull = (number: number, date: string, cents: number): BillPayment[] => [
    { number, date, paid: cents, of: cents },
]

// A posted vendor credit with no application and no refund: it lowers the vendor's
// expenses on Accrual and is taken out on Cash.
function vendorCredit(input: DocumentInput): Line[] {
    const lines = ledgerLines(
        'evvcr',
        `Vendor credit ${input.number}`,
        `books/vendor-credits/evcredit00${pad(input.number)}`,
        input,
        -1
    )
    return lines.flatMap(line => [line, takenOut(line, 'Unapplied vendor credit (cash basis)')])
}

// A posted expense counts on its date on both bases.
const expense = (input: DocumentInput): Line[] =>
    ledgerLines(
        'evexp',
        `Expense ${input.number}`,
        `books/expenses/evexpense0${pad(input.number)}`,
        input,
        1
    )

const journal = (input: DocumentInput): Line[] =>
    ledgerLines(
        'evjnl',
        `Journal entry JE-${input.number}`,
        `books/entries/eventry000${pad(input.number)}`,
        input,
        1
    )

// The void of a bill: the reversal's lines cancel the bill's. Its label holds the number
// once ("Void reversal of 1027"), and it opens the reversing entry.
function voidOf(input: DocumentInput): Line[] {
    const lines = ledgerLines(
        'evvoi',
        `Void reversal of ${input.number}`,
        `books/entries/evreversal${pad(input.number)}`,
        input,
        -1
    )
    return lines.flatMap(line => [line, takenOut(line, 'Unpaid bill (cash basis)')])
}

// A write-off's bad debt line names a customer, so it is in the No vendor row; a
// write-off never counts on the cash basis.
function writeOff(input: DocumentInput): Line[] {
    const lines = ledgerLines(
        'evwof',
        `Write-off ${input.number}`,
        `books/write-offs/evwriteoff${pad(input.number)}`,
        input,
        1
    )
    return lines.flatMap(line => [line, takenOut(line, 'Write-off (cash basis)')])
}

const LONG_VENDOR = 'Willamette Valley Commercial Cleaning and Janitorial Services Cooperative'
const BLUE_RIDGE = 'Blue Ridge Insurance Agency'
const HARBOR_FREIGHT = 'Harbor Freight Logistics'

// Posted expense-account lines per vendor. Not here, because the report does not read
// them: a bill of Office Supply World that buys standing desks on a fixed asset account,
// the Accounts payable and bank lines of each entry, drafts and void documents.
//
// The edges of the default period (2026-01-01 to 2026-11-21): a bill with two expense
// lines (Brightwave Marketing, Harbor Freight Logistics); a vendor whose only line is a
// vendor credit, so a row and a share below zero (Cascade Fuel & Fleet); a vendor credit
// that lowers a vendor (Greenline Landscaping, Harbor Freight Logistics); expenses and a
// journal entry line with a vendor (First Harbor Bank, Rivera Accounting Partners); a
// part-paid bill, which Cash counts by the paid share on the payment's date (Harbor
// Freight Logistics, Bill 1042, Bill payment 317) and a bill dated after the period
// (Bill 1058); a bill and its void in the period and a bill a vendor credit cancels, both
// shown only under Rows = With activity (Northwest Paper Co., Zenith Telecom); an
// inactive vendor (Coastal Coffee Roasters); a long vendor name, a long account name with
// no number, a long description and an eight-digit amount (Willamette Valley); December
// 2025 lines outside the period (Keystone Legal Group, Rivera Accounting Partners).
const LINES: Record<string, Line[]> = {
    [BLUE_RIDGE]: [
        ...bill(
            {
                number: 1031,
                date: '2026-08-04',
                lines: [[ACCOUNTS.operating, 'General liability policy, renewal', 180000]],
            },
            paidInFull(302, '2026-08-28', 180000)
        ),
        ...bill({
            number: 1049,
            date: '2026-10-31',
            lines: [[ACCOUNTS.operating, 'Workers compensation, fourth quarter', 95000]],
        }),
    ],
    'Brightwave Marketing': bill({
        number: 1052,
        date: '2026-11-02',
        lines: [
            [ACCOUNTS.operating, 'Autumn mailer campaign, printing', 87500],
            [ACCOUNTS.cogs, 'Autumn mailer campaign, postage', 40000],
        ],
    }),
    'Cascade Fuel & Fleet': vendorCredit({
        number: 9,
        date: '2026-09-22',
        lines: [[ACCOUNTS.travel, 'Fleet card rebate, third quarter', 32000]],
    }),
    'Coastal Coffee Roasters': bill(
        {
            number: 1019,
            date: '2026-02-10',
            lines: [[ACCOUNTS.operating, 'Break room coffee service', 64000]],
        },
        paidInFull(298, '2026-03-02', 64000)
    ),
    'First Harbor Bank': [
        ...expense({
            number: 61,
            date: '2026-06-30',
            lines: [[ACCOUNTS.bank, 'Wire fees, second quarter', 4500]],
        }),
        ...expense({
            number: 74,
            date: '2026-09-30',
            lines: [[ACCOUNTS.bank, 'Wire fees, third quarter', 6000]],
        }),
        ...journal({
            number: 19,
            date: '2026-10-31',
            lines: [[ACCOUNTS.bank, 'Loan interest accrual, October', 41250]],
        }),
    ],
    'Greenline Landscaping': [
        ...bill({
            number: 1050,
            date: '2026-10-15',
            lines: [[ACCOUNTS.operating, 'Grounds care, October', 184000]],
        }),
        ...vendorCredit({
            number: 3,
            date: '2026-10-20',
            lines: [[ACCOUNTS.operating, 'Missed visits credit', 63500]],
        }),
    ],
    [HARBOR_FREIGHT]: [
        ...bill(
            {
                number: 1042,
                date: '2026-10-01',
                lines: [
                    [ACCOUNTS.cogs, 'Storage and handling, September', 160000],
                    [ACCOUNTS.operating, 'Fuel surcharge', 40000],
                ],
            },
            [{ number: 317, date: '2026-11-03', paid: 80000, of: 200000 }]
        ),
        ...vendorCredit({
            number: 12,
            date: '2026-10-02',
            lines: [[ACCOUNTS.cogs, 'Storage overcharge credit', 40000]],
        }),
        ...expense({
            number: 57,
            date: '2026-10-19',
            lines: [[ACCOUNTS.cogs, 'Rush delivery, paid by card', 23800]],
        }),
        ...bill({
            number: 1058,
            date: '2026-11-24',
            lines: [[ACCOUNTS.cogs, 'Storage and handling, November', 40000]],
        }),
    ],
    'Jamal Okafor': [
        ...bill(
            {
                number: 1038,
                date: '2026-07-21',
                lines: [[ACCOUNTS.cogs, 'Illustration, brand guidelines', 146000]],
            },
            paidInFull(308, '2026-08-10', 146000)
        ),
        ...bill({
            number: 1055,
            date: '2026-11-06',
            lines: [[ACCOUNTS.cogs, 'Illustration, holiday campaign', 85000]],
        }),
    ],
    'Keystone Legal Group': [
        ...bill(
            {
                number: 1009,
                date: '2025-12-12',
                lines: [[ACCOUNTS.legal, 'Lease review', 90000]],
            },
            paidInFull(291, '2025-12-29', 90000)
        ),
        ...bill(
            {
                number: 1036,
                date: '2026-07-20',
                lines: [[ACCOUNTS.legal, 'Contract review, retainer', 320000]],
            },
            paidInFull(309, '2026-08-20', 320000)
        ),
    ],
    'Metro Commercial Properties': [
        ...bill(
            {
                number: 1033,
                date: '2026-08-01',
                lines: [[ACCOUNTS.rent, 'Studio rent, August', 450000]],
            },
            paidInFull(301, '2026-08-01', 450000)
        ),
        ...bill(
            {
                number: 1040,
                date: '2026-09-01',
                lines: [[ACCOUNTS.rent, 'Studio rent, September', 450000]],
            },
            paidInFull(306, '2026-09-01', 450000)
        ),
        ...bill(
            {
                number: 1045,
                date: '2026-10-01',
                lines: [[ACCOUNTS.rent, 'Studio rent, October', 450000]],
            },
            paidInFull(314, '2026-10-01', 450000)
        ),
        ...bill(
            {
                number: 1051,
                date: '2026-11-01',
                lines: [[ACCOUNTS.rent, 'Studio rent, November', 450000]],
            },
            paidInFull(316, '2026-11-02', 450000)
        ),
    ],
    'Northwest Paper Co.': [
        ...bill({
            number: 1027,
            date: '2026-07-15',
            lines: [[ACCOUNTS.cogs, 'Cover stock, 40 reams', 96000]],
        }),
        ...voidOf({
            number: 1027,
            date: '2026-07-16',
            lines: [[ACCOUNTS.cogs, 'Cover stock, 40 reams', 96000]],
        }),
    ],
    'Office Supply World': [
        ...expense({
            number: 66,
            date: '2026-08-14',
            lines: [[ACCOUNTS.operating, 'Shipping labels', 8950]],
        }),
        ...bill(
            {
                number: 1047,
                date: '2026-09-19',
                lines: [[ACCOUNTS.operating, 'Toner and paper', 115000]],
            },
            paidInFull(312, '2026-10-01', 115000)
        ),
    ],
    'Pacific Power': [
        ...bill(
            {
                number: 1041,
                date: '2026-09-18',
                lines: [[ACCOUNTS.utilities, 'Electricity, August', 28000]],
            },
            paidInFull(313, '2026-10-05', 28000)
        ),
        ...bill({
            number: 1048,
            date: '2026-10-19',
            lines: [[ACCOUNTS.utilities, 'Electricity, September', 26450]],
        }),
    ],
    'Rivera Accounting Partners': [
        ...vendorCredit({
            number: 2,
            date: '2025-12-20',
            lines: [[ACCOUNTS.legal, 'Credit for the withdrawn engagement', 90000]],
        }),
        ...journal({
            number: 12,
            date: '2026-09-01',
            lines: [[ACCOUNTS.legal, 'Accrued tax preparation fee', 31000]],
        }),
    ],
    'Summit IT Services': [
        ...expense({
            number: 71,
            date: '2026-09-09',
            lines: [[ACCOUNTS.operating, 'Emergency on-site repair', 42000]],
        }),
        ...bill({
            number: 1054,
            date: '2026-11-03',
            lines: [[ACCOUNTS.platform, 'Managed backup, November', 9500]],
        }),
    ],
    [LONG_VENDOR]: [
        ...bill(
            {
                number: 1029,
                date: '2026-07-22',
                lines: [[ACCOUNTS.operating, 'Nightly cleaning, second quarter', 987525]],
            },
            paidInFull(305, '2026-09-04', 987525)
        ),
        ...bill({
            number: 1046,
            date: '2026-10-02',
            lines: [
                [
                    ACCOUNTS.operating,
                    'Studio build-out cleaning and floor restoration, including the loading dock and both stairwells',
                    11824000,
                ],
            ],
        }),
        ...expense({
            number: 80,
            date: '2026-11-12',
            lines: [[ACCOUNTS.travel, 'Crew lodging', 61275]],
        }),
    ],
    'Zenith Telecom': [
        ...bill({
            number: 1044,
            date: '2026-09-28',
            lines: [[ACCOUNTS.utilities, 'Fiber line, September, billed twice in error', 18900]],
        }),
        ...vendorCredit({
            number: 11,
            date: '2026-10-06',
            lines: [[ACCOUNTS.utilities, 'Credit for the duplicate bill', 18900]],
        }),
    ],
}

// Expense lines that name no vendor: an expense with no payee, a journal entry line with
// no name and no memo (its label ends after the account), and a write-off's bad debt
// line, which names a customer.
const NO_VENDOR_LINES: Line[] = [
    ...expense({
        number: 63,
        date: '2026-07-08',
        lines: [[ACCOUNTS.travel, 'Parking, client visit', 2400]],
    }),
    ...journal({
        number: 27,
        date: '2026-09-30',
        lines: [[ACCOUNTS.payrollTaxes, '', 152000]],
    }),
    ...writeOff({
        number: 4,
        date: '2026-10-28',
        lines: [[ACCOUNTS.badDebts, 'Invoice 1017, uncollectible', 35000]],
    }),
]

interface VendorLines {
    /** '' for the No vendor row. */
    id: string
    name: string
    inactive: boolean
    /** The lines the run's filter keeps, in date order, then posting order. */
    lines: Line[]
}

export interface ExpensesInput {
    from?: string
    to?: string
    method?: MethodChoice
    rows?: RowsChoice
    order?: OrderChoice
    /** Vendor names the Vendor filter keeps; with it the No vendor row is not shown. */
    vendors?: string[]
    /** Vendor names opened into their lines ('No vendor' for that row). */
    open?: string[]
}

const byName = (a: { name: string }, b: { name: string }) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())

// basisFilter() and the period: the ledger lines always, the cash-basis rows only on
// Cash, dated in the period. The sort is stable, so lines of one day keep posting order.
function kept(lines: Line[], input: ExpensesInput): Line[] {
    const from = input.from ?? EXPENSES_BY_VENDOR_FROM
    const to = input.to ?? EXPENSES_BY_VENDOR_TO
    const isCash = input.method === 'cash'
    return lines
        .filter(line => line.layer === 'ledger' || isCash)
        .filter(line => line.date >= from && line.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date))
}

function vendorLinesOf(input: ExpensesInput): VendorLines[] {
    return Object.keys(LINES).map(name => {
        const v = vendor(name)
        return {
            id: v.id,
            name: v.display_name,
            inactive: v.inactive === true,
            lines: kept(LINES[name] ?? [], input),
        }
    })
}

function noVendor(input: ExpensesInput): VendorLines {
    return { id: '', name: NO_VENDOR_LABEL, inactive: false, lines: kept(NO_VENDOR_LINES, input) }
}

const sum = (values: number[]) => values.reduce((a, v) => a + v, 0)
const amountOf = (row: VendorLines) => sum(row.lines.map(line => line.net))
// Half away from zero, as the engine rounds.
const round2 = (value: number) => (Math.sign(value) * Math.round(Math.abs(value) * 100)) / 100
// percentOfTotal with scale 2; no figure when the Total is zero.
const shareOf = (amount: number, total: number) =>
    total === 0 ? null : round2((amount / total) * 100)

const groupId = (key: string[]) => `g:${JSON.stringify([...key, CURRENCY])}`

const vendorLabel = (row: VendorLines) =>
    row.inactive ? `${row.name}${INACTIVE_SUFFIX}` : row.name

// expenseDetailLabel(): "<date> · <type> <number> · <account> · <description>", with no
// trailing " · " for a blank description.
const lineLabel = (line: Line) =>
    [line.date, line.doc, line.account, line.description].filter(part => part !== '').join(' · ')

// One row per line: its debit minus credit under Total, a blank % of expenses.
function lineRows(row: VendorLines, section: string): ResultRow[] {
    return row.lines.map(line => ({
        id: `d:${line.id}`,
        kind: 'detail',
        depth: 1,
        label: lineLabel(line),
        section,
        open: line.open,
        cells: { amount: line.net, pct: null },
    }))
}

function vendorRows(vendorRow: VendorLines, total: number, input: ExpensesInput): ResultRow[] {
    const isOpen = input.open?.includes(vendorRow.name) === true
    const label = vendorLabel(vendorRow)
    const amount = amountOf(vendorRow)
    const row: ResultRow = {
        id: groupId([vendorRow.id]),
        kind: 'group',
        depth: 0,
        level: 1,
        label,
        groupKey: [vendorRow.id, CURRENCY],
        expanded: isOpen,
        canExpand: true,
        cells: {
            name: vendorRow.id || null,
            'name@label': label,
            amount,
            pct: shareOf(amount, total),
        },
        ...(vendorRow.inactive ? { muted: true } : {}),
    }
    return isOpen ? [row, ...lineRows(vendorRow, row.id)] : [row]
}

// The Vendor filter, then the `having` of the vendor level: a vendor with no line in the
// period never shows; one whose lines add up to zero shows only under With activity.
function shownVendors(input: ExpensesInput): VendorLines[] {
    const rows = input.rows ?? 'nonzero'
    const picked = input.vendors
    const all = picked ? vendorLinesOf(input) : [...vendorLinesOf(input), noVendor(input)]
    return all.filter(
        row =>
            row.lines.length > 0 &&
            (rows === 'activity' || amountOf(row) !== 0) &&
            (!picked || picked.includes(row.name))
    )
}

// Name: vendors by name. Largest expenses: by Total, largest first, then by name. No
// vendor is last in both.
function ordered(shown: VendorLines[], order: OrderChoice): VendorLines[] {
    const named = shown.filter(row => row.id !== '').sort(byName)
    const blank = shown.filter(row => row.id === '')
    if (order === 'name') return [...named, ...blank]
    return [...named.sort((a, b) => amountOf(b) - amountOf(a)), ...blank]
}

function totalRow(total: number): ResultRow {
    return {
        id: `total:${JSON.stringify([CURRENCY])}`,
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: { amount: total, pct: shareOf(total, total) },
    }
}

function resolvedParams(input: ExpensesInput): ResolvedParam[] {
    const vendors: ResolvedParam = input.vendors
        ? { id: 'vendors', type: 'choice', list: input.vendors.map(name => vendor(name).id) }
        : { id: 'vendors', type: 'choice', unset: true }
    return [
        {
            id: 'period',
            type: 'dateRange',
            from: input.from ?? EXPENSES_BY_VENDOR_FROM,
            to: input.to ?? EXPENSES_BY_VENDOR_TO,
        },
        { id: 'method', type: 'choice', value: input.method ?? 'accrual' },
        { id: 'rows', type: 'choice', value: input.rows ?? 'nonzero' },
        vendors,
        { id: 'order', type: 'choice', value: input.order ?? 'name' },
    ]
}

// One line per choice param with a `header`, in param order: the basis, then the Vendor
// picks' labels joined by ", " ('' when unset).
function headerLines(input: ExpensesInput): string[] {
    const basis = `${METHOD_LABELS[input.method ?? 'accrual']} basis`
    const picks = input.vendors ?? []
    return [basis, picks.length > 0 ? `Vendor: ${picks.join(', ')}` : '']
}

// The Total adds the shown rows: under Non-zero a hidden vendor's lines add up to zero,
// so it is also the sum of every line the filter keeps.
export function expensesByVendorResult(input: ExpensesInput = {}): RunResult {
    const shown = ordered(shownVendors(input), input.order ?? 'name')
    const total = sum(shown.map(amountOf))
    return {
        columns: EXPENSES_BY_VENDOR_COLUMNS,
        rows: [...shown.flatMap(row => vendorRows(row, total, input)), totalRow(total)],
        notices: [],
        headerLines: headerLines(input),
        topics: [
            'collection/books_journal_lines',
            'collection/books_cash_basis_lines',
            'collection/books_accounts',
            'collection/books_vendors',
            'collection/books_journal_entries',
            'collection/books_settings',
        ],
        heading: EXPENSES_BY_VENDOR_HEADING,
        page: null,
        params: resolvedParams(input),
    }
}

// A period with no posted expense line: only the Total row, so the view is empty.
export function emptyExpensesByVendorResult(): RunResult {
    const input = { from: EXPENSES_BY_VENDOR_EMPTY_FROM, to: EXPENSES_BY_VENDOR_EMPTY_TO }
    return { ...expensesByVendorResult(input), rows: [totalRow(0)] }
}

// The Vendor filter of the `filtered` state: two vendors, so the chip names both.
export const EXPENSES_BY_VENDOR_FILTER_PICK = [vendor(BLUE_RIDGE), vendor(HARBOR_FREIGHT)]

// The rows the `opened` state opens: a vendor with a two-line bill, a vendor credit and
// an expense; the vendor with the long name, the long account and the long description;
// and the No vendor row.
export const EXPENSES_BY_VENDOR_OPENED = [HARBOR_FREIGHT, LONG_VENDOR, NO_VENDOR_LABEL]

// The row the `cash` state opens: the part-paid bill's lines, each taken out on the
// bill's date and brought back by the payment's share.
export const EXPENSES_BY_VENDOR_CASH_OPENED = [HARBOR_FREIGHT]

// --- The figures, worked out by hand from the lines above (cents). An edit to a line
// that changes a sum must change these too. ---

export const EXPENSES_BY_VENDOR_TOTALS = {
    // The default period on Accrual.
    accrual: 16_464_650,
    // The default period on Cash: paid bills and paid shares, expenses and journal lines.
    cash: 4_093_700,
    // Harbor Freight Logistics: 2,000.00 − 400.00 + 238.00 on Accrual; the 800.00 paid of
    // Bill 1042 and Expense 57 on Cash.
    harborFreightAccrual: 183_800,
    harborFreightCash: 103_800,
}

function check(name: string, actual: number | null, expected: number) {
    if (actual !== expected) {
        throw new Error(`expenses-by-vendor fixture: ${name} is ${actual}, not ${expected}`)
    }
}

function amountOfRow(result: RunResult, isRow: (row: ResultRow) => boolean): number | null {
    const cell = result.rows.find(isRow)?.cells.amount
    return typeof cell === 'number' ? cell : null
}

const isTotal = (row: ResultRow) => row.kind === 'total'
const isHarborFreight = (row: ResultRow) => row.label === HARBOR_FREIGHT

check(
    'Accrual total',
    amountOfRow(expensesByVendorResult(), isTotal),
    EXPENSES_BY_VENDOR_TOTALS.accrual
)
check(
    'Cash total',
    amountOfRow(expensesByVendorResult({ method: 'cash' }), isTotal),
    EXPENSES_BY_VENDOR_TOTALS.cash
)
check(
    'With activity total',
    amountOfRow(expensesByVendorResult({ rows: 'activity' }), isTotal),
    EXPENSES_BY_VENDOR_TOTALS.accrual
)
check(
    'Harbor Freight Logistics on Accrual',
    amountOfRow(expensesByVendorResult(), isHarborFreight),
    EXPENSES_BY_VENDOR_TOTALS.harborFreightAccrual
)
check(
    'Harbor Freight Logistics on Cash',
    amountOfRow(expensesByVendorResult({ method: 'cash' }), isHarborFreight),
    EXPENSES_BY_VENDOR_TOTALS.harborFreightCash
)
check(
    'December 2025 total',
    amountOfRow(
        expensesByVendorResult({
            from: EXPENSES_BY_VENDOR_ZERO_FROM,
            to: EXPENSES_BY_VENDOR_ZERO_TO,
        }),
        isTotal
    ),
    0
)
