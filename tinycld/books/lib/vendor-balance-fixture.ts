// Synthetic Vendor Balance for the helix reference route (docs/specs/vendor-balance-design.md).
// The vendors are the seeded ones (vendor-form-fixture.ts), so their names and inactive
// marks are typed against the generated `BooksVendors`. The run results are typed against
// core's report contract, so tsc checks every field. Money is integer cents.
import type { ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type {
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import { VENDORS, type VendorFixtureRecord } from './vendor-form-fixture'

// "Today" for the reference captures: the As of param's default.
export const VENDOR_BALANCE_TODAY = '2026-11-20'
export const VENDOR_BALANCE_HEADING = 'Harbor Lane Design LLC'
export const VENDOR_BALANCE_TITLE = 'Vendor Balance'
// The shipped report's description (spec §2).
export const VENDOR_BALANCE_DESCRIPTION =
    'What you owe each vendor on one day, from posted transactions on Accounts payable accounts.'
// A day before every posted Accounts payable line: the empty report.
export const VENDOR_BALANCE_EMPTY_DAY = '2020-01-01'
const CURRENCY = 'USD'
const NO_VENDOR_LABEL = 'No vendor'
const INACTIVE_SUFFIX = ' (inactive)'

function seededVendor(name: string): VendorFixtureRecord {
    const found = VENDORS.find(v => v.display_name === name)
    if (!found) throw new Error(`vendor-balance fixture: no seeded vendor ${name}`)
    return found
}

// What the seed adds to the seeded book (spec §4 Files, Q9), with fixed 2026 dates: one
// posted journal entry on Accounts payable that names no vendor (the No vendor row) and
// one that names an inactive seeded vendor (a muted row). Each entry credits the book's
// Accounts payable account and debits the other account. The seed chart has no Accounts
// payable account: the server makes it on the first bill post, so the seed reads it by
// its type and not by a number. Cents; the other account by its seed account number.
interface VendorBalanceSeedEntry {
    /** '' for the entry that names no vendor. */
    vendor: string
    date: string
    memo: string
    otherNumber: string
    cents: number
}

export const VENDOR_BALANCE_SEED = {
    noVendorEntry: {
        vendor: '',
        date: '2026-10-05',
        memo: 'Seed vendor balance: payable with no vendor',
        otherNumber: '6200',
        cents: 7500,
    } satisfies VendorBalanceSeedEntry,
    inactiveEntry: {
        vendor: seededVendor('Old Town Print Shop').id,
        date: '2026-10-08',
        memo: 'Seed vendor balance: letterhead reprint',
        otherNumber: '6200',
        cents: 21600,
    } satisfies VendorBalanceSeedEntry,
}

export type RowsChoice = 'nonzero' | 'activity'
export type OrderChoice = 'name' | 'balance'

// The params as the shipped spec declares them (server/report_vendor_balance.go builds
// the same list in Go: `balanceParams(vendorsParam())`; its test pins the Go side).
export const VENDOR_BALANCE_PARAMS: ParamDef[] = [
    { id: 'asOf', type: 'asOf', label: 'As of', default: { preset: 'today' } },
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
            { value: 'balance', label: 'Largest balance' },
        ],
        default: 'name',
    },
]

// What the view reads of the spec's groups: one level, the vendor, which opens on a
// press and ends in no subtotal row.
export const VENDOR_BALANCE_GROUPS: { subtotals?: boolean; open: boolean }[] = [{ open: false }]

// The display block of the shipped spec (`balanceDisplay()`, spec §4): a long name wraps
// to three lines and a figure is never cut. Phase 3 pass 2 measured it with this
// fixture's rows (the helix ledger, Phase notes, has the widths).
export const VENDOR_BALANCE_DISPLAY: NonNullable<ReportSpec['display']> = {
    columns: {
        name: { whiteSpace: 'normal', lineClamp: 3 },
        balance: { minWidth: 'max-content' },
    },
}

export const VENDOR_BALANCE_COLUMNS: ResultColumn[] = [
    {
        id: 'name',
        label: 'Vendor',
        type: 'relation',
        labelCell: 'name@label',
        labelType: 'text',
    },
    { id: 'balance', label: 'Balance', type: 'money', aggregate: 'sum', currency: CURRENCY },
]

