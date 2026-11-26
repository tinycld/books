// Synthetic A/P Aging for the helix reference route (the A/P Aging design spec).
// The vendors are the seeded ones (vendor-form-fixture.ts), so their names and inactive
// marks are typed against the generated `BooksVendors`. The run results are typed against
// core's report contract, so tsc checks every field. Money is integer cents. No client
// collection backs the open items: only the report engine reads `books_payable_items`
// (spec §4.5), so the items are local shapes.
import type { ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type {
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import type { BooksBills } from '../types'
import type { PaymentMethodKey } from './payment-methods'
import type { VendorCreditRecord } from './vendor-credit-form-fixture'
import { VENDORS, type VendorFixtureRecord } from './vendor-form-fixture'

// "Today" for the reference captures: the As of param's default.
export const AP_AGING_TODAY = '2026-11-18'
export const AP_AGING_HEADING = 'Harbor Lane Design LLC'
export const AP_AGING_TITLE = 'A/P Aging'
// The shipped report's description (spec §2).
export const AP_AGING_DESCRIPTION =
    'What you owe each vendor on one day, by how long each open bill is past due.'
// A day before every posted Accounts payable line of the seeded book: the empty report.
export const AP_AGING_EMPTY_DAY = '2020-01-01'
// A past As of day: Bill payment 317, the application of Vendor credit 12 and Vendor
// refund 4 are dated after it, so Bill 1042 and Vendor credit 12 show whole.
export const AP_AGING_PAST_DAY = '2026-10-15'
const CURRENCY = 'USD'
const NO_VENDOR_LABEL = 'No vendor'
const INACTIVE_SUFFIX = ' (inactive)'

function seededVendor(name: string): VendorFixtureRecord {
    const found = VENDORS.find(v => v.display_name === name)
    if (!found) throw new Error(`ap-aging fixture: no seeded vendor ${name}`)
    return found
}

// What the seed adds to the seeded book (spec §4.5 Seed, Q10; seed.ts seedApAging), with
// fixed 2026 dates so the book fills several age columns: one more posted bill that is past
// due, a part payment on that same bill (AP_AGING_SEED.bill), and a vendor credit applied in
// part to it, all of Harbor Freight Logistics. The part payment pays the new bill, not a
// seeded one: Pacific Power's "Seed bill open" keeps its open balance of 420.00, which the
// vendor credit apply fixture and specs read (plan decision D2). 137.25 is no amount of the
// bank statement and bank match fixtures. The bill ends with 602.75 open and the credit with
// 80.00. Cents; an account by its seed account number.
type ApAgingSeedBill = Pick<BooksBills, 'date' | 'due_date' | 'memo' | 'ref_no'> & {
    vendor: string
    accountNumber: string
    cents: number
}
interface ApAgingSeedPayment {
    /** Fixed 15-character ids, as the rows of BILL_PAYMENT_SEED have: the line names the payment in one batch. */
    id: string
    lineId: string
    date: string
    payment_method: PaymentMethodKey
    reference_no: string
    paidFromNumber: string
    cents: number
}
type ApAgingSeedCredit = Pick<VendorCreditRecord, 'date' | 'memo' | 'ref_no'> & {
    vendor: string
    accountNumber: string
    cents: number
    /** The part applied to AP_AGING_SEED.bill, and its day. */
    appliedCents: number
    appliedDate: string
}

export const AP_AGING_SEED = {
    bill: {
        vendor: seededVendor('Harbor Freight Logistics').id,
        date: '2026-08-20',
        due_date: '2026-09-19',
        ref_no: 'HFL-20418',
        memo: 'Seed A/P aging: storage, August',
        accountNumber: '6200',
        cents: 86000,
    } satisfies ApAgingSeedBill,
    partPayment: {
        id: 'apagingpay00001',
        lineId: 'apagingpayln001',
        date: '2026-11-04',
        payment_method: 'check',
        reference_no: '1061',
        paidFromNumber: '1000',
        cents: 13725,
    } satisfies ApAgingSeedPayment,
    credit: {
        vendor: seededVendor('Harbor Freight Logistics').id,
        date: '2026-10-06',
        ref_no: 'HFL-CR-0311',
        memo: 'Seed A/P aging: storage overcharge credit',
        accountNumber: '6200',
        cents: 20000,
        appliedCents: 12000,
        appliedDate: '2026-10-20',
    } satisfies ApAgingSeedCredit,
}

export type OrderChoice = 'name' | 'balance'

// The params as the shipped spec declares them (server/report_ap_aging.go builds the
// same list in Go; its test pins the Go side).
export const AP_AGING_PARAMS: ParamDef[] = [
    { id: 'asOf', type: 'asOf', label: 'As of', default: { preset: 'today' } },
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

// What the view reads of the spec's groups: a vendor and an open item open on a press;
// no level ends in a subtotal row.
export const AP_AGING_GROUPS: { subtotals?: boolean; open: boolean }[] = [
    { open: false },
    { open: false },
]

const AGE_COLUMNS = [
    { id: 'current', label: 'Current' },
    { id: 'd30', label: '1 - 30' },
    { id: 'd60', label: '31 - 60' },
    { id: 'd90', label: '61 - 90' },
    { id: 'd91', label: '91 and over' },
] as const
type AgeColumn = (typeof AGE_COLUMNS)[number]['id']

export const AP_AGING_COLUMNS: ResultColumn[] = [
    {
        id: 'name',
        label: 'Vendor',
        type: 'relation',
        labelCell: 'name@label',
        labelType: 'text',
    },
    { id: 'due', label: 'Due date', type: 'date', aggregate: 'min', blankAbove: true },
    ...AGE_COLUMNS.map(
        (column): ResultColumn => ({
            id: column.id,
            label: column.label,
            type: 'money',
            aggregate: 'sum',
            currency: CURRENCY,
        })
    ),
    { id: 'total', label: 'Total', type: 'money', aggregate: 'sum', currency: CURRENCY },
]

const FIGURE_FIT = { minWidth: 'max-content' } as const

// The display block of the shipped spec: the A/R Aging's (`agingDisplay()`, spec §4.4),
// measured again with this report's rows in phase 3 pass 2 (the helix ledger, Phase
// notes, has the widths). A long name wraps to three lines; no date and no figure is
// cut. Below the one-line width a row wraps onto the tablet arrangement (label and
// Total, then Due date and the five ages on one line) and, where that does not fit,
// onto the phone arrangement (label and Due date; Current, 1 - 30, Total; the three
// later ages). Total always has a value, so the second phone line is on every row and a
// figure's place names its age.
export const AP_AGING_DISPLAY: NonNullable<ReportSpec['display']> = {
    oneLine: { minWidth: '940px' },
    columns: {
        name: { whiteSpace: 'normal', lineClamp: 3 },
        due: FIGURE_FIT,
        current: FIGURE_FIT,
        d30: FIGURE_FIT,
        d60: FIGURE_FIT,
        d90: FIGURE_FIT,
        d91: FIGURE_FIT,
        total: FIGURE_FIT,
    },
    layouts: [
        {
            width: 'mobile',
            tracks: 3,
            cells: [
                { col: 'name', line: 1, span: 2 },
                { col: 'due', line: 1 },
                { col: 'current', line: 2 },
                { col: 'd30', line: 2 },
                { col: 'total', line: 2 },
                { col: 'd60', line: 3 },
                { col: 'd90', line: 3 },
                { col: 'd91', line: 3 },
            ],
        },
        {
            width: 'tablet',
            minWidth: '640px',
            tracks: 12,
            cells: [
                { col: 'name', line: 1, span: 10 },
                { col: 'total', line: 1, span: 2 },
                { col: 'due', line: 2, span: 2 },
                { col: 'current', line: 2, span: 2 },
                { col: 'd30', line: 2, span: 2 },
                { col: 'd60', line: 2, span: 2 },
                { col: 'd90', line: 2, span: 2 },
                { col: 'd91', line: 2, span: 2 },
            ],
        },
    ],
}

type AgingVendor = Pick<VendorFixtureRecord, 'id' | 'display_name' | 'inactive'>

function vendor(name: string): AgingVendor {
    const found = seededVendor(name)
    return {
        id: found.id,
        display_name: found.display_name,
        inactive: found.inactive,
    } satisfies AgingVendor
}

// The `item_kind` values of `books_payable_items` (spec §4.1) and the labels of the
// source's Select field (spec §4.3).
type ItemKind = 'bill' | 'vendor_credit' | 'entry'
const KIND_LABELS: Record<ItemKind, string> = {
    bill: 'Bill',
    vendor_credit: 'Vendor credit',
    entry: 'Journal entry',
}

// One stored row of an open item: a posted Accounts payable line, a bill payment line,
// a vendor refund line, or one side of a vendor credit application.
interface Line {
    id: string
    date: string
    /** "<type> <number>", as lineEntryTypeLabel() and the entry number give it. */
    doc: string
    /** Credit minus debit, in cents: a bill is positive, a payment negative. */
    net: number
    /** The app path the row opens (Books entryOpenPath()). */
    open: string
}

interface Item {
    id: string
    kind: ItemKind
    number: string
    /** A bill's due date; every other item ages from its own date. */
    dueDate: string
    lines: Line[]
}

const pad = (n: number) => String(n).padStart(5, '0')
const billId = (n: number) => `apbill0000${pad(n)}`
const creditId = (n: number) => `apcredit00${pad(n)}`
const billPath = (n: number) => `books/bills/${billId(n)}`
const creditPath = (n: number) => `books/vendor-credits/${creditId(n)}`

// What lowers a bill: a line of a posted bill payment, or a vendor credit applied to it.
type BillPart =
    | { kind: 'payment'; number: number; date: string; cents: number }
    | { kind: 'credit'; number: number; date: string; cents: number }

function billPartLine(bill: number, part: BillPart): Line {
    if (part.kind === 'payment') {
        return {
            id: `apline0pay${pad(part.number)}b${bill}`,
            date: part.date,
            doc: `Bill payment ${part.number}`,
            net: -part.cents,
            open: `books/bill-payments/appayment0${pad(part.number)}`,
        }
    }
    return {
        id: `apline0app${pad(part.number)}b${bill}`,
        date: part.date,
        doc: `Vendor credit ${part.number}`,
        net: -part.cents,
        open: creditPath(part.number),
    }
}

// A bill with the payment lines and the applied credits that lower it; the lines add up
// to its open amount.
function bill(n: number, date: string, dueDate: string, cents: number, parts: BillPart[] = []) {
    const own: Line = {
        id: `apline0bil${pad(n)}`,
        date,
        doc: `Bill ${n}`,
        net: cents,
        open: billPath(n),
    }
    return {
        id: billId(n),
        kind: 'bill',
        number: String(n),
        dueDate,
        lines: [own, ...parts.map(part => billPartLine(n, part))],
    } satisfies Item
}

// What uses up a vendor credit: its application to a bill, or a line of a posted vendor
// refund.
type CreditPart =
    | { kind: 'bill'; number: number; date: string; cents: number }
    | { kind: 'refund'; number: number; date: string; cents: number }

function creditPartLine(credit: number, part: CreditPart): Line {
    if (part.kind === 'bill') {
        return {
            id: `apline0app${pad(credit)}c${part.number}`,
            date: part.date,
            doc: `Bill ${part.number}`,
            net: part.cents,
            open: billPath(part.number),
        }
    }
    return {
        id: `apline0ref${pad(part.number)}c${credit}`,
        date: part.date,
        doc: `Vendor refund ${part.number}`,
        net: part.cents,
        open: `books/vendor-refunds/aprefund00${pad(part.number)}`,
    }
}

// A vendor credit: a negative item that ages from its own date.
function vendorCredit(n: number, date: string, cents: number, parts: CreditPart[] = []) {
    const own: Line = {
        id: `apline00vc${pad(n)}`,
        date,
        doc: `Vendor credit ${n}`,
        net: -cents,
        open: creditPath(n),
    }
    return {
        id: creditId(n),
        kind: 'vendor_credit',
        number: String(n),
        dueDate: date,
        lines: [own, ...parts.map(part => creditPartLine(n, part))],
    } satisfies Item
}

function journal(n: number, date: string, net: number) {
    const own: Line = {
        id: `apline00je${pad(n)}`,
        date,
        doc: `Journal entry JE-${n}`,
        net,
        open: `books/entries/apentry000${pad(n)}`,
    }
    return {
        id: own.id,
        kind: 'entry',
        number: `JE-${n}`,
        dueDate: date,
        lines: [own],
    } satisfies Item
}

// The open items per vendor. As of 2026-11-18 the edges are: an age of 0 (Summit IT
// Services, due on the day: Current), of 1 (Brightwave Marketing), of 30 and 31 (Office
// Supply World, Pacific Power), of 90 and 91 (Jamal Okafor, Keystone Legal Group); a
// part payment (Blue Ridge Insurance Agency, Harbor Freight Logistics, Willamette
// Valley); one payment of two bills (Office Supply World, Bill payment 321); a payment,
// an application and a refund dated after a past As of day (Harbor Freight Logistics);
// a paid bill and so a vendor that does not show (Northwest Paper Co.); a vendor whose
// only item is a credit, so its Total is negative (Cascade Fuel & Fleet); a credit with
// no application beside a bill (Greenline Landscaping); a credit applied in part and
// refunded in part (Harbor Freight Logistics, Vendor credit 12); a journal entry line
// with a vendor (Rivera Accounting Partners, Willamette Valley) and with none; an
// inactive vendor (Coastal Coffee Roasters); a long name and a six-figure amount
// (Willamette Valley).
const ITEMS: Record<string, Item[]> = {
    'Blue Ridge Insurance Agency': [
        bill(1031, '2026-08-04', '2026-09-03', 180000, [
            { kind: 'payment', number: 302, date: '2026-08-28', cents: 100000 },
        ]),
        bill(1049, '2026-10-31', '2026-11-30', 95000),
    ],
    'Brightwave Marketing': [bill(1052, '2026-11-02', '2026-11-17', 127500)],
    'Cascade Fuel & Fleet': [vendorCredit(9, '2026-09-22', 32000)],
    'Coastal Coffee Roasters': [bill(1019, '2026-02-10', '2026-03-12', 64000)],
    'Greenline Landscaping': [
        bill(1050, '2026-10-15', '2026-11-14', 184000),
        vendorCredit(3, '2026-10-20', 63500),
    ],
    'Harbor Freight Logistics': [
        bill(1042, '2026-10-01', '2026-10-31', 200000, [
            { kind: 'payment', number: 317, date: '2026-11-03', cents: 80000 },
            { kind: 'credit', number: 12, date: '2026-11-05', cents: 15000 },
        ]),
        vendorCredit(12, '2026-10-02', 40000, [
            { kind: 'bill', number: 1042, date: '2026-11-05', cents: 15000 },
            { kind: 'refund', number: 4, date: '2026-11-09', cents: 10000 },
        ]),
        bill(1051, '2026-11-05', '2026-12-05', 40000),
    ],
    'Jamal Okafor': [
        bill(1038, '2026-07-21', '2026-08-20', 146000),
        bill(1055, '2026-11-06', '2026-11-21', 85000),
    ],
    'Keystone Legal Group': [bill(1036, '2026-07-20', '2026-08-19', 320000)],
    'Northwest Paper Co.': [
        bill(1027, '2026-07-15', '2026-08-14', 96000, [
            { kind: 'payment', number: 297, date: '2026-08-11', cents: 96000 },
        ]),
    ],
    'Office Supply World': [
        bill(1047, '2026-09-19', '2026-10-19', 115000, [
            { kind: 'payment', number: 321, date: '2026-11-12', cents: 15000 },
        ]),
        bill(1053, '2026-11-10', '2026-12-10', 420000, [
            { kind: 'payment', number: 321, date: '2026-11-12', cents: 120000 },
        ]),
    ],
    'Pacific Power': [bill(1041, '2026-09-18', '2026-10-18', 280000)],
    'Rivera Accounting Partners': [journal(12, '2026-09-01', 31000)],
    'Summit IT Services': [bill(1054, '2026-11-03', '2026-11-18', 9500)],
    'Willamette Valley Commercial Cleaning and Janitorial Services Cooperative': [
        journal(41, '2026-01-01', 500000),
        bill(1029, '2026-07-22', '2026-08-21', 987525, [
            { kind: 'payment', number: 305, date: '2026-09-04', cents: 300000 },
        ]),
        bill(1046, '2026-10-02', '2026-11-01', 11824000),
    ],
}

// Accounts payable lines that name no vendor.
const NO_VENDOR_ITEMS: Item[] = [journal(2, '2026-11-01', 7500)]

const sum = (values: number[]) => values.reduce((a, v) => a + v, 0)

const DAY_MS = 86_400_000
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY_MS

// Core `diffDays(due_date, asOf)`: the days from the due date to the As of day.
const ageOn = (dueDate: string, asOf: string) => Math.round(dayNumber(asOf) - dayNumber(dueDate))

function ageColumn(age: number): AgeColumn {
    if (age <= 0) return 'current'
    if (age <= 30) return 'd30'
    if (age <= 60) return 'd60'
    if (age <= 90) return 'd90'
    return 'd91'
}

// An item as it is open on the As of day: the lines dated on or before the day.
interface OpenItem {
    item: Item
    lines: Line[]
    net: number
    column: AgeColumn
}

function openOn(item: Item, asOf: string): OpenItem {
    const lines = item.lines.filter(line => line.date <= asOf)
    return {
        item,
        lines,
        net: sum(lines.map(line => line.net)),
        column: ageColumn(ageOn(item.dueDate, asOf)),
    }
}

// Due-date order, oldest first, then by number.
function byDueDate(a: OpenItem, b: OpenItem) {
    if (a.item.dueDate !== b.item.dueDate) return a.item.dueDate < b.item.dueDate ? -1 : 1
    return a.item.number.localeCompare(b.item.number, undefined, { numeric: true })
}

// The `having` of the item level: an item whose amount on the day is zero does not show.
function openItems(items: Item[], asOf: string): OpenItem[] {
    return items
        .map(item => openOn(item, asOf))
        .filter(open => open.lines.length > 0 && open.net !== 0)
        .sort(byDueDate)
}

interface VendorRows {
    /** '' for the No vendor row. */
    id: string
    name: string
    inactive: boolean
    items: OpenItem[]
}

const byName = (a: { name: string }, b: { name: string }) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())

function vendorRowsOf(asOf: string): VendorRows[] {
    return Object.keys(ITEMS).map(name => {
        const v = vendor(name)
        return {
            id: v.id,
            name: v.display_name,
            inactive: v.inactive === true,
            items: openItems(ITEMS[name] ?? [], asOf),
        }
    })
}

function noVendor(asOf: string): VendorRows {
    return {
        id: '',
        name: NO_VENDOR_LABEL,
        inactive: false,
        items: openItems(NO_VENDOR_ITEMS, asOf),
    }
}

const totalOf = (items: OpenItem[]) => sum(items.map(open => open.net))

// The five age cells and Total of a row over these items. An age with no money is
// blank (Books blankZero()); Total always shows a figure.
function figureCells(items: OpenItem[]): Record<string, number | null> {
    const ages = AGE_COLUMNS.map(column => {
        const cents = totalOf(items.filter(open => open.column === column.id))
        return [column.id, cents === 0 ? null : cents] as const
    })
    return { ...Object.fromEntries(ages), total: totalOf(items) }
}

const groupId = (key: string[]) => `g:${JSON.stringify([...key, CURRENCY])}`

const vendorLabel = (row: VendorRows) => (row.inactive ? `${row.name}${INACTIVE_SUFFIX}` : row.name)

const itemLabel = (item: Item) => `${KIND_LABELS[item.kind]} ${item.number}`

interface ResultInput {
    order?: OrderChoice
    /** Vendor names the Vendor filter keeps; with it the No vendor row is not shown. */
    vendors?: string[]
    /** Vendor names opened into their open items. */
    open?: string[]
    /** Item labels ("Bill 1042") opened into their lines. */
    openItems?: string[]
    asOf?: string
}

// The lines of an open item: each in the item's age column and in Total.
function lineRows(open: OpenItem, section: string): ResultRow[] {
    return open.lines.map(line => ({
        id: `d:${line.id}`,
        kind: 'detail',
        depth: 2,
        label: `${line.date} · ${line.doc}`,
        section,
        open: line.open,
        cells: { [open.column]: line.net, total: line.net },
    }))
}

function itemRows(open: OpenItem, vendorId: string, input: ResultInput): ResultRow[] {
    const label = itemLabel(open.item)
    const isOpen = input.openItems?.includes(label) === true
    const key = [vendorId, open.item.id]
    const row: ResultRow = {
        id: groupId(key),
        kind: 'group',
        depth: 1,
        level: 2,
        label,
        section: groupId([vendorId]),
        groupKey: [...key, CURRENCY],
        expanded: isOpen,
        canExpand: true,
        cells: { due: open.item.dueDate, [open.column]: open.net, total: open.net },
    }
    return isOpen ? [row, ...lineRows(open, row.id)] : [row]
}

function vendorRows(vendorRow: VendorRows, input: ResultInput): ResultRow[] {
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
            ...figureCells(vendorRow.items),
        },
        ...(vendorRow.inactive ? { muted: true } : {}),
    }
    if (!isOpen) return [row]
    return [row, ...vendorRow.items.flatMap(open => itemRows(open, vendorRow.id, input))]
}

