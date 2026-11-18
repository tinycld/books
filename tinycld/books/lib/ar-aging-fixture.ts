// Synthetic A/R Aging for the helix reference route (docs/specs/ar-aging-design.md).
// The customers are the seeded ones (customer-form-fixture.ts), so their names, parents
// and inactive marks are typed against the generated `BooksCustomers`. The run results
// are typed against core's report contract, so tsc checks every field. Money is integer
// cents. No collection backs the open items: the report reads two view collections
// that only the report engine reads (spec §4, §8), so the items are local shapes.
import type { ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type {
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import type { BooksCustomers, BooksInvoices, BooksPayments } from '../types'
import { CUSTOMERS } from './customer-form-fixture'

// "Today" for the reference captures: the As of param's default.
export const AR_AGING_TODAY = '2026-11-18'
export const AR_AGING_HEADING = 'Harbor Lane Design LLC'
export const AR_AGING_TITLE = 'A/R Aging'
// The shipped report's description (server/report_ar_aging.go).
export const AR_AGING_DESCRIPTION =
    'What each customer owes on one day, by how long each open invoice is past due.'
// A day before every posted Accounts receivable line of the seeded book, which has one
// two years back (PRIOR_YEAR_SEED, trial-balance-fixture.ts): the empty report.
export const AR_AGING_EMPTY_DAY = '2020-01-01'
const CURRENCY = 'USD'
const NO_CUSTOMER_LABEL = 'No customer'
const INACTIVE_SUFFIX = ' (inactive)'

// What the seed adds to the seeded book (spec §4 Seed, Q16), with fixed 2026 dates so
// the book fills several age columns: a part payment on the seeded gala invoice
// (customer-balance-fixture.ts `galaInvoice`), one payment applied to no invoice, and
// one more posted invoice that is long past due. seedArAging (seed.ts) sends these: a
// customer by its display name in CUSTOMERS, a payment's deposit account by its number
// (as PAYMENT_SEED). Cents.
type ArAgingSeedPayment = Pick<
    BooksPayments,
    'date' | 'memo' | 'payment_method' | 'reference_no'
> & { customer: string; cents: number; depositNumber: string }
type ArAgingSeedInvoice = Pick<BooksInvoices, 'date' | 'due_date' | 'memo'> & {
    customer: string
    cents: number
}

export const AR_AGING_SEED = {
    partPayment: {
        customer: 'St. Jude Annual Spring Gala and Silent Auction Catering',
        date: '2026-11-05',
        memo: 'Seed A/R aging: check 118204, part payment',
        payment_method: 'check',
        reference_no: '118204',
        depositNumber: '1200',
        cents: 300000,
    } satisfies ArAgingSeedPayment,
    unappliedPayment: {
        customer: 'Cedar & Pine Landscaping',
        date: '2026-10-02',
        memo: 'Seed A/R aging: deposit, not yet applied',
        payment_method: 'check',
        reference_no: 'DEP-0932',
        depositNumber: '1200',
        cents: 15000,
    } satisfies ArAgingSeedPayment,
    invoice: {
        customer: 'Aspen Ridge Dental',
        date: '2026-08-04',
        due_date: '2026-09-03',
        memo: 'Seed A/R aging: waiting room signage',
        cents: 180000,
    } satisfies ArAgingSeedInvoice,
}

export type OrderChoice = 'name' | 'balance'

// The params as the shipped spec declares them (server/report_ar_aging.go builds the
// same list in Go; its test pins the Go side).
export const AR_AGING_PARAMS: ParamDef[] = [
    { id: 'asOf', type: 'asOf', label: 'As of', default: { preset: 'today' } },
    {
        id: 'customers',
        type: 'choice',
        label: 'Customer',
        multiple: true,
        header: 'Customer: {label}',
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

// What the view reads of the spec's groups: the family level ends in "Total <parent>"
// and opens with the report; a customer and an open item open on a press.
export const AR_AGING_GROUPS = [{ subtotals: true, open: true }, { open: false }, { open: false }]

const AGE_COLUMNS = [
    { id: 'current', label: 'Current' },
    { id: 'd30', label: '1 - 30' },
    { id: 'd60', label: '31 - 60' },
    { id: 'd90', label: '61 - 90' },
    { id: 'd91', label: '91 and over' },
] as const
type AgeColumn = (typeof AGE_COLUMNS)[number]['id']

export const AR_AGING_COLUMNS: ResultColumn[] = [
    {
        id: 'name',
        label: 'Customer',
        type: 'relation',
        labelCell: 'name@label',
        labelType: 'text',
    },
    { id: 'due', label: 'Due date', type: 'date', aggregate: 'min' },
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

// The phone arrangement of the shipped spec (human, 2026-11-18, finding F1 of the helix
// ledger): Total is on the first figures line. Core draws a group row with only the
// lines it has a value on, and Total always has one, so that line is on every row and a
// figure's place always names its age.
export const AR_AGING_ANCHORED_PHONE_LAYOUT: NonNullable<
    NonNullable<ReportSpec['display']>['layouts']
>[number] = {
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
}

// The display block of the shipped spec, measured in phase 3 pass 2 (the helix ledger,
// Phase notes, has the widths). A long name wraps to three lines; no date and no figure
// is cut. Below the one-line width a row wraps onto the tablet arrangement (label and
// Total, then Due date and the five ages on one line) and, where that does not fit,
// onto the phone arrangement (at most three figures a line).
export const AR_AGING_DISPLAY: NonNullable<ReportSpec['display']> = {
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
        AR_AGING_ANCHORED_PHONE_LAYOUT,
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

type AgingCustomer = Pick<BooksCustomers, 'id' | 'display_name' | 'parent' | 'inactive'>

function customer(name: string): AgingCustomer {
    const found = CUSTOMERS.find(c => c.display_name === name)
    if (!found) throw new Error(`ar-aging fixture: no seeded customer ${name}`)
    return {
        id: found.id,
        display_name: found.display_name,
        parent: found.parent,
        inactive: found.inactive,
    } satisfies AgingCustomer
}

// The `item_kind` values of the two views (spec §4) and the labels of the source's
// Select field.
type ItemKind = 'invoice' | 'payment' | 'credit_memo' | 'entry'
const KIND_LABELS: Record<ItemKind, string> = {
    invoice: 'Invoice',
    payment: 'Payment',
    credit_memo: 'Credit memo',
    entry: 'Journal entry',
}

// One posted Accounts receivable line, or one payment application, of an open item.
interface Line {
    id: string
    date: string
    /** "<type> <number>", as entryTypeLabel() and the entry number give it. */
    doc: string
    /** Debit minus credit, in cents: an invoice is positive, a payment negative. */
    net: number
    /** The app path the row opens (Books entryOpenPath()). */
    open: string
}

interface Item {
    id: string
    kind: ItemKind
    number: string
    /** An invoice's due date; every other item ages from its own date. */
    dueDate: string
    lines: Line[]
}

const pad = (n: number) => String(n).padStart(5, '0')

function paymentLine(n: number, date: string, cents: number, suffix = ''): Line {
    return {
        id: `arline0pay${pad(n)}${suffix}`,
        date,
        doc: `Payment ${n}`,
        net: -cents,
        open: `books/payments/arpayment0${pad(n)}`,
    }
}

interface Applied {
    payment: number
    date: string
    cents: number
}

// An invoice with the payments applied to it; the lines add up to its open amount.
function invoice(
    n: number,
    date: string,
    dueDate: string,
    cents: number,
    applied: Applied[] = []
): Item {
    const own: Line = {
        id: `arline0inv${pad(n)}`,
        date,
        doc: `Invoice ${n}`,
        net: cents,
        open: `books/invoices/arinvoice0${pad(n)}`,
    }
    const payments = applied.map(p => paymentLine(p.payment, p.date, p.cents, `a${n}`))
    return {
        id: `arinvoice0${pad(n)}`,
        kind: 'invoice',
        number: String(n),
        dueDate,
        lines: [own, ...payments],
    }
}

// The part of a payment that is applied to no invoice: a credit.
function unapplied(n: number, date: string, cents: number): Item {
    return {
        id: `arpayment0${pad(n)}`,
        kind: 'payment',
        number: String(n),
        dueDate: date,
        lines: [paymentLine(n, date, cents)],
    }
}

function creditMemo(n: number, date: string, cents: number): Item {
    const own: Line = {
        id: `arline00cm${pad(n)}`,
        date,
        doc: `Credit memo ${n}`,
        net: -cents,
        open: `books/credit-memos/arcredit00${pad(n)}`,
    }
    return {
        id: `arcredit00${pad(n)}`,
        kind: 'credit_memo',
        number: String(n),
        dueDate: date,
        lines: [own],
    }
}

function journal(n: number, date: string, net: number): Item {
    const own: Line = {
        id: `arline00je${pad(n)}`,
        date,
        doc: `Journal entry JE-${n}`,
        net,
        open: `books/entries/arentry000${pad(n)}`,
    }
    return { id: own.id, kind: 'entry', number: `JE-${n}`, dueDate: date, lines: [own] }
}

// The open items per customer. As of 2026-11-18 the edges are: an age of 0 (Wei Chen,
// due on the day: Current), of 30 and 31 (Harborview Events, Harborview Kitchen), a
// part payment (Aspen Ridge Dental, Cedar & Pine Landscaping, the St. Jude gala), a
// payment dated after a past As of day (Cedar & Pine Landscaping, Payment 317), a
// paid invoice and so a customer that does not show (Delta Freight Partners), a
// customer whose only item is a credit, so its Total is negative (Bluefin Marine
// Supply, Northwind Seattle warehouse), a credit memo (Harborview Kitchen), a journal
// entry line with a customer (Old Mill Bakery, the St. Jude foundation) and with none,
// a parent with its own item and two sub-customers (Harborview), a parent with no item
// (Marisol Alvarez, Northwind Traders), an inactive customer alone (Old Mill Bakery)
// and inside a family (Northwind Boise), long names and a six-figure amount (St. Jude).
const ITEMS: Record<string, Item[]> = {
    'Aspen Ridge Dental': [
        invoice(1031, '2026-08-04', '2026-09-03', 180000, [
            { payment: 302, date: '2026-08-28', cents: 100000 },
        ]),
        invoice(1049, '2026-10-31', '2026-11-30', 95000),
    ],
    'Bluefin Marine Supply': [unapplied(309, '2026-09-22', 32000)],
    'Cedar & Pine Landscaping': [
        invoice(1042, '2026-10-01', '2026-10-31', 200000, [
            { payment: 317, date: '2026-11-03', cents: 80000 },
        ]),
        unapplied(315, '2026-10-02', 15000),
        invoice(1051, '2026-11-05', '2026-12-05', 40000),
    ],
    'Delta Freight Partners': [
        invoice(1027, '2026-07-15', '2026-08-14', 96000, [
            { payment: 297, date: '2026-08-11', cents: 96000 },
        ]),
    ],
    'Harborview Hospitality Group': [invoice(1053, '2026-11-10', '2026-12-10', 420000)],
    'Harborview Events': [invoice(1047, '2026-09-19', '2026-10-19', 115000)],
    'Harborview Kitchen': [
        invoice(1041, '2026-09-18', '2026-10-18', 280000),
        creditMemo(3, '2026-10-20', 63500),
    ],
    'Alvarez kitchen remodel': [invoice(1050, '2026-10-15', '2026-11-14', 184000)],
    'Northwind Boise (closed)': [invoice(1019, '2026-02-10', '2026-03-12', 64000)],
    'Northwind Portland store': [
        invoice(1038, '2026-08-26', '2026-09-25', 146000),
        invoice(1055, '2026-11-06', '2026-11-21', 85000),
    ],
    'Northwind Seattle warehouse': [unapplied(311, '2026-09-29', 15000)],
    'Old Mill Bakery': [journal(12, '2026-09-01', 31000)],
    'St. Jude Community Hospital Foundation of the Greater Willamette Valley': [
        journal(41, '2026-01-01', 500000),
        invoice(1043, '2026-09-25', '2026-10-25', 750000),
    ],
    'St. Jude Annual Spring Gala and Silent Auction Catering': [
        invoice(1029, '2026-07-22', '2026-08-21', 987525, [
            { payment: 305, date: '2026-09-04', cents: 300000 },
        ]),
    ],
    'St. Jude West Annex renovation': [invoice(1046, '2026-10-02', '2026-11-01', 11824000)],
    'Wei Chen': [invoice(1054, '2026-11-03', '2026-11-18', 9500)],
}

// Accounts receivable lines that name no customer.
const NO_CUSTOMER_ITEMS: Item[] = [journal(2, '2026-11-01', 7500)]

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
        .filter(open => open.net !== 0)
        .sort(byDueDate)
}

interface Member {
    /** '' for the No customer row. */
    id: string
    name: string
    inactive: boolean
    items: OpenItem[]
}

interface Family {
    /** The parent's id, or the customer's own when it has no parent. */
    id: string
    name: string
    /** The family's customers that have an open item: the parent first, then name order. */
    members: Member[]
}

const byName = (a: { name: string }, b: { name: string }) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())

function memberOf(c: AgingCustomer, asOf: string): Member {
    return {
        id: c.id,
        name: c.display_name,
        inactive: c.inactive === true,
        items: openItems(ITEMS[c.display_name] ?? [], asOf),
    }
}

function families(asOf: string): Family[] {
    const all = Object.keys(ITEMS).map(customer)
    const topIds = [...new Set(all.map(c => c.parent || c.id))]
    return topIds.map(topId => {
        const top = CUSTOMERS.find(c => c.id === topId)
        if (!top) throw new Error(`ar-aging fixture: no seeded customer ${topId}`)
        const own = all.filter(c => c.id === topId).map(c => memberOf(c, asOf))
        const subs = all
            .filter(c => c.parent === topId)
            .map(c => memberOf(c, asOf))
            .sort(byName)
        return { id: topId, name: top.display_name, members: [...own, ...subs] }
    })
}

function noCustomer(asOf: string): Family {
    const items = openItems(NO_CUSTOMER_ITEMS, asOf)
    return {
        id: '',
        name: NO_CUSTOMER_LABEL,
        members: [{ id: '', name: NO_CUSTOMER_LABEL, inactive: false, items }],
    }
}

const memberItems = (family: Family) => family.members.flatMap(member => member.items)
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

// The spec's `inline` condition: no row of the family names a sub-customer.
const isInlined = (family: Family) => family.members.every(member => member.id === family.id)

const groupId = (key: string[]) => `g:${JSON.stringify([...key, CURRENCY])}`

const memberLabel = (member: Member) =>
    member.inactive ? `${member.name}${INACTIVE_SUFFIX}` : member.name

const itemLabel = (item: Item) => `${KIND_LABELS[item.kind]} ${item.number}`

interface ResultInput {
    order?: OrderChoice
    /** Customer names the Customer filter keeps; with it the No customer row is not shown. */
    customers?: string[]
    /** Whole groups the Customer filter picked, by the parent's name. */
    groups?: string[]
    /** Customer names opened into their open items. */
    open?: string[]
    /** Item labels ("Invoice 1042") opened into their lines. */
    openItems?: string[]
    /** Family names folded. */
    folded?: string[]
    asOf?: string
}

// The lines of an open item: each in the item's age column and in Total.
function lineRows(open: OpenItem, section: string, depth: number): ResultRow[] {
    return open.lines.map(line => ({
        id: `d:${line.id}`,
        kind: 'detail',
        depth,
        label: `${line.date} · ${line.doc}`,
        section,
        open: line.open,
        cells: { [open.column]: line.net, total: line.net },
    }))
}

function itemRows(open: OpenItem, key: string[], depth: number, input: ResultInput): ResultRow[] {
    const label = itemLabel(open.item)
    const isOpen = input.openItems?.includes(label) === true
    const itemKey = [...key, open.item.id]
    const row: ResultRow = {
        id: groupId(itemKey),
        kind: 'group',
        depth,
        level: 3,
        label,
        section: groupId(key),
        groupKey: [...itemKey, CURRENCY],
        expanded: isOpen,
        canExpand: true,
        cells: { due: open.item.dueDate, [open.column]: open.net, total: open.net },
    }
    return isOpen ? [row, ...lineRows(open, row.id, depth + 1)] : [row]
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
        cells: { name: member.id || null, 'name@label': label, ...figureCells(member.items) },
        ...(member.inactive ? { muted: true } : {}),
    }
    if (!isOpen) return [row]
    return [row, ...member.items.flatMap(open => itemRows(open, key, depth + 1, input))]
}

function familyRows(family: Family, input: ResultInput): ResultRow[] {
    if (isInlined(family)) return family.members.flatMap(m => memberRows(m, family, 0, input))
    const isFolded = input.folded?.includes(family.name) === true
    const cells = figureCells(memberItems(family))
    const header: ResultRow = {
        id: groupId([family.id]),
        kind: 'group',
        depth: 0,
        level: 1,
        label: family.name,
        groupKey: [family.id, CURRENCY],
        expanded: !isFolded,
        canExpand: true,
        cells,
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
            cells,
        },
    ]
}

// `hideEmpty`: a customer with no open item on the day does not show, and a family
// with no shown customer does not show.
function shownFamilies(input: ResultInput): Family[] {
    const asOf = input.asOf ?? AR_AGING_TODAY
    const picked = input.customers
    const keep = (member: Member) =>
        member.items.length > 0 && (!picked || picked.includes(member.name))
    const all = picked ? families(asOf) : [...families(asOf), noCustomer(asOf)]
    return all
        .map(family => ({ ...family, members: family.members.filter(keep) }))
        .filter(family => family.members.length > 0)
}

// Name: families by name, No customer last. Largest balance: families by their total
// and the sub-customers of a family by their Total, largest first; the parent's own
// row stays first.
function ordered(shown: Family[], order: OrderChoice): Family[] {
    const named = shown.filter(family => family.id !== '').sort(byName)
    const blank = shown.filter(family => family.id === '')
    if (order === 'name') return [...named, ...blank]
    const familyTotal = (family: Family) => totalOf(memberItems(family))
    const byBalance = (a: Member, b: Member) => totalOf(b.items) - totalOf(a.items)
    return [
        ...named
            .sort((a, b) => familyTotal(b) - familyTotal(a))
            .map(family => ({
                ...family,
                members: [
                    ...family.members.filter(m => m.id === family.id),
                    ...family.members.filter(m => m.id !== family.id).sort(byBalance),
                ],
            })),
        ...blank,
    ]
}

function totalRow(shown: Family[]): ResultRow {
    return {
        id: `total:${JSON.stringify([CURRENCY])}`,
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: figureCells(shown.flatMap(memberItems)),
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
        { id: 'asOf', type: 'asOf', value: input.asOf ?? AR_AGING_TODAY },
        customers,
        { id: 'order', type: 'choice', value: input.order ?? 'name' },
    ]
}

// The line the Customer param's `header` prints: the picks' labels joined by ", ", a
// whole group by its group label; '' when unset.
function customerHeader(input: ResultInput): string {
    if (!input.customers) return ''
    const groups = input.groups ?? []
    const inGroup = (name: string) => {
        const parent = CUSTOMERS.find(c => c.id === customer(name).parent)
        return parent !== undefined && groups.includes(parent.display_name)
    }
    const labels = [
        ...input.customers.filter(name => !inGroup(name)),
        ...groups.map(group => `All ${group} sub-customers`),
    ]
    return labels.length > 0 ? `Customer: ${labels.join(', ')}` : ''
}

export function arAgingResult(input: ResultInput = {}): RunResult {
    const shown = ordered(shownFamilies(input), input.order ?? 'name')
    return {
        columns: AR_AGING_COLUMNS,
        rows: [...shown.flatMap(family => familyRows(family, input)), totalRow(shown)],
        notices: [],
        headerLines: [customerHeader(input)],
        topics: [
            'collection/books_receivable_lines',
            'collection/books_receivable_applications',
            'collection/books_customers',
            'collection/books_journal_entries',
            'collection/books_settings',
        ],
        heading: AR_AGING_HEADING,
        page: null,
        params: resolvedParams(input),
    }
}

// A run as of a day before any posted line: only the Total row, so the view is empty.
export function emptyArAgingResult(): RunResult {
    return {
        ...arAgingResult({ asOf: AR_AGING_EMPTY_DAY }),
        rows: [totalRow([])],
    }
}

// The Customer filter of the `filtered` state: one customer, and every sub-customer
// of Harborview Hospitality Group (the whole-group pick), which leaves the parent's
// own item out of its family.
export const AR_AGING_FILTER_PICK = {
    customer: customer('Aspen Ridge Dental'),
    group: 'Harborview Hospitality Group',
    groupMembers: ['Harborview Events', 'Harborview Kitchen'],
}

// The rows the `opened` and `item-opened` states open.
export const AR_AGING_OPENED = {
    customers: ['Cedar & Pine Landscaping', 'Harborview Kitchen'],
    item: 'Invoice 1042',
}