type BalanceVendor = Pick<VendorFixtureRecord, 'id' | 'display_name' | 'inactive'>

function vendor(name: string): BalanceVendor {
    const found = seededVendor(name)
    return {
        id: found.id,
        display_name: found.display_name,
        inactive: found.inactive,
    } satisfies BalanceVendor
}

// One posted journal line on an Accounts payable account.
interface Line {
    id: string
    date: string
    /** "<type> <number>", as lineEntryTypeLabel() and the entry number give it. */
    doc: string
    /** The line's memo, or its entry's (lineDescriptionFormula()). */
    description: string
    /** Credit minus debit, in cents: a bill is positive, a payment negative. */
    net: number
    /** The app path the row opens (Books entryOpenPath()). */
    open: string
}

const pad = (n: number) => String(n).padStart(5, '0')

const bill = (n: number, date: string, description: string, cents: number): Line => ({
    id: `vbline0bil${pad(n)}`,
    date,
    doc: `Bill ${n}`,
    description,
    net: cents,
    open: `books/bills/vbbill0000${pad(n)}`,
})

const billPayment = (n: number, date: string, description: string, paid: number): Line => ({
    id: `vbline0pay${pad(n)}`,
    date,
    doc: `Bill payment ${n}`,
    description,
    net: -paid,
    open: `books/bill-payments/vbpayment0${pad(n)}`,
})

const vendorCredit = (n: number, date: string, description: string, cents: number): Line => ({
    id: `vbline00vc${pad(n)}`,
    date,
    doc: `Vendor credit ${n}`,
    description,
    net: -cents,
    open: `books/vendor-credits/vbcredit00${pad(n)}`,
})

const vendorRefund = (n: number, date: string, description: string, cents: number): Line => ({
    id: `vbline0ref${pad(n)}`,
    date,
    doc: `Vendor refund ${n}`,
    description,
    net: cents,
    open: `books/vendor-refunds/vbrefund00${pad(n)}`,
})

const journal = (n: number, date: string, description: string, net: number): Line => ({
    id: `vbline00je${pad(n)}`,
    date,
    doc: `Journal entry JE-${n}`,
    description,
    net,
    open: `books/entries/vbentry000${pad(n)}`,
})