// `hideEmpty`: a vendor with no open item on the day does not show.
function shownVendors(input: ResultInput): VendorRows[] {
    const asOf = input.asOf ?? AP_AGING_TODAY
    const picked = input.vendors
    const all = picked ? vendorRowsOf(asOf) : [...vendorRowsOf(asOf), noVendor(asOf)]
    return all.filter(row => row.items.length > 0 && (!picked || picked.includes(row.name)))
}

// Name: vendors by name. Largest balance: by Total, largest first. No vendor is last in
// both.
function ordered(shown: VendorRows[], order: OrderChoice): VendorRows[] {
    const named = shown.filter(row => row.id !== '').sort(byName)
    const blank = shown.filter(row => row.id === '')
    if (order === 'name') return [...named, ...blank]
    return [...named.sort((a, b) => totalOf(b.items) - totalOf(a.items)), ...blank]
}

function totalRow(shown: VendorRows[]): ResultRow {
    return {
        id: `total:${JSON.stringify([CURRENCY])}`,
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: figureCells(shown.flatMap(row => row.items)),
    }
}

function resolvedParams(input: ResultInput): ResolvedParam[] {
    const vendors: ResolvedParam = input.vendors
        ? { id: 'vendors', type: 'choice', list: input.vendors.map(name => vendor(name).id) }
        : { id: 'vendors', type: 'choice', unset: true }
    return [
        { id: 'asOf', type: 'asOf', value: input.asOf ?? AP_AGING_TODAY },
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

export function apAgingResult(input: ResultInput = {}): RunResult {
    const shown = ordered(shownVendors(input), input.order ?? 'name')
    return {
        columns: AP_AGING_COLUMNS,
        rows: [...shown.flatMap(row => vendorRows(row, input)), totalRow(shown)],
        notices: [],
        headerLines: [vendorHeader(input)],
        topics: [
            'collection/books_payable_items',
            'collection/books_vendors',
            'collection/books_settings',
        ],
        heading: AP_AGING_HEADING,
        page: null,
        params: resolvedParams(input),
    }
}

// A run as of a day before any posted line: only the Total row, so the view is empty.
export function emptyApAgingResult(): RunResult {
    return {
        ...apAgingResult({ asOf: AP_AGING_EMPTY_DAY }),
        rows: [totalRow([])],
    }
}

// The Vendor filter of the `filtered` state: two vendors, so the chip names both.
export const AP_AGING_FILTER_PICK = [
    vendor('Blue Ridge Insurance Agency'),
    vendor('Harbor Freight Logistics'),
]

// The rows the `opened` and `item-opened` states open: a vendor with a part-paid bill
// and a credit applied and refunded in part, and a vendor with a bill and a credit. The
// `item-opened` state opens the bill and the credit that name each other.
export const AP_AGING_OPENED = {
    vendors: ['Greenline Landscaping', 'Harbor Freight Logistics'],
    items: ['Bill 1042', 'Vendor credit 12'],
}
