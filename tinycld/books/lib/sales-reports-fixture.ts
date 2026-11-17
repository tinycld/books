// Synthetic Sales by Customer and Sales by Product/Service for the helix reference
// route. The customers are the seeded ones (customer-form-fixture.ts), the products the
// seeded ones (products-services-fixture.ts, and the Discount product of
// invoice-form-fixture.ts), so names, parents, types and inactive marks are typed against
// the generated records. The run results are typed against core's report contract, so
// tsc checks every field. Money is integer cents.
//
// Both reports are built from the one list of sale lines below, as the shipped specs
// read the one source `books.sales_lines`: so the two Totals are equal.
import type { DisplayLayout, ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type {
    ParamOptionsPage,
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import type {
    BooksCreditMemoLines,
    BooksCreditMemos,
    BooksCustomers,
    BooksInvoiceLines,
    BooksInvoices,
    BooksProducts,
    BooksSalesReceiptLines,
    BooksSalesReceipts,
} from '../types'
import { CUSTOMERS } from './customer-form-fixture'
import { INVOICE_PRODUCTS } from './invoice-form-fixture'
import { PRODUCTS } from './products-services-fixture'

export const SALES_BY_CUSTOMER_TITLE = 'Sales by Customer'
export const SALES_BY_PRODUCT_TITLE = 'Sales by Product/Service'
// The shipped reports' descriptions (server/report_sales.go).
export const SALES_BY_CUSTOMER_DESCRIPTION =
    'What each customer bought in a period, from posted invoices and sales receipts, less posted credit memos, before sales tax.'
export const SALES_BY_PRODUCT_DESCRIPTION =
    'What you sold of each product and service in a period, from posted invoices and sales receipts, less posted credit memos, before sales tax.'
// The Books source heading: the seeded business name (books-settings-fixture.ts).
export const SALES_REPORTS_HEADING = 'Hartwell Supply Co.'
// "Today" for the reference captures. The default Period is This fiscal year to date,
// and the seeded fiscal year starts in January.
export const SALES_REPORTS_TODAY = '2026-11-17'
export const SALES_REPORTS_FROM = '2026-01-01'
export const SALES_REPORTS_TO = SALES_REPORTS_TODAY
// December 2025 holds one invoice and one credit memo of the same amount: the Total is
// zero, so % of sales is blank on every row.
export const SALES_REPORTS_ZERO_FROM = '2025-12-01'
export const SALES_REPORTS_ZERO_TO = '2025-12-31'
// No posted sale line: the empty report.
export const SALES_REPORTS_EMPTY_FROM = '2025-07-01'
export const SALES_REPORTS_EMPTY_TO = '2025-09-30'
const CURRENCY = 'USD'
const NO_CUSTOMER_LABEL = 'No customer'
const INACTIVE_SUFFIX = ' (inactive)'

export type SalesOrderChoice = 'name' | 'sales'

// --- The params, as the shipped specs declare them (server/report_sales.go builds the
// same lists in Go; its test pins the Go side). ---

const PERIOD_PARAM: ParamDef = {
    id: 'period',
    type: 'dateRange',
    label: 'Period',
    default: { preset: 'thisFiscalYearToDate' },
}

// customersParam() in server/report_spec_helpers.go.
const CUSTOMERS_PARAM: ParamDef = {
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
}

// productsParam() in server/report_spec_helpers.go: grouped by type, bundles left out.
const PRODUCTS_PARAM: ParamDef = {
    id: 'products',
    type: 'choice',
    label: 'Product',
    multiple: true,
    header: 'Product: {label}',
    optionsFrom: {
        source: 'books.products',
        value: [{ field: 'id' }],
        label: [{ field: 'name' }],
        group: [{ field: 'type' }],
        groupLabel: 'All {group} items',
    },
}

const ORDER_PARAM: ParamDef = {
    id: 'order',
    type: 'choice',
    label: 'Order',
    options: [
        { value: 'name', label: 'Name' },
        { value: 'sales', label: 'Largest sales' },
    ],
    default: 'name',
}

export const SALES_BY_CUSTOMER_PARAMS: ParamDef[] = [PERIOD_PARAM, CUSTOMERS_PARAM, ORDER_PARAM]
export const SALES_BY_PRODUCT_PARAMS: ParamDef[] = [
    PERIOD_PARAM,
    PRODUCTS_PARAM,
    CUSTOMERS_PARAM,
    ORDER_PARAM,
]

// --- The display blocks, measured in phase 3 pass 2 for each report's own columns
// (docs/plans/sales-reports-ledger.md has the figures). ---

// A phone row of Sales by Customer: the name on line 1, Sales and % of sales on line 2.
export const SALES_BY_CUSTOMER_PHONE_LAYOUT: DisplayLayout = {
    width: 'mobile',
    tracks: 2,
    cells: [
        { col: 'name', line: 1, span: 2 },
        { col: 'sales', line: 2 },
        { col: 'pct', line: 2 },
    ],
}

export const SALES_BY_CUSTOMER_DISPLAY: NonNullable<ReportSpec['display']> = {
    oneLine: { minWidth: '520px' },
    columns: {
        name: { whiteSpace: 'normal', lineClamp: 3 },
        sales: { minWidth: 'max-content' },
        pct: { minWidth: 'max-content' },
    },
    layouts: [SALES_BY_CUSTOMER_PHONE_LAYOUT],
}

// A phone row of Sales by Product/Service: four figures do not fit one line, so the
// label is on line 1, Quantity and Amount on line 2, % of sales and Avg price on line 3.
export const SALES_BY_PRODUCT_PHONE_LAYOUT: DisplayLayout = {
    width: 'mobile',
    tracks: 2,
    cells: [
        { col: 'name', line: 1, span: 2 },
        { col: 'quantity', line: 2 },
        { col: 'amount', line: 2 },
        { col: 'pct', line: 3 },
        { col: 'avg', line: 3 },
    ],
}

export const SALES_BY_PRODUCT_DISPLAY: NonNullable<ReportSpec['display']> = {
    oneLine: { minWidth: '720px' },
    columns: {
        name: { whiteSpace: 'normal', lineClamp: 3 },
        quantity: { minWidth: 'max-content' },
        amount: { minWidth: 'max-content' },
        pct: { minWidth: 'max-content' },
        avg: { minWidth: 'max-content' },
    },
    layouts: [SALES_BY_PRODUCT_PHONE_LAYOUT],
}

// What the view reads of each spec's groups: the family level is open and ends in
// "Total <parent>"; a customer and a product start closed.
export const SALES_BY_CUSTOMER_GROUPS = [{ subtotals: true, open: true }, { open: false }]
export const SALES_BY_PRODUCT_GROUPS = [{ open: false }]

export const SALES_BY_CUSTOMER_COLUMNS: ResultColumn[] = [
    {
        id: 'name',
        label: 'Customer',
        type: 'relation',
        labelCell: 'name@label',
        labelType: 'text',
    },
    { id: 'sales', label: 'Sales', type: 'money', aggregate: 'sum', currency: CURRENCY },
    { id: 'pct', label: '% of sales', type: 'percent' },
]

export const SALES_BY_PRODUCT_COLUMNS: ResultColumn[] = [
    {
        id: 'name',
        label: 'Product/Service',
        type: 'relation',
        labelCell: 'name@label',
        labelType: 'text',
    },
    { id: 'quantity', label: 'Quantity', type: 'number', aggregate: 'sum' },
    { id: 'amount', label: 'Amount', type: 'money', aggregate: 'sum', currency: CURRENCY },
    { id: 'pct', label: '% of sales', type: 'percent', format: 'percent' },
    { id: 'avg', label: 'Avg price', type: 'money', currency: CURRENCY },
]

// --- Customers and products, from the seeded records. ---

type SalesCustomer = Pick<BooksCustomers, 'id' | 'display_name' | 'parent' | 'inactive'>
type SalesProduct = Pick<BooksProducts, 'id' | 'name' | 'type' | 'inactive'>

function customer(name: string): SalesCustomer {
    const found = CUSTOMERS.find(c => c.display_name === name)
    if (!found) throw new Error(`sales-reports fixture: no seeded customer ${name}`)
    return {
        id: found.id,
        display_name: found.display_name,
        parent: found.parent,
        inactive: found.inactive,
    } satisfies SalesCustomer
}

function product(name: string): SalesProduct {
    const found = [...PRODUCTS, ...INVOICE_PRODUCTS].find(p => p.name === name)
    if (!found) throw new Error(`sales-reports fixture: no seeded product ${name}`)
    return {
        id: found.id,
        name: found.name,
        type: found.type,
        inactive: found.inactive,
    } satisfies SalesProduct
}

// --- Documents and their lines. ---

export type SalesDocumentKind = 'invoice' | 'sales_receipt' | 'credit_memo'

const KIND_LABELS: Record<SalesDocumentKind, string> = {
    invoice: 'Invoice',
    sales_receipt: 'Sales receipt',
    credit_memo: 'Credit memo',
}

// The read view each kind opens (server/entry_routes.json).
const KIND_ROUTES: Record<SalesDocumentKind, string> = {
    invoice: 'books/invoices',
    sales_receipt: 'books/sales-receipts',
    credit_memo: 'books/credit-memos',
}

// A credit memo's lines are stored positive; the source's `sign` makes them count
// below zero.
const KIND_SIGNS: Record<SalesDocumentKind, 1 | -1> = {
    invoice: 1,
    sales_receipt: 1,
    credit_memo: -1,
}

type LineColumn = 'kind' | 'quantity' | 'rate' | 'amount' | 'position'

// The columns the three line collections share. A line names its product by name here.
export type SaleLineFixture = Pick<BooksInvoiceLines, LineColumn> &
    Pick<BooksSalesReceiptLines, LineColumn> &
    Pick<BooksCreditMemoLines, LineColumn> & { product_name: string }

type DocumentColumn = 'id' | 'status' | 'number' | 'sequence' | 'date' | 'subtotal'

export type SalesDocumentFixture = Pick<BooksInvoices, DocumentColumn> &
    Pick<BooksSalesReceipts, DocumentColumn> &
    Pick<BooksCreditMemos, DocumentColumn> & {
        kind: SalesDocumentKind
        /** '' for a sales receipt with no customer. */
        customer_name: string
        lines: SaleLineFixture[]
    }

type LineInput =
    | { kind: 'item'; product: string; quantity: number; rate: number }
    | { kind: 'percent'; percent: number }
    | { kind: 'description' }
    | { kind: 'subtotal' }

const item = (name: string, quantity: number, rate: number): LineInput => ({
    kind: 'item',
    product: name,
    quantity,
    rate,
})
// A discount of the lines above it; the form requires a product, the seed's is Discount.
const discount = (percent: number): LineInput => ({ kind: 'percent', percent })

const sum = (values: number[]) => values.reduce((a, v) => a + v, 0)
// Half away from zero, as Books rounds money.
const round = (value: number) => Math.sign(value) * Math.round(Math.abs(value))
const round2 = (value: number) => round(value * 100) / 100

const isSaleLine = (line: SaleLineFixture) => line.kind === 'item' || line.kind === 'percent'

function linesOf(inputs: LineInput[]): SaleLineFixture[] {
    const lines: SaleLineFixture[] = []
    for (const [index, input] of inputs.entries()) {
        const position = index + 1
        const above = sum(lines.filter(isSaleLine).map(line => line.amount))
        if (input.kind === 'item') {
            lines.push({
                kind: 'item',
                product_name: input.product,
                quantity: input.quantity,
                rate: input.rate,
                amount: round(input.quantity * input.rate),
                position,
            })
        } else if (input.kind === 'percent') {
            lines.push({
                kind: 'percent',
                product_name: 'Discount',
                quantity: 0,
                rate: 0,
                amount: -round((above * input.percent) / 100),
                position,
            })
        } else {
            // A subtotal line repeats the lines above it; a description has no amount.
            // Neither is a sale line.
            lines.push({
                kind: input.kind,
                product_name: '',
                quantity: 0,
                rate: 0,
                amount: input.kind === 'subtotal' ? above : 0,
                position,
            })
        }
    }
    return lines
}

const ID_PREFIXES: Record<SalesDocumentKind, string> = {
    invoice: 'srinvoice0',
    sales_receipt: 'srreceipt0',
    credit_memo: 'srcrmemo00',
}

function document(
    kind: SalesDocumentKind,
    number: number,
    date: string,
    customerName: string,
    inputs: LineInput[],
    status: SalesDocumentFixture['status'] = 'posted'
): SalesDocumentFixture {
    const lines = linesOf(inputs)
    return {
        id: `${ID_PREFIXES[kind]}${String(number).padStart(5, '0')}`,
        kind,
        status,
        number: String(number),
        sequence: number,
        date,
        customer_name: customerName,
        subtotal: sum(lines.filter(isSaleLine).map(line => line.amount)),
        lines,
    }
}

const LAPTOP = 'Business laptop, 14-inch, 32 GB memory, 1 TB storage, three-year on-site warranty'
const NETWORK_VISIT =
    'On-site network troubleshooting, two-hour minimum with travel inside the Portland metro area'
const ST_JUDE = 'St. Jude Community Hospital Foundation of the Greater Willamette Valley'
const ST_JUDE_GALA = 'St. Jude Annual Spring Gala and Silent Auction Catering'

// The edges: a family whose parent has its own sale (Harborview, St. Jude); a
// sub-customer whose parent has no sale (Alvarez kitchen remodel, Northwind); an inactive
// customer alone (Old Mill Bakery) and inside a family (Northwind Boise); a customer whose
// only document in the period is a credit memo (Cedar & Pine: a row below zero); a credit
// memo that lowers a customer and a product (Bluefin, Wireless access point); a discount
// line (Aspen Ridge, on the Discount product, with no quantity); fractional quantities;
// sales receipts with no customer; long names; an inactive product (Fax line setup, Cable
// ties); a subtotal and a description line (not counted); a draft and a void document and
// a draft credit memo (not counted); December 2025 documents outside the default period.
export const SALES_DOCUMENTS: SalesDocumentFixture[] = [
    document('invoice', 1004, '2025-12-09', 'Delta Freight Partners', [
        item('Data backup audit', 1, 24000),
    ]),
    document('credit_memo', 301, '2025-12-18', 'Granite Peak Outfitters', [
        item('Data backup audit', 1, 24000),
    ]),
    document('invoice', 1012, '2026-01-21', 'Old Mill Bakery', [
        item('Bookkeeping catch-up (per month)', 2, 45000),
    ]),
    document('invoice', 1019, '2026-02-10', 'Northwind Boise (closed)', [
        item('Fax line setup', 1, 6500),
        item('Toner cartridge, black', 4, 8900),
    ]),
    document('invoice', 1029, '2026-07-22', ST_JUDE_GALA, [
        item('Design software license (annual)', 5, 42000),
        { kind: 'subtotal' },
        { kind: 'description' },
    ]),
    document('invoice', 1031, '2026-08-04', 'Aspen Ridge Dental', [
        item('Website maintenance retainer', 3, 37500),
        item('Remote IT support (hourly)', 6.5, 9500),
    ]),
    document('invoice', 1036, '2026-08-19', 'Bluefin Marine Supply', [
        item(LAPTOP, 2, 164900),
        item('Wireless access point', 3, 18900),
    ]),
    document('invoice', 1038, '2026-08-26', 'Northwind Portland store', [
        item('Wireless access point', 6, 18900),
        item('Surge protector, 8 outlet', 8, 3400),
    ]),
    document('sales_receipt', 2009, '2026-09-03', '', [
        item('Printer paper, case', 3, 4800),
        item('Cat6 patch cable, 10 ft', 4, 875),
    ]),
    document('credit_memo', 304, '2026-09-10', 'Bluefin Marine Supply', [
        item('Wireless access point', 1, 18900),
    ]),
    document('invoice', 1041, '2026-09-14', 'Harborview Kitchen', [
        item(NETWORK_VISIT, 2, 28000),
        item('Cat6 patch cable, 10 ft', 12, 875),
    ]),
    document('invoice', 1043, '2026-09-25', ST_JUDE, [
        item('Payroll setup', 1, 60000),
        item('Bookkeeping catch-up (per month)', 3, 45000),
    ]),
    document('sales_receipt', 2011, '2026-10-06', 'Harborview Events', [
        item('Software training session (per hour)', 2.5, 12000),
    ]),
    document('credit_memo', 306, '2026-10-09', 'Cedar & Pine Landscaping', [
        item('Cable ties, 100 pack', 4, 1250),
    ]),
    document('invoice', 1049, '2026-10-12', 'Aspen Ridge Dental', [
        item('Workstation setup and imaging', 4, 15000),
        discount(10),
    ]),
    document('invoice', 1050, '2026-10-15', 'Alvarez kitchen remodel', [
        item('Data backup audit', 1, 24000),
    ]),
    document('invoice', 1052, '2026-10-20', 'Harborview Hospitality Group', [
        item('Logo and brand design package', 1, 180000),
        item('Year-end tax preparation', 1, 125000),
    ]),
    document('sales_receipt', 2014, '2026-10-24', 'Wei Chen', [
        item('Remote IT support (hourly)', 1.25, 9500),
    ]),
    document('invoice', 1055, '2026-10-27', 'Harborview Kitchen', [
        item('Printer paper, case', 10, 4800),
    ]),
    document('sales_receipt', 2016, '2026-11-05', '', [item('Toner cartridge, black', 2, 8900)]),
    // Not counted: a draft, a void, a draft credit memo.
    document('invoice', 1057, '2026-11-10', 'Wei Chen', [item('Payroll setup', 1, 60000)], 'draft'),
    document(
        'sales_receipt',
        2015,
        '2026-10-30',
        'Aspen Ridge Dental',
        [item('Printer paper, case', 2, 4800)],
        'void'
    ),
    document(
        'credit_memo',
        307,
        '2026-11-12',
        'Aspen Ridge Dental',
        [item('Website maintenance retainer', 1, 37500)],
        'draft'
    ),
]

// --- Sale lines: the rows of `books.sales_lines` the filter keeps. ---

interface Sale {
    id: string
    doc: SalesDocumentFixture
    /** '' for a sale with no customer. */
    customerId: string
    customerName: string
    product: SalesProduct
    position: number
    /** sign × quantity; null on a percent line, which has no quantity. */
    quantity: number | null
    /** sign × amount, in cents. */
    amount: number
}

export interface SalesInput {
    from?: string
    to?: string
    order?: SalesOrderChoice
    /** Customer names the Customer filter keeps; with it the No customer row is not shown. */
    customers?: string[]
    /** Whole groups the Customer filter picked, by the parent's name. */
    customerGroups?: string[]
    /** Product names the Product filter keeps (Sales by Product/Service only). */
    products?: string[]
    /** Whole groups the Product filter picked, by the product type. */
    productGroups?: SalesProduct['type'][]
    /** Customer or product names opened into their sale lines. */
    open?: string[]
    /** Family names folded (Sales by Customer only). */
    folded?: string[]
}

function salesOf(doc: SalesDocumentFixture): Sale[] {
    const sign = KIND_SIGNS[doc.kind]
    const buyer = doc.customer_name === '' ? null : customer(doc.customer_name)
    return doc.lines.filter(isSaleLine).map(line => ({
        id: `${doc.id}:${line.position}`,
        doc,
        customerId: buyer?.id ?? '',
        customerName: buyer?.display_name ?? '',
        product: product(line.product_name),
        position: line.position,
        quantity: line.kind === 'percent' ? null : sign * line.quantity,
        amount: sign * line.amount,
    }))
}

// postedSaleLines(period), then the Customer and Product filters, in date order, then
// document order, then line order.
function sales(input: SalesInput): Sale[] {
    const from = input.from ?? SALES_REPORTS_FROM
    const to = input.to ?? SALES_REPORTS_TO
    return SALES_DOCUMENTS.filter(d => d.status === 'posted' && d.date >= from && d.date <= to)
        .flatMap(salesOf)
        .filter(sale => !input.customers || input.customers.includes(sale.customerName))
        .filter(sale => !input.products || input.products.includes(sale.product.name))
        .sort(
            (a, b) =>
                a.doc.date.localeCompare(b.doc.date) ||
                a.doc.sequence - b.doc.sequence ||
                a.position - b.position
        )
}

const amountOf = (lines: Sale[]) => sum(lines.map(line => line.amount))

// percentOfTotal with scale 2; no figure when the Total is zero.
const shareOf = (amount: number, total: number) =>
    total === 0 ? null : round2((amount / total) * 100)

const groupId = (key: string[]) => `g:${JSON.stringify([...key, CURRENCY])}`
const documentWords = (doc: SalesDocumentFixture) =>
    `${doc.date} · ${KIND_LABELS[doc.kind]} ${doc.number}`
const documentOpen = (doc: SalesDocumentFixture) => `${KIND_ROUTES[doc.kind]}/${doc.id}`
const byName = (a: { name: string }, b: { name: string }) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())

function periodParam(input: SalesInput): ResolvedParam {
    return {
        id: 'period',
        type: 'dateRange',
        from: input.from ?? SALES_REPORTS_FROM,
        to: input.to ?? SALES_REPORTS_TO,
    }
}

function customersParam(input: SalesInput): ResolvedParam {
    if (!input.customers) return { id: 'customers', type: 'choice', unset: true }
    return {
        id: 'customers',
        type: 'choice',
        list: input.customers.map(name => customer(name).id),
        ...(input.customerGroups ? { groups: input.customerGroups } : {}),
    }
}

// The line a choice param with a `header` prints: its picks' labels joined by ", ", a
// whole group by its group label; '' when unset.
function headerLine(prefix: string, labels: string[] | undefined): string {
    return labels && labels.length > 0 ? `${prefix}: ${labels.join(', ')}` : ''
}

function customerHeader(input: SalesInput): string {
    if (!input.customers) return ''
    const groups = input.customerGroups ?? []
    const inGroup = (name: string) => {
        const parent = CUSTOMERS.find(c => c.id === customer(name).parent)
        return parent !== undefined && groups.includes(parent.display_name)
    }
    return headerLine('Customer', [
        ...input.customers.filter(name => !inGroup(name)),
        ...groups.map(group => `All ${group} sub-customers`),
    ])
}

// --- Sales by Customer. ---

interface Member {
    /** '' for the No customer row. */
    id: string
    name: string
    inactive: boolean
    lines: Sale[]
}

interface Family {
    /** The parent's id, or the customer's own when it has no parent; '' for No customer. */
    id: string
    name: string
    /** The family's customers with sale lines: the parent first, then name order. */
    members: Member[]
}

function families(lines: Sale[]): Family[] {
    const buyers = [...new Set(lines.map(line => line.customerName))]
        .filter(name => name !== '')
        .map(customer)
    const memberOf = (c: SalesCustomer): Member => ({
        id: c.id,
        name: c.display_name,
        inactive: c.inactive === true,
        lines: lines.filter(line => line.customerId === c.id),
    })
    const topIds = [...new Set(buyers.map(c => c.parent || c.id))]
    const named = topIds.map(topId => {
        const top = CUSTOMERS.find(c => c.id === topId)
        if (!top) throw new Error(`sales-reports fixture: no seeded customer ${topId}`)
        const own = buyers.filter(c => c.id === topId).map(memberOf)
        const subs = buyers
            .filter(c => c.parent === topId)
            .map(memberOf)
            .sort(byName)
        return { id: topId, name: top.display_name, members: [...own, ...subs] }
    })
    const unnamed = lines.filter(line => line.customerId === '')
    if (unnamed.length === 0) return named
    const none: Family = {
        id: '',
        name: NO_CUSTOMER_LABEL,
        members: [{ id: '', name: NO_CUSTOMER_LABEL, inactive: false, lines: unnamed }],
    }
    return [...named, none]
}

const memberSales = (member: Member) => amountOf(member.lines)
const familySales = (family: Family) => sum(family.members.map(memberSales))

// The spec's `inline` condition: no line of the family names a sub-customer.
const isInlined = (family: Family) => family.members.every(member => member.id === family.id)

// Name: families by name, No customer last. Largest sales: families by their total and
// the sub-customers of a family by their sales, largest first; the parent's own row
// stays first and No customer last.
function orderedFamilies(all: Family[], order: SalesOrderChoice): Family[] {
    const named = all.filter(family => family.id !== '').sort(byName)
    const blank = all.filter(family => family.id === '')
    if (order === 'name') return [...named, ...blank]
    const bySales = (a: Member, b: Member) => memberSales(b) - memberSales(a)
    const largest = named
        .sort((a, b) => familySales(b) - familySales(a))
        .map(family => ({
            ...family,
            members: [
                ...family.members.filter(m => m.id === family.id),
                ...family.members.filter(m => m.id !== family.id).sort(bySales),
            ],
        }))
    return [...largest, ...blank]
}

// One row per sale line: its signed amount under Sales, a blank % of sales.
function customerLineRows(member: Member, section: string, depth: number): ResultRow[] {
    return member.lines.map(line => ({
        id: `d:${line.id}`,
        kind: 'detail',
        depth,
        label: `${documentWords(line.doc)} · ${line.product.name}`,
        section,
        open: documentOpen(line.doc),
        cells: { sales: line.amount, pct: null },
    }))
}

function memberRows(
    member: Member,
    family: Family,
    depth: number,
    total: number,
    input: SalesInput
): ResultRow[] {
    const key = [family.id, member.id]
    const isOpen = input.open?.includes(member.name) === true
    const section = depth === 0 ? {} : { section: groupId([family.id]) }
    const label = member.inactive ? `${member.name}${INACTIVE_SUFFIX}` : member.name
    const amount = memberSales(member)
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
        cells: {
            name: member.id || null,
            'name@label': label,
            sales: amount,
            pct: shareOf(amount, total),
        },
        ...(member.inactive ? { muted: true } : {}),
    }
    return isOpen ? [row, ...customerLineRows(member, row.id, depth + 1)] : [row]
}