// Posted Accounts payable lines per vendor, in date order then posting order. The edges
// as of 2026-11-20: a part payment (Blue Ridge Insurance Agency); a vendor credit with
// no application, so a negative balance (Cascade Fuel & Fleet); a vendor credit that is
// applied in part to a bill (the application posts no line, so it has no row) and
// refunded in part, with a bill dated after the day (Harbor Freight Logistics); one
// payment of two bills (Office Supply World, Bill payment 321); a paid-off vendor and a
// vendor whose bill a credit cancels, both shown only under Rows = With activity
// (Northwest Paper Co., Zenith Telecom); a journal entry line with a vendor (Rivera
// Accounting Partners, Willamette Valley) and with none; an inactive vendor (Coastal
// Coffee Roasters); a long name, a long description and a six-figure amount (Willamette
// Valley).
const LINES: Record<string, Line[]> = {
    'Blue Ridge Insurance Agency': [
        bill(1031, '2026-08-04', 'General liability policy, renewal', 180000),
        billPayment(302, '2026-08-28', 'Check 1048', 100000),
        bill(1049, '2026-10-31', 'Workers compensation, fourth quarter', 95000),
    ],
    'Brightwave Marketing': [bill(1052, '2026-11-02', 'Autumn mailer campaign', 127500)],
    'Cascade Fuel & Fleet': [
        vendorCredit(9, '2026-09-22', 'Fleet card rebate, third quarter', 32000),
    ],
    'Coastal Coffee Roasters': [bill(1019, '2026-02-10', 'Break room coffee service', 64000)],
    'Greenline Landscaping': [
        bill(1050, '2026-10-15', 'Grounds care, October', 184000),
        vendorCredit(3, '2026-10-20', 'Missed visits credit', 63500),
    ],
    'Harbor Freight Logistics': [
        bill(1042, '2026-10-01', 'Storage and handling, September', 200000),
        vendorCredit(12, '2026-10-02', 'Storage overcharge credit', 40000),
        billPayment(317, '2026-11-03', 'Check 1059', 80000),
        vendorRefund(4, '2026-11-09', 'Refund of unused credit, ACH', 10000),
        bill(1058, '2026-11-24', 'Storage and handling, November', 40000),
    ],
    'Jamal Okafor': [
        bill(1038, '2026-07-21', 'Illustration, brand guidelines', 146000),
        bill(1055, '2026-11-06', 'Illustration, holiday campaign', 85000),
    ],
    'Keystone Legal Group': [bill(1036, '2026-07-20', 'Contract review, retainer', 320000)],
    'Northwest Paper Co.': [
        bill(1027, '2026-07-15', 'Cover stock, 40 reams', 96000),
        billPayment(297, '2026-08-11', 'Check 1041', 96000),
    ],
    'Office Supply World': [
        bill(1047, '2026-09-19', 'Toner and paper', 115000),
        bill(1053, '2026-11-10', 'Standing desks, studio', 420000),
        billPayment(321, '2026-11-12', 'ACH, Bills 1047 and 1053', 135000),
    ],
    'Pacific Power': [bill(1041, '2026-09-18', 'Electricity, August', 280000)],
    'Rivera Accounting Partners': [journal(12, '2026-09-01', 'Accrued tax preparation fee', 31000)],
    'Summit IT Services': [bill(1054, '2026-11-03', 'Managed backup, November', 9500)],
    'Willamette Valley Commercial Cleaning and Janitorial Services Cooperative': [
        journal(
            41,
            '2026-01-01',
            'Opening balance carried from the previous bookkeeping system, cleaning contract year 2025',
            500000
        ),
        bill(1029, '2026-07-22', 'Nightly cleaning, second quarter', 987525),
        billPayment(305, '2026-09-04', 'Check 1052', 300000),
        bill(1046, '2026-10-02', 'Studio build-out cleaning and floor restoration', 11824000),
    ],
    'Zenith Telecom': [
        bill(1044, '2026-09-28', 'Fiber line, September, billed twice in error', 18900),
        vendorCredit(11, '2026-10-06', 'Credit for the duplicate bill', 18900),
    ],
}

// Accounts payable lines that name no vendor.
const NO_VENDOR_LINES: Line[] = [
    journal(2, '2026-01-01', 'Opening balance, Accounts payable', 7500),
]

interface VendorLines {
    /** '' for the No vendor row. */
    id: string
    name: string
    inactive: boolean
    /** The lines dated on or before the As of day. */
    lines: Line[]
}

const byName = (a: { name: string }, b: { name: string }) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())

const onOrBefore = (lines: Line[], asOf: string) => lines.filter(line => line.date <= asOf)

function vendorLinesOf(asOf: string): VendorLines[] {
    return Object.keys(LINES).map(name => {
        const v = vendor(name)
        return {
            id: v.id,
            name: v.display_name,
            inactive: v.inactive === true,
            lines: onOrBefore(LINES[name] ?? [], asOf),
        }
    })
}

function noVendor(asOf: string): VendorLines {
    return {
        id: '',
        name: NO_VENDOR_LABEL,
        inactive: false,
        lines: onOrBefore(NO_VENDOR_LINES, asOf),
    }
}

const sum = (values: number[]) => values.reduce((a, v) => a + v, 0)
const balanceOf = (row: VendorLines) => sum(row.lines.map(line => line.net))

const groupId = (key: string[]) => `g:${JSON.stringify([...key, CURRENCY])}`

const vendorLabel = (row: VendorLines) =>
    row.inactive ? `${row.name}${INACTIVE_SUFFIX}` : row.name

interface ResultInput {
    rows?: RowsChoice
    order?: OrderChoice
    /** Vendor names the Vendor filter keeps; with it the No vendor row is not shown. */
    vendors?: string[]
    /** Vendor names opened into their lines ('No vendor' for that row). */
    open?: string[]
    asOf?: string
}

function lineRows(row: VendorLines, section: string): ResultRow[] {
    return row.lines.map(line => ({
        id: `d:${line.id}`,
        kind: 'detail',
        depth: 1,
        label: `${line.date} · ${line.doc} · ${line.description}`,
        section,
        open: line.open,
        cells: { balance: line.net },
    }))
}

