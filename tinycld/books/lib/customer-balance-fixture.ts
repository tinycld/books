// Synthetic Customer Balance for the helix reference route. The customers are the
// seeded ones (customer-form-fixture.ts), so their names, parents and inactive marks
// are typed against the generated `BooksCustomers`. The run results are typed against
// core's report contract, so tsc checks every field. Money is integer cents.
import type { ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type {
    ParamOptionsPage,
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import type { BooksCustomers } from '../types'
import { CUSTOMER_IDS, CUSTOMERS } from './customer-form-fixture'

// "Today" for the reference captures: the As of param's default.
export const CUSTOMER_BALANCE_TODAY = '2026-11-16'
export const CUSTOMER_BALANCE_HEADING = 'Harbor Lane Design LLC'
export const CUSTOMER_BALANCE_TITLE = 'Customer Balance'
// The shipped report's description (server/report_customer_balance.go).
export const CUSTOMER_BALANCE_DESCRIPTION =
    'What each customer owes on one day, from posted transactions on Accounts receivable accounts.'

// What seedCustomerBalance (seed.ts) posts in the seeded book (plan D2): an invoice for
// the sub-customer Harborview Kitchen, an invoice for the long-named St. Jude gala (a
// three-line name and label on a phone), an Accounts receivable entry that names no
// customer, and one that names the inactive Old Mill Bakery (a muted row). Cents.
export const CUSTOMER_BALANCE_SEED = {
    kitchenInvoice: {
        customer: CUSTOMER_IDS.harborviewKitchen,
        date: '2026-10-27',
        memo: 'Seed customer balance: table tents and takeaway menus',
        cents: 80000,
    },
    galaInvoice: {
        customer: CUSTOMER_IDS.stJudeGala,
        date: '2026-10-22',
        memo: 'Seed customer balance: programs, bid sheets, table numbers and sponsor boards for the Annual Spring Gala',
        cents: 987525,
    },
    noCustomerEntry: {
        date: '2026-10-05',
        memo: 'Seed customer balance: receivable with no customer',
        cents: 100000,
    },
    inactiveEntry: {
        customer: CUSTOMER_IDS.oldMill,
        date: '2026-10-08',
        memo: 'Seed customer balance: holiday box labels',
        cents: 48000,
    },
} as const
// A day before every posted Accounts receivable line: the empty report.
export const CUSTOMER_BALANCE_EMPTY_DAY = '2025-12-31'
const CURRENCY = 'USD'
const NO_CUSTOMER_LABEL = 'No customer'
const INACTIVE_SUFFIX = ' (inactive)'

export type RowsChoice = 'nonzero' | 'activity'
export type OrderChoice = 'name' | 'balance'

// The params as the shipped spec declares them (server/report_customer_balance.go
// builds the same list in Go; its test pins the Go side).
export const CUSTOMER_BALANCE_PARAMS: ParamDef[] = [
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
        id: 'customers',
        type: 'choice',
        label: 'Customer',
        multiple: true,
        optionsFrom: {
            source: 'books.customers',
            value: [{ field: 'id' }],
            label: [{ field: 'display_name' }],
            group: [{ link: 'parent' }, { field: 'display_name' }],
            groupLabel: 'All {group} sub-customers',
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

// What the view reads of the spec: the family level ends in "Total <parent>", and a
// long name wraps while a figure is never cut.
export const CUSTOMER_BALANCE_GROUPS = [{ subtotals: true, open: true }, { open: false }]
export const CUSTOMER_BALANCE_DISPLAY: NonNullable<ReportSpec['display']> = {
    columns: {
        name: { whiteSpace: 'normal', lineClamp: 3 },
        balance: { minWidth: 'max-content' },
    },
}

export const CUSTOMER_BALANCE_COLUMNS: ResultColumn[] = [
    {
        id: 'name',
        label: 'Customer',
        type: 'relation',
        labelCell: 'name@label',
        labelType: 'text',
    },
    { id: 'balance', label: 'Balance', type: 'money', aggregate: 'sum', currency: CURRENCY },
]

type BalanceCustomer = Pick<BooksCustomers, 'id' | 'display_name' | 'parent' | 'inactive'>

function customer(name: string): BalanceCustomer {
    const found = CUSTOMERS.find(c => c.display_name === name)
    if (!found) throw new Error(`customer-balance fixture: no seeded customer ${name}`)
    return {
        id: found.id,
        display_name: found.display_name,
        parent: found.parent,
        inactive: found.inactive,
    } satisfies BalanceCustomer
}

interface Line {
    id: string
    date: string
    /** "<type> <number>", as lineEntryTypeLabel() and the entry number give it. */
    doc: string
    description: string
    /** Debit minus credit, in cents: an invoice is positive, a payment negative. */
    net: number
    /** The app path the row opens (Books entryOpenPath()). */
    open: string
}

const invoice = (n: number, date: string, description: string, net: number): Line => ({
    id: `cbline0inv${String(n).padStart(5, '0')}`,
    date,
    doc: `Invoice ${n}`,
    description,
    net,
    open: `books/invoices/cbinvoice0${String(n).padStart(5, '0')}`,
})

const payment = (n: number, date: string, description: string, received: number): Line => ({
    id: `cbline0pay${String(n).padStart(5, '0')}`,
    date,
    doc: `Payment ${n}`,
    description,
    net: -received,
    open: `books/payments/cbpayment0${String(n).padStart(5, '0')}`,
})

const journal = (n: number, date: string, description: string, net: number): Line => ({
    id: `cbline00je${String(n).padStart(5, '0')}`,
    date,
    doc: `Journal entry JE-${n}`,
    description,
    net,
    open: `books/entries/cbentry000${String(n).padStart(5, '0')}`,
})

// Posted Accounts receivable lines per customer, in date order then posting order.
// The edges: a part payment (Aspen Ridge Dental), an overpayment that leaves a credit
// balance (Bluefin Marine Supply, Northwind Seattle warehouse), a paid-off customer
// (Delta Freight Partners) and a parent whose own lines net to zero (Northwind
// Traders), both shown only under Rows = With activity; a parent with its own balance
// and two sub-customers (Harborview); a sub-customer whose parent has no line (Alvarez
// kitchen remodel); an inactive customer alone (Old Mill Bakery) and inside a family
// (Northwind Boise); long names (St. Jude); a line after the day is not in the run.
const LINES: Record<string, Line[]> = {
    'Aspen Ridge Dental': [
        invoice(1031, '2026-08-04', 'Waiting room signage', 180000),
        payment(302, '2026-08-28', 'Check 4471', 100000),
        invoice(1049, '2026-10-12', 'Patient brochure set, second print run', 165000),
    ],
    'Bluefin Marine Supply': [
        invoice(1036, '2026-08-19', 'Catalog photography', 240000),
        payment(309, '2026-09-22', 'ACH, paid twice in error', 272000),
    ],
    'Cedar & Pine Landscaping': [invoice(1044, '2026-09-30', 'Truck wrap design', 127550)],
    'Delta Freight Partners': [
        invoice(1027, '2026-07-15', 'Fleet decal artwork', 96000),
        payment(297, '2026-08-11', 'Wire', 96000),
    ],
    'Harborview Hospitality Group': [
        invoice(1024, '2026-07-02', 'Brand guidelines', 650000),
        payment(295, '2026-07-31', 'ACH', 650000),
        invoice(1052, '2026-10-20', 'Annual report layout', 420000),
    ],
    'Harborview Events': [invoice(1047, '2026-10-06', 'Wedding showcase invitations', 115000)],
    'Harborview Kitchen': [
        invoice(1041, '2026-09-14', 'Menu redesign, autumn', 280000),
        invoice(1055, '2026-10-27', 'Table tents and takeaway menus', 80000),
    ],
    'Alvarez kitchen remodel': [
        invoice(1050, '2026-10-15', 'Kitchen elevations and cabinet drawings', 184000),
    ],
    'Northwind Traders': [
        invoice(1022, '2026-06-18', 'Trade show banner', 54000),
        payment(293, '2026-07-09', 'Check 20981', 54000),
    ],
    'Northwind Boise (closed)': [invoice(1019, '2026-02-10', 'Closing sale flyers', 64000)],
    'Northwind Portland store': [
        invoice(1038, '2026-08-26', 'Storefront window graphics', 146000),
        invoice(1053, '2026-10-22', 'Holiday price cards', 85000),
    ],
    'Northwind Seattle warehouse': [
        invoice(1034, '2026-08-12', 'Dock safety posters', 45000),
        payment(311, '2026-09-29', 'Check 21544, over by 150.00', 60000),
    ],
    'Old Mill Bakery': [invoice(1008, '2025-11-21', 'Holiday box labels', 48000)],
    'St. Jude Community Hospital Foundation of the Greater Willamette Valley': [
        journal(
            41,
            '2026-01-01',
            'Opening balance carried from the previous bookkeeping system, pledge year 2025',
            500000
        ),
        invoice(1043, '2026-09-25', 'Donor wall concept and renderings', 750000),
    ],
    'St. Jude Annual Spring Gala and Silent Auction Catering': [
        invoice(
            1029,
            '2026-07-22',
            'Programs, bid sheets, table numbers and sponsor boards for the Annual Spring Gala',
            987525
        ),
        payment(305, '2026-09-04', 'Check 118204', 300000),
    ],
    'St. Jude West Annex renovation': [
        invoice(1046, '2026-10-02', 'Wayfinding system, phase 1', 1824000),
    ],
    'Wei Chen': [invoice(1054, '2026-10-24', 'Business cards', 9500)],
}

// Accounts receivable lines that name no customer.
const NO_CUSTOMER_LINES: Line[] = [
    journal(2, '2026-01-01', 'Opening balance, Accounts receivable', 100000),
]

interface Member {
    /** '' for the No customer row. */
    id: string
    name: string
    inactive: boolean
    lines: Line[]
}

interface Family {
    /** The parent's id, or the customer's own when it has no parent. */
    id: string
    name: string
    /** The family's customers that have lines: the parent first, then name order. */
    members: Member[]
}

const byName = (a: { name: string }, b: { name: string }) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())

function memberOf(c: BalanceCustomer): Member {
    return {
        id: c.id,
        name: c.display_name,
        inactive: c.inactive === true,
        lines: LINES[c.display_name] ?? [],
    }
}

function families(): Family[] {
    const all = Object.keys(LINES).map(customer)
    const topIds = [...new Set(all.map(c => c.parent || c.id))]
    return topIds.map(topId => {
        const top = CUSTOMERS.find(c => c.id === topId)
        if (!top) throw new Error(`customer-balance fixture: no seeded customer ${topId}`)
        const own = all.filter(c => c.id === topId).map(memberOf)
        const subs = all
            .filter(c => c.parent === topId)
            .map(memberOf)
            .sort(byName)
        return { id: topId, name: top.display_name, members: [...own, ...subs] }
    })
}

const NO_CUSTOMER: Family = {
    id: '',
    name: NO_CUSTOMER_LABEL,
    members: [{ id: '', name: NO_CUSTOMER_LABEL, inactive: false, lines: NO_CUSTOMER_LINES }],
}

const sum = (values: number[]) => values.reduce((a, v) => a + v, 0)
const balanceOf = (member: Member) => sum(member.lines.map(line => line.net))
const familyTotal = (family: Family) => sum(family.members.map(balanceOf))

// The spec's `inline` condition (core R1): no line of the family names a sub-customer.
const isInlined = (family: Family) => family.members.every(member => member.id === family.id)

const groupId = (key: string[]) => `g:${JSON.stringify([...key, CURRENCY])}`

const memberLabel = (member: Member) =>
    member.inactive ? `${member.name}${INACTIVE_SUFFIX}` : member.name

function lineRows(member: Member, section: string, depth: number): ResultRow[] {
    return member.lines.map(line => ({
        id: `d:${line.id}`,
        kind: 'detail',
        depth,
        label: `${line.date} · ${line.doc} · ${line.description}`,
        section,
        open: line.open,
        cells: { balance: line.net },
    }))
}

interface ResultInput {
    rows?: RowsChoice
    order?: OrderChoice
    /** Customer names the Customer filter keeps; with it the No customer row is not shown. */
    customers?: string[]
    /** Whole groups the Customer filter picked, by the parent's name. */
    groups?: string[]
    /** Customer names opened into their lines. */
    open?: string[]
    /** Family names folded. */
    folded?: string[]
    asOf?: string
}

function memberRows(
    member: Member,
    family: Family,
    depth: number,
    input: ResultInput
): ResultRow[] {
    const key = [family.id, member.id]
    const isOpen = input.open?.includes(member.name) === true
    const section = depth === 0 ? {} : { section: groupId([family.id]) }
    const label = memberLabel(member)
    const row: ResultRow = {
        id: groupId(key),
        kind: 'group',
        depth,
        level: 2,
        label,
        ...section,
        groupKey: [...key, CURRENCY],
        expanded: isOpen,
        canExpand: true,
        cells: { name: member.id || null, 'name@label': label, balance: balanceOf(member) },
        ...(member.inactive ? { muted: true } : {}),
    }
    return isOpen ? [row, ...lineRows(member, row.id, depth + 1)] : [row]
}

function familyRows(family: Family, input: ResultInput): ResultRow[] {
    if (isInlined(family)) return family.members.flatMap(m => memberRows(m, family, 0, input))
    const isFolded = input.folded?.includes(family.name) === true
    const total = familyTotal(family)
    const header: ResultRow = {
        id: groupId([family.id]),
        kind: 'group',
        depth: 0,
        level: 1,
        label: family.name,
        groupKey: [family.id, CURRENCY],
        expanded: !isFolded,
        canExpand: true,
        cells: { balance: total },
    }
    if (isFolded) return [header]
    return [
        header,
        ...family.members.flatMap(m => memberRows(m, family, 1, input)),
        {
            id: `s:${JSON.stringify([family.id, CURRENCY])}`,
            kind: 'subtotal',
            depth: 0,
            level: 1,
            label: `Total ${family.name}`,
            section: header.id,
            cells: { balance: total },
        },
    ]
}

// The `having` of the customer level, then `hideEmpty` of the family level.
function shownFamilies(input: ResultInput): Family[] {
    const rows = input.rows ?? 'nonzero'
    const picked = input.customers
    const keep = (member: Member) =>
        (rows === 'activity' || balanceOf(member) !== 0) &&
        (!picked || picked.includes(member.name))
    const all = picked ? families() : [...families(), NO_CUSTOMER]
    return all
        .map(family => ({ ...family, members: family.members.filter(keep) }))
        .filter(family => family.members.length > 0)
}

// Name: families by name, No customer last. Largest balance: families by their total
// and the sub-customers of a family by their balance, largest first.
function ordered(shown: Family[], order: OrderChoice): Family[] {
    const named = shown.filter(family => family.id !== '').sort(byName)
    const blank = shown.filter(family => family.id === '')
    if (order === 'name') return [...named, ...blank]
    const byBalance = (a: Member, b: Member) => balanceOf(b) - balanceOf(a)
    return [...named, ...blank]
        .sort((a, b) => familyTotal(b) - familyTotal(a))
        .map(family => ({
            ...family,
            members: [
                ...family.members.filter(m => m.id === family.id),
                ...family.members.filter(m => m.id !== family.id).sort(byBalance),
            ],
        }))
}

function totalRow(shown: Family[]): ResultRow {
    return {
        id: `total:${JSON.stringify([CURRENCY])}`,
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: { balance: sum(shown.map(familyTotal)) },
    }
}

function resolvedParams(input: ResultInput): ResolvedParam[] {
    const customers: ResolvedParam = input.customers
        ? {
              id: 'customers',
              type: 'choice',
              list: input.customers.map(name => customer(name).id),
              ...(input.groups ? { groups: input.groups } : {}),
          }
        : { id: 'customers', type: 'choice', unset: true }
    return [
        { id: 'asOf', type: 'asOf', value: input.asOf ?? CUSTOMER_BALANCE_TODAY },
        { id: 'rows', type: 'choice', value: input.rows ?? 'nonzero' },
        customers,
        { id: 'order', type: 'choice', value: input.order ?? 'name' },
    ]
}

export function customerBalanceResult(input: ResultInput = {}): RunResult {
    const shown = ordered(shownFamilies(input), input.order ?? 'name')
    return {
        columns: CUSTOMER_BALANCE_COLUMNS,
        rows: [...shown.flatMap(family => familyRows(family, input)), totalRow(shown)],
        notices: [],
        headerLines: [],
        topics: [
            'collection/books_journal_lines',
            'collection/books_accounts',
            'collection/books_customers',
            'collection/books_journal_entries',
            'collection/books_settings',
        ],
        heading: CUSTOMER_BALANCE_HEADING,
        page: null,
        params: resolvedParams(input),
    }
}

// A run as of a day before any posted line: only the Total row, so the view is empty.
export function emptyCustomerBalanceResult(): RunResult {
    return {
        ...customerBalanceResult({ asOf: CUSTOMER_BALANCE_EMPTY_DAY }),
        rows: [totalRow([])],
    }
}

// The Customer filter of the `filtered` state: one customer, and every sub-customer
// of Harborview Hospitality Group (the whole-group pick), which leaves the parent's
// own balance out of its family.
export const FILTER_PICK = {
    customer: customer('Aspen Ridge Dental'),
    group: 'Harborview Hospitality Group',
    groupMembers: ['Harborview Events', 'Harborview Kitchen'],
}

// The Customer picker's first page, as POST /api/reports/param-options answers it:
// every customer, inactive ones included; a sub-customer is in its parent's group.
const parentName = (c: { parent: string }) =>
    CUSTOMERS.find(p => p.id === c.parent)?.display_name ?? ''

export const CUSTOMER_OPTIONS_PAGE: ParamOptionsPage = {
    options: CUSTOMERS.map(c => ({
        value: c.id,
        label: c.display_name,
        group: parentName(c),
    })).sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase())),
    groups: [...new Set(CUSTOMERS.filter(c => c.parent).map(parentName))]
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
        .map(name => ({ value: name, label: name })),
}