function familyRows(family: Family, total: number, input: SalesInput): ResultRow[] {
    if (isInlined(family)) {
        return family.members.flatMap(m => memberRows(m, family, 0, total, input))
    }
    const isFolded = input.folded?.includes(family.name) === true
    const amount = familySales(family)
    const cells = { sales: amount, pct: shareOf(amount, total) }
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
        ...family.members.flatMap(m => memberRows(m, family, 1, total, input)),
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

const SALES_TOPICS = [
    'collection/books_invoice_lines',
    'collection/books_sales_receipt_lines',
    'collection/books_credit_memo_lines',
    'collection/books_invoices',
    'collection/books_sales_receipts',
    'collection/books_credit_memos',
    'collection/books_customers',
    'collection/books_products',
    'collection/books_settings',
]

export function salesByCustomerResult(input: SalesInput = {}): RunResult {
    const lines = sales(input)
    const total = amountOf(lines)
    const shown = orderedFamilies(families(lines), input.order ?? 'name')
    const totalRow: ResultRow = {
        id: `total:${JSON.stringify([CURRENCY])}`,
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: { sales: total, pct: shareOf(total, total) },
    }
    return {
        columns: SALES_BY_CUSTOMER_COLUMNS,
        rows: [...shown.flatMap(family => familyRows(family, total, input)), totalRow],
        notices: [],
        headerLines: [customerHeader(input)],
        topics: SALES_TOPICS,
        heading: SALES_REPORTS_HEADING,
        page: null,
        params: [
            periodParam(input),
            customersParam(input),
            { id: 'order', type: 'choice', value: input.order ?? 'name' },
        ],
    }
}

// --- Sales by Product/Service. ---

interface ProductRow {
    product: SalesProduct
    name: string
    lines: Sale[]
}

// The sum of sign × quantity, rounded to 2 places; blank when no line has a quantity (a
// product with only percent lines).
function quantityOf(lines: Sale[]): number | null {
    const counted = lines.flatMap(line => (line.quantity === null ? [] : [line.quantity]))
    return counted.length === 0 ? null : round2(sum(counted))
}

// Amount ÷ Quantity in whole cents; blank when the quantity is 0 or blank.
function averageOf(amount: number, quantity: number | null): number | null {
    return quantity === null || quantity === 0 ? null : round(amount / quantity)
}

function productRows(lines: Sale[], order: SalesOrderChoice): ProductRow[] {
    const ids = [...new Set(lines.map(line => line.product.id))]
    const rows = ids.map(id => {
        const own = lines.filter(line => line.product.id === id)
        const first = own[0]
        if (!first) throw new Error(`sales-reports fixture: no sale line of product ${id}`)
        return { product: first.product, name: first.product.name, lines: own }
    })
    const named = rows.sort(byName)
    if (order === 'name') return named
    return named.sort((a, b) => amountOf(b.lines) - amountOf(a.lines))
}

// One row per sale line: its signed quantity and amount, amount ÷ quantity under
// Avg price, a blank % of sales. A sale with no customer ends after the number.
function productLineRows(row: ProductRow, section: string): ResultRow[] {
    return row.lines.map(line => ({
        id: `d:${line.id}`,
        kind: 'detail',
        depth: 1,
        label: line.customerName
            ? `${documentWords(line.doc)} · ${line.customerName}`
            : documentWords(line.doc),
        section,
        open: documentOpen(line.doc),
        cells: {
            quantity: line.quantity,
            amount: line.amount,
            pct: null,
            avg: averageOf(line.amount, line.quantity),
        },
    }))
}

function productGroupRows(row: ProductRow, total: number, input: SalesInput): ResultRow[] {
    const isOpen = input.open?.includes(row.name) === true
    const isInactive = row.product.inactive === true
    const label = isInactive ? `${row.name}${INACTIVE_SUFFIX}` : row.name
    const amount = amountOf(row.lines)
    const quantity = quantityOf(row.lines)
    const group: ResultRow = {
        id: groupId([row.product.id]),
        kind: 'group',
        depth: 0,
        level: 1,
        label,
        groupKey: [row.product.id, CURRENCY],
        expanded: isOpen,
        canExpand: true,
        cells: {
            name: row.product.id,
            'name@label': label,
            quantity,
            amount,
            pct: shareOf(amount, total),
            avg: averageOf(amount, quantity),
        },
        ...(isInactive ? { muted: true } : {}),
    }
    return isOpen ? [group, ...productLineRows(row, group.id)] : [group]
}

const PRODUCT_TYPE_LABELS: Record<SalesProduct['type'], string> = {
    service: 'Service',
    non_inventory: 'Non-inventory',
    bundle: 'Bundle',
}

function productsParam(input: SalesInput): ResolvedParam {
    if (!input.products) return { id: 'products', type: 'choice', unset: true }
    return {
        id: 'products',
        type: 'choice',
        list: input.products.map(name => product(name).id),
        ...(input.productGroups ? { groups: input.productGroups } : {}),
    }
}

function productHeader(input: SalesInput): string {
    if (!input.products) return ''
    const groups = input.productGroups ?? []
    return headerLine('Product', [
        ...input.products.filter(name => !groups.includes(product(name).type)),
        ...groups.map(group => `All ${PRODUCT_TYPE_LABELS[group]} items`),
    ])
}

export function salesByProductResult(input: SalesInput = {}): RunResult {
    const lines = sales(input)
    const total = amountOf(lines)
    const shown = productRows(lines, input.order ?? 'name')
    // blankAbove "byProduct": units of different products do not add up, so the Total
    // has no Quantity and no Avg price.
    const totalRow: ResultRow = {
        id: `total:${JSON.stringify([CURRENCY])}`,
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: { quantity: null, amount: total, pct: shareOf(total, total), avg: null },
    }
    return {
        columns: SALES_BY_PRODUCT_COLUMNS,
        rows: [...shown.flatMap(row => productGroupRows(row, total, input)), totalRow],
        notices: [],
        headerLines: [productHeader(input), customerHeader(input)],
        topics: SALES_TOPICS,
        heading: SALES_REPORTS_HEADING,
        page: null,
        params: [
            periodParam(input),
            productsParam(input),
            customersParam(input),
            { id: 'order', type: 'choice', value: input.order ?? 'name' },
        ],
    }
}

// --- The states of the reference. ---

const EMPTY_PERIOD = { from: SALES_REPORTS_EMPTY_FROM, to: SALES_REPORTS_EMPTY_TO }
const totalOnly = (result: RunResult): RunResult => ({
    ...result,
    rows: result.rows.filter(row => row.kind === 'total'),
})

// A period with no posted sale line: only the Total row, so the view is empty.
export const emptySalesByCustomerResult = () => totalOnly(salesByCustomerResult(EMPTY_PERIOD))
export const emptySalesByProductResult = () => totalOnly(salesByProductResult(EMPTY_PERIOD))

// The Customer filter of the `filtered` state: one customer, and every sub-customer of
// Harborview Hospitality Group (the whole-group pick), which leaves the parent's own
// sales out of its family.
export const SALES_CUSTOMER_FILTER = {
    customer: customer('Aspen Ridge Dental'),
    group: 'Harborview Hospitality Group',
    groupMembers: ['Harborview Events', 'Harborview Kitchen'],
}

// The Product filter of the `filtered` state: every Non-inventory item (the whole-group
// pick).
export const SALES_PRODUCT_FILTER = {
    group: 'non_inventory' as const,
    groupLabel: PRODUCT_TYPE_LABELS.non_inventory,
    groupMembers: PRODUCTS.filter(p => p.type === 'non_inventory').map(p => p.name),
}

const byLabel = (a: { label: string }, b: { label: string }) =>
    a.label.toLowerCase().localeCompare(b.label.toLowerCase())

// The Customer picker's first page, as POST /api/reports/param-options answers it:
// every customer, inactive ones included; a sub-customer is in its parent's group.
const parentName = (c: { parent: string }) =>
    CUSTOMERS.find(p => p.id === c.parent)?.display_name ?? ''

export const SALES_CUSTOMER_OPTIONS_PAGE: ParamOptionsPage = {
    options: CUSTOMERS.map(c => ({
        value: c.id,
        label: c.display_name,
        group: parentName(c),
    })).sort(byLabel),
    groups: [...new Set(CUSTOMERS.filter(c => c.parent).map(parentName))]
        .map(name => ({ value: name, label: name }))
        .sort(byLabel),
}

// The Product picker's first page: every product and service, inactive ones included,
// grouped by type; a bundle is never on a line, so `optionsFrom.where` leaves it out.
const LINE_PRODUCTS = [...PRODUCTS, ...INVOICE_PRODUCTS].filter(p => p.type !== 'bundle')

export const SALES_PRODUCT_OPTIONS_PAGE: ParamOptionsPage = {
    options: LINE_PRODUCTS.map(p => ({ value: p.id, label: p.name, group: p.type })).sort(byLabel),
    groups: [
        { value: 'non_inventory', label: PRODUCT_TYPE_LABELS.non_inventory },
        { value: 'service', label: PRODUCT_TYPE_LABELS.service },
    ],
}

// --- The figures, worked out by hand from the documents above (cents). An edit to a
// document that changes a sum must change these too. ---

export const SALES_REPORTS_TOTALS = {
    // The posted invoices' and sales receipts' Subtotals of the default period.
    documents: 1_813_525,
    // The posted credit memos' Subtotals of the default period.
    creditMemos: 23_900,
    // What both reports' Totals show.
    total: 1_789_625,
}

function check(name: string, actual: number | null, expected: number) {
    if (actual !== expected) {
        throw new Error(`sales-reports fixture: ${name} is ${actual}, not ${expected}`)
    }
}

function totalOf(result: RunResult, col: string): number | null {
    const cell = result.rows.find(row => row.kind === 'total')?.cells[col]
    return typeof cell === 'number' ? cell : null
}

const inDefaultPeriod = (d: SalesDocumentFixture) =>
    d.status === 'posted' && d.date >= SALES_REPORTS_FROM && d.date <= SALES_REPORTS_TO
const subtotalsOf = (isKind: (kind: SalesDocumentKind) => boolean) =>
    sum(SALES_DOCUMENTS.filter(d => inDefaultPeriod(d) && isKind(d.kind)).map(d => d.subtotal))

check(
    'documents',
    subtotalsOf(kind => kind !== 'credit_memo'),
    SALES_REPORTS_TOTALS.documents
)
check(
    'credit memos',
    subtotalsOf(kind => kind === 'credit_memo'),
    SALES_REPORTS_TOTALS.creditMemos
)
check(
    'Sales by Customer total',
    totalOf(salesByCustomerResult(), 'sales'),
    SALES_REPORTS_TOTALS.total
)
check(
    'Sales by Product total',
    totalOf(salesByProductResult(), 'amount'),
    SALES_REPORTS_TOTALS.total
)
check(
    'December 2025 total',
    totalOf(
        salesByCustomerResult({ from: SALES_REPORTS_ZERO_FROM, to: SALES_REPORTS_ZERO_TO }),
        'sales'
    ),
    0
)