function vendorRows(vendorRow: VendorLines, input: ResultInput): ResultRow[] {
    const isOpen = input.open?.includes(vendorRow.name) === true
    const label = vendorLabel(vendorRow)
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
            balance: balanceOf(vendorRow),
        },
        ...(vendorRow.inactive ? { muted: true } : {}),
    }
    return isOpen ? [row, ...lineRows(vendorRow, row.id)] : [row]
}

// `hideEmpty` (a vendor with no line on the day does not show), then the `having` of
// the vendor level, then the Vendor filter.
function shownVendors(input: ResultInput): VendorLines[] {
    const asOf = input.asOf ?? VENDOR_BALANCE_TODAY
    const rows = input.rows ?? 'nonzero'
    const picked = input.vendors
    const all = picked ? vendorLinesOf(asOf) : [...vendorLinesOf(asOf), noVendor(asOf)]
    return all.filter(
        row =>
            row.lines.length > 0 &&
            (rows === 'activity' || balanceOf(row) !== 0) &&
            (!picked || picked.includes(row.name))
    )
}

// Name: vendors by name. Largest balance: by Balance, largest first. No vendor is last
// in both.
function ordered(shown: VendorLines[], order: OrderChoice): VendorLines[] {
    const named = shown.filter(row => row.id !== '').sort(byName)
    const blank = shown.filter(row => row.id === '')
    if (order === 'name') return [...named, ...blank]
    return [...named.sort((a, b) => balanceOf(b) - balanceOf(a)), ...blank]
}

function totalRow(shown: VendorLines[]): ResultRow {
    return {
        id: `total:${JSON.stringify([CURRENCY])}`,
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: { balance: sum(shown.map(balanceOf)) },
    }
}

function resolvedParams(input: ResultInput): ResolvedParam[] {
    const vendors: ResolvedParam = input.vendors
        ? { id: 'vendors', type: 'choice', list: input.vendors.map(name => vendor(name).id) }
        : { id: 'vendors', type: 'choice', unset: true }
    return [
        { id: 'asOf', type: 'asOf', value: input.asOf ?? VENDOR_BALANCE_TODAY },
        { id: 'rows', type: 'choice', value: input.rows ?? 'nonzero' },
        vendors,
        { id: 'order', type: 'choice', value: input.order ?? 'name' },
    ]
}

// The line the Vendor param's `header` prints: the picks' labels joined by ", "; ''
// when unset.
function vendorHeader(input: ResultInput): string {
    if (!input.vendors || input.vendors.length === 0) return ''
    return `Vendor: ${input.vendors.join(', ')}`
}

export function vendorBalanceResult(input: ResultInput = {}): RunResult {
    const shown = ordered(shownVendors(input), input.order ?? 'name')
    return {
        columns: VENDOR_BALANCE_COLUMNS,
        rows: [...shown.flatMap(row => vendorRows(row, input)), totalRow(shown)],
        notices: [],
        headerLines: [vendorHeader(input)],
        topics: [
            'collection/books_journal_lines',
            'collection/books_accounts',
            'collection/books_vendors',
            'collection/books_journal_entries',
            'collection/books_settings',
        ],
        heading: VENDOR_BALANCE_HEADING,
        page: null,
        params: resolvedParams(input),
    }
}

// A run as of a day before any posted line: only the Total row, so the view is empty.
export function emptyVendorBalanceResult(): RunResult {
    return {
        ...vendorBalanceResult({ asOf: VENDOR_BALANCE_EMPTY_DAY }),
        rows: [totalRow([])],
    }
}

// The Vendor filter of the `filtered` state: two vendors, so the chip names both.
export const VENDOR_BALANCE_FILTER_PICK = [
    vendor('Blue Ridge Insurance Agency'),
    vendor('Harbor Freight Logistics'),
]

// The rows the `opened` state opens: a vendor with a bill, a credit, a payment and a
// refund; the vendor with the long name and the long description; and the No vendor row.
export const VENDOR_BALANCE_OPENED = [
    'Harbor Freight Logistics',
    'Willamette Valley Commercial Cleaning and Janitorial Services Cooperative',
    NO_VENDOR_LABEL,
]
