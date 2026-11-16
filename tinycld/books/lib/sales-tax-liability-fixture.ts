// Synthetic Sales Tax Liability for the helix reference route and the e2e seed. The
// agencies and rates are the seeded ones (tax-rates-fixture.ts), the customers the
// seeded customers (customer-form-fixture.ts). The run results are typed against core's
// report contract, so tsc checks every field. Money is integer cents.
//
// Each document carries the tax lines posting writes for it: one per tax component,
// with the figures frozen at posting (spec §3). The result below adds them as the
// shipped spec does on the server: by agency, then by rate, posted documents only.
import type { DisplayLayout, ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type {
    ParamOptionsPage,
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import type {
    BooksInvoices,
    BooksInvoiceTaxLines,
    BooksSalesReceipts,
    BooksSalesReceiptTaxLines,
} from '../types'
import { CUSTOMERS } from './customer-form-fixture'
import { SALES_TAX_LIABILITY_SHIPPED_KEY } from './shipped-reports'
import { TAX_AGENCIES, TAX_IDS, TAX_RATE_ROWS } from './tax-rates-fixture'

export { SALES_TAX_LIABILITY_SHIPPED_KEY }
export const SALES_TAX_LIABILITY_TITLE = 'Sales Tax Liability'
export const SALES_TAX_LIABILITY_DESCRIPTION =
    'The sales tax you charged on posted invoices and sales receipts, by agency and rate.'
// The Books source heading: the seeded business name (books-settings-fixture.ts).
export const SALES_TAX_LIABILITY_HEADING = 'Hartwell Supply Co.'
// "Today" for the reference captures, so the default Last month resolves to October.
export const SALES_TAX_LIABILITY_TODAY = '2026-11-14'
export const SALES_TAX_LIABILITY_FROM = '2026-10-01'
export const SALES_TAX_LIABILITY_TO = '2026-10-31'
const CURRENCY = 'USD'

// The params as the shipped spec declares them (server/report_sales_tax_liability.go
// builds the same list in Go; its test pins the Go side).
export const SALES_TAX_LIABILITY_PARAMS: ParamDef[] = [
    { id: 'period', type: 'dateRange', label: 'Period', default: { preset: 'lastMonth' } },
    // methodParam() in server/report_spec_helpers.go.
    {
        id: 'method',
        type: 'choice',
        label: 'Method',
        options: [
            { value: 'accrual', label: 'Accrual' },
            { value: 'cash', label: 'Cash' },
        ],
        default: 'accrual',
        header: '{label} basis',
    },
    {
        id: 'agencies',
        type: 'choice',
        label: 'Agency',
        multiple: true,
        optionsFrom: {
            source: 'books.tax_agencies',
            value: [{ field: 'id' }],
            label: [{ field: 'name' }],
        },
    },
]

// --- Documents and their tax lines (the posting snapshot). ---

export type SalesDocumentKind = 'invoice' | 'sales_receipt'

const KIND_LABELS: Record<SalesDocumentKind, string> = {
    invoice: 'Invoice',
    sales_receipt: 'Sales receipt',
}

type DocumentColumn = 'id' | 'status' | 'number' | 'sequence' | 'date' | 'subtotal' | 'currency'

// The columns invoices and sales receipts share, and an invoice's balance (0 on a
// sales receipt, which has none); the customer is named by its
// customer-form fixture id ('' for a sales receipt with no customer), which the seed
// maps to the created id, and the tax rate by its tax-rates fixture id.
export type SalesDocumentFixture = Pick<BooksInvoices, DocumentColumn | 'balance'> &
    Pick<BooksSalesReceipts, DocumentColumn> & {
        kind: SalesDocumentKind
        customer_fixture_id: string
        tax_rate: string
        /** The part of the subtotal the tax is computed on (the taxable lines). */
        taxable: number
    }

type TaxLineColumn =
    | 'component'
    | 'agency'
    | 'rate_ppm'
    | 'gross_amount'
    | 'taxable_amount'
    | 'amount'
    | 'currency'

export type SalesTaxLineFixture = Pick<BooksInvoiceTaxLines, TaxLineColumn> &
    Pick<BooksSalesReceiptTaxLines, TaxLineColumn>

function rateRow(id: string) {
    const row = TAX_RATE_ROWS.find(r => r.id === id)
    if (!row) throw new Error(`sales-tax-liability fixture: no seeded tax rate ${id}`)
    return row
}

function agencyRow(id: string) {
    const row = TAX_AGENCIES.find(a => a.id === id)
    if (!row) throw new Error(`sales-tax-liability fixture: no seeded agency ${id}`)
    return row
}

function customerName(id: string): string {
    if (id === '') return ''
    const row = CUSTOMERS.find(c => c.id === id)
    if (!row) throw new Error(`sales-tax-liability fixture: no seeded customer ${id}`)
    return row.display_name
}

// Posting rounds each component's tax to the cent, half away from zero.
export function componentTax(taxable: number, ratePpm: number): number {
    const exact = (taxable * ratePpm) / 1_000_000
    return Math.sign(exact) * Math.round(Math.abs(exact))
}

// A rate is its own one component; a group is its rates, in group order.
function componentsOf(rateId: string): string[] {
    const row = rateRow(rateId)
    return row.type === 'group' ? row.components : [row.id]
}

export function taxLinesOf(doc: SalesDocumentFixture): SalesTaxLineFixture[] {
    return componentsOf(doc.tax_rate).map(componentId => {
        const component = rateRow(componentId)
        return {
            component: component.id,
            agency: component.agency,
            rate_ppm: component.rate_ppm,
            gross_amount: doc.subtotal,
            taxable_amount: doc.taxable,
            amount: componentTax(doc.taxable, component.rate_ppm),
            currency: doc.currency,
        } satisfies SalesTaxLineFixture
    })
}

function doc(
    row: Pick<
        SalesDocumentFixture,
        'id' | 'kind' | 'number' | 'date' | 'customer_fixture_id' | 'tax_rate' | 'subtotal'
    > &
        Partial<SalesDocumentFixture>
): SalesDocumentFixture {
    const base: SalesDocumentFixture = {
        status: 'posted',
        sequence: Number(row.number),
        currency: CURRENCY,
        taxable: row.subtotal,
        balance: 0,
        ...row,
    }
    // What posting writes: a posted invoice is open for its total (no payment
    // applies to these); a draft, a void one and a sales receipt have no balance.
    if (base.kind !== 'invoice' || base.status !== 'posted') return base
    const tax = taxLinesOf(base).reduce((sum, line) => sum + line.amount, 0)
    return { ...base, balance: base.subtotal + tax }
}

// October 2026. Ids are valid PocketBase ids (15 lowercase letters and digits).
export const SALES_TAX_DOCUMENTS: SalesDocumentFixture[] = [
    // The inactive agency's inactive rate: shows like an active one (spec §3).
    doc({
        id: 'stlinv000001040',
        kind: 'invoice',
        number: '1040',
        date: '2026-10-02',
        customer_fixture_id: 'cust_bluef_0001',
        tax_rate: TAX_IDS.oldCountyRate,
        subtotal: 40_000,
    }),
    // A group rate whose components belong to two agencies; part of the sale is not taxable.
    doc({
        id: 'stlinv000001042',
        kind: 'invoice',
        number: '1042',
        date: '2026-10-06',
        customer_fixture_id: 'cust_harbor_001',
        tax_rate: TAX_IDS.denverCombined,
        subtotal: 125_000,
        taxable: 100_000,
    }),
    // An inactive rate of an active agency.
    doc({
        id: 'stlinv000001044',
        kind: 'invoice',
        number: '1044',
        date: '2026-10-09',
        customer_fixture_id: 'cust_delta_0001',
        tax_rate: TAX_IDS.retired,
        subtotal: 20_000,
    }),
    // A sales receipt with no customer: its label ends after the number.
    doc({
        id: 'stlrct000002015',
        kind: 'sales_receipt',
        number: '2015',
        date: '2026-10-14',
        customer_fixture_id: '',
        tax_rate: TAX_IDS.denverCombined,
        subtotal: 48_000,
    }),
    // Voided after posting: it drops out of the report.
    doc({
        id: 'stlinv000001046',
        kind: 'invoice',
        number: '1046',
        date: '2026-10-16',
        customer_fixture_id: 'cust_cedar_0001',
        tax_rate: TAX_IDS.denverCombined,
        subtotal: 75_000,
        status: 'void',
    }),
    doc({
        id: 'stlinv000001047',
        kind: 'invoice',
        number: '1047',
        date: '2026-10-20',
        customer_fixture_id: 'cust_aspen_0001',
        tax_rate: TAX_IDS.adamsCombined,
        subtotal: 230_000,
        taxable: 180_000,
    }),
    // 8.875% of 900.00 is 79.875: rounds half away from zero to 79.88.
    doc({
        id: 'stlinv000001051',
        kind: 'invoice',
        number: '1051',
        date: '2026-10-22',
        customer_fixture_id: 'cust_fox_000001',
        tax_rate: TAX_IDS.lodging,
        subtotal: 90_000,
    }),
    // A rate and no taxable line: its sales are Non-taxable, its tax 0.00.
    doc({
        id: 'stlinv000001053',
        kind: 'invoice',
        number: '1053',
        date: '2026-10-27',
        customer_fixture_id: 'cust_evrgr_0001',
        tax_rate: TAX_IDS.lodging,
        subtotal: 30_000,
        taxable: 0,
    }),
    // A 0% rate: taxable sales, tax 0.00.
    doc({
        id: 'stlrct000002019',
        kind: 'sales_receipt',
        number: '2019',
        date: '2026-10-28',
        customer_fixture_id: 'cust_chen_00001',
        tax_rate: TAX_IDS.foodExempt,
        subtotal: 64_000,
    }),
    // The longest rate name and the longest customer name: they truncate and wrap.
    doc({
        id: 'stlinv000001055',
        kind: 'invoice',
        number: '1055',
        date: '2026-10-29',
        customer_fixture_id: 'cust_stjud_0001',
        tax_rate: TAX_IDS.culturalDistrict,
        subtotal: 500_000,
    }),
    // A draft has no tax lines: posting writes them.
    doc({
        id: 'stlinv000001057',
        kind: 'invoice',
        number: '1057',
        date: '2026-10-30',
        customer_fixture_id: 'cust_grnt_00001',
        tax_rate: TAX_IDS.denverCombined,
        subtotal: 12_000,
        status: 'draft',
    }),
]

// The document the seed posts and then voids, so a dev book shows a void drop out.
export const SALES_TAX_LIABILITY_VOID_TARGET = 'stlinv000001046'

/** The memo the seed gives a fixture document. */
export function salesTaxLiabilitySeedMemo(id: string): string {
    return `Seed sales tax ${id}`
}

/** The `<date> · <Invoice|Sales receipt> <number>[ · <customer>]` label of a document row. */
export function documentLabel(d: SalesDocumentFixture): string {
    const head = `${d.date} · ${KIND_LABELS[d.kind]} ${d.number}`
    const customer = customerName(d.customer_fixture_id)
    return customer ? `${head} · ${customer}` : head
}

// --- The run result, as the shipped spec answers it on Accrual (the default Method). ---

export const SALES_TAX_LIABILITY_COLUMNS: ResultColumn[] = [
    { id: 'name', label: 'Tax name', type: 'text' },
    { id: 'gross', label: 'Gross total', type: 'money', aggregate: 'sum', currency: CURRENCY },
    { id: 'nontaxable', label: 'Non-taxable', type: 'money', aggregate: 'sum', currency: CURRENCY },
    { id: 'taxable', label: 'Taxable amount', type: 'money', aggregate: 'sum', currency: CURRENCY },
    { id: 'tax', label: 'Tax amount', type: 'money', aggregate: 'sum', currency: CURRENCY },
]

// The shipped spec's `display`: on a phone a row shows its label on a line of its own,
// then its figures two by two. Without it core's automatic lines cut a document label
// to a few characters beside Gross total. Four figures on one line do not fit a 390 px
// phone (core measured 374 px of row), so the figures take two lines. The one-line gate
// keeps the phone arrangement below 600 px.
export const SALES_TAX_LIABILITY_PHONE_LAYOUT: DisplayLayout = {
    width: 'mobile',
    tracks: 2,
    cells: [
        { col: 'name', line: 1, span: 2 },
        { col: 'gross', line: 2 },
        { col: 'nontaxable', line: 2 },
        { col: 'taxable', line: 3 },
        { col: 'tax', line: 3 },
    ],
}

export const SALES_TAX_LIABILITY_DISPLAY: NonNullable<ReportSpec['display']> = {
    oneLine: { minWidth: '600px' },
    // No max-content floor on the figures: four of them with their headings do not fit
    // one 390 px line, and core then falls back to its automatic lines.
    columns: { name: { minWidth: '12ch' } },
    layouts: [SALES_TAX_LIABILITY_PHONE_LAYOUT],
}

/** What the view reads of the spec's groups: agencies open, rates closed, both with totals. */
export const SALES_TAX_LIABILITY_GROUPS = [
    { subtotals: true, open: true },
    { subtotals: true, open: false },
]
export const SALES_TAX_LIABILITY_VIEW_SPEC = { groups: SALES_TAX_LIABILITY_GROUPS }

interface Figures {
    gross: number
    nontaxable: number
    taxable: number
    tax: number
}

interface Charged {
    doc: SalesDocumentFixture
    line: SalesTaxLineFixture
}

const keyId = (prefix: string, key: unknown[]) => `${prefix}:${JSON.stringify(key)}`
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

function figuresOf(lines: readonly SalesTaxLineFixture[]): Figures {
    return lines.reduce<Figures>(
        (sum, line) => ({
            gross: sum.gross + line.gross_amount,
            nontaxable: sum.nontaxable + line.gross_amount - line.taxable_amount,
            taxable: sum.taxable + line.taxable_amount,
            tax: sum.tax + line.amount,
        }),
        { gross: 0, nontaxable: 0, taxable: 0, tax: 0 }
    )
}

const salesCells = (f: Figures) => ({
    gross: f.gross,
    nontaxable: f.nontaxable,
    taxable: f.taxable,
    tax: f.tax,
})

// blankAbove "byRate" (core G2): above the rate level only the tax shows.
const taxOnlyCells = (tax: number | null) => ({
    gross: null,
    nontaxable: null,
    taxable: null,
    tax,
})

/** Every tax line of a posted document in the period, under the Agency filter. */
export function chargedLines(input: { from: string; to: string; agencies?: string[] }): Charged[] {
    return SALES_TAX_DOCUMENTS.filter(
        d => d.status === 'posted' && d.date >= input.from && d.date <= input.to
    ).flatMap(d =>
        taxLinesOf(d)
            .filter(line => !input.agencies || input.agencies.includes(line.agency))
            .map(line => ({ doc: d, line }))
    )
}

// The rates only this fixture charges: no other seed or spec charges them in October
// 2026, so an e2e may assert their exact figures on the shared database (plan D1).
export const SALES_TAX_LIABILITY_OWN_RATES = [
    TAX_IDS.oldCountyRate,
    TAX_IDS.adams,
    TAX_IDS.retired,
    TAX_IDS.lodging,
    TAX_IDS.foodExempt,
    TAX_IDS.culturalDistrict,
] as const

/** A rate row's four figures in October (cents): the posted tax lines of that component. */
export function salesTaxRateFigures(rateId: string): Figures {
    const lines = chargedLines({ from: SALES_TAX_LIABILITY_FROM, to: SALES_TAX_LIABILITY_TO })
        .map(c => c.line)
        .filter(line => line.component === rateId)
    return figuresOf(lines)
}

const KIND_ROUTES: Record<SalesDocumentKind, string> = {
    invoice: 'books/invoices',
    sales_receipt: 'books/sales-receipts',
}

/** The path a document row opens, as the spec's `detail.open` answers it. */
const documentOpen = (d: SalesDocumentFixture) => `${KIND_ROUTES[d.kind]}/${d.id}`

function documentRows(charged: Charged[], section: string): ResultRow[] {
    const sorted = [...charged].sort(
        (a, b) => a.doc.date.localeCompare(b.doc.date) || a.doc.sequence - b.doc.sequence
    )
    return sorted.map(({ doc: d, line }) => ({
        id: `d:${d.id}:${line.component}`,
        kind: 'detail',
        depth: 2,
        label: documentLabel(d),
        open: documentOpen(d),
        section,
        cells: salesCells(figuresOf([line])),
    }))
}

function rateRows(agencyId: string, charged: Charged[], openRate: string | undefined) {
    const section = keyId('g', [agencyId, CURRENCY])
    const rates = [...new Set(charged.map(c => c.line.component))].map(rateRow).sort(byName)
    return rates.flatMap(rate => {
        const under = charged.filter(c => c.line.component === rate.id)
        const key = [agencyId, rate.id, CURRENCY]
        const id = keyId('g', key)
        const figures = salesCells(figuresOf(under.map(c => c.line)))
        const isOpen = rate.id === openRate
        const head: ResultRow = {
            id,
            kind: 'group',
            depth: 1,
            level: 2,
            label: rate.name,
            section,
            groupKey: key,
            expanded: isOpen,
            canExpand: true,
            cells: { name: rate.name, ...figures },
        }
        if (!isOpen) return [head]
        const subtotal: ResultRow = {
            id: keyId('s', key),
            kind: 'subtotal',
            depth: 1,
            level: 2,
            label: `Total ${rate.name}`,
            section: id,
            groupKey: key,
            cells: figures,
        }
        return [head, ...documentRows(under, id), subtotal]
    })
}

function agencyRows(charged: Charged[], input: SalesTaxLiabilityInput): ResultRow[] {
    const agencies = [...new Set(charged.map(c => c.line.agency))].map(agencyRow).sort(byName)
    return agencies.flatMap(agency => {
        const under = charged.filter(c => c.line.agency === agency.id)
        const key = [agency.id, CURRENCY]
        const id = keyId('g', key)
        const cells = taxOnlyCells(figuresOf(under.map(c => c.line)).tax)
        const isOpen = !input.isCollapsed
        const head: ResultRow = {
            id,
            kind: 'group',
            depth: 0,
            level: 1,
            label: agency.name,
            groupKey: key,
            expanded: isOpen,
            canExpand: true,
            cells: { name: agency.name, ...cells },
        }
        if (!isOpen) return [head]
        const subtotal: ResultRow = {
            id: keyId('s', key),
            kind: 'subtotal',
            depth: 0,
            level: 1,
            label: `Total ${agency.name}`,
            section: id,
            groupKey: key,
            cells,
        }
        return [head, ...rateRows(agency.id, under, input.openRate), subtotal]
    })
}

export interface SalesTaxLiabilityInput {
    from?: string
    to?: string
    /** Agency ids the Agency filter keeps; absent: every agency. */
    agencies?: string[]
    /** The rate (component) id whose group is open. */
    openRate?: string
    /** Collapse all: the agencies closed too. */
    isCollapsed?: boolean
}

export function salesTaxLiabilityResult(input: SalesTaxLiabilityInput = {}): RunResult {
    const from = input.from ?? SALES_TAX_LIABILITY_FROM
    const to = input.to ?? SALES_TAX_LIABILITY_TO
    const charged = chargedLines({ from, to, agencies: input.agencies })
    const total: ResultRow = {
        id: keyId('total', [CURRENCY]),
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: taxOnlyCells(charged.length ? figuresOf(charged.map(c => c.line)).tax : null),
    }
    const agencies: ResolvedParam = input.agencies
        ? { id: 'agencies', type: 'choice', list: input.agencies }
        : { id: 'agencies', type: 'choice', unset: true }
    return {
        columns: SALES_TAX_LIABILITY_COLUMNS,
        rows: [...agencyRows(charged, input), total],
        notices: [],
        topics: [
            'collection/books_invoice_tax_lines',
            'collection/books_sales_receipt_tax_lines',
            'collection/books_cash_basis_tax_lines',
            'collection/books_invoices',
            'collection/books_sales_receipts',
            'collection/books_tax_rates',
            'collection/books_tax_agencies',
            'collection/books_customers',
        ],
        heading: SALES_TAX_LIABILITY_HEADING,
        page: null,
        params: [
            { id: 'period', type: 'dateRange', from, to },
            { id: 'method', type: 'choice', value: 'accrual' },
            agencies,
        ],
        headerLines: ['Accrual basis'],
    }
}

// A month with no posted taxed sale: only the Total row, so the view is empty.
export const SALES_TAX_LIABILITY_EMPTY_FROM = '2026-09-01'
export const SALES_TAX_LIABILITY_EMPTY_TO = '2026-09-30'

export function emptySalesTaxLiabilityResult(): RunResult {
    return salesTaxLiabilityResult({
        from: SALES_TAX_LIABILITY_EMPTY_FROM,
        to: SALES_TAX_LIABILITY_EMPTY_TO,
    })
}

// The Agency picker's first page, as POST /api/reports/param-options answers it:
// inactive agencies included (spec §3).
export const AGENCY_OPTIONS_PAGE: ParamOptionsPage = {
    options: [...TAX_AGENCIES].sort(byName).map(a => ({ value: a.id, label: a.name })),
    groups: [],
}

// October's tax by agency, worked out by hand from the documents above (each component
// rounded on its own). An edit to a document that changes a sum must change these too.
export const SALES_TAX_LIABILITY_TOTALS = {
    [TAX_IDS.denver]: 15_807,
    [TAX_IDS.colorado]: 12_867,
    [TAX_IDS.oldCounty]: 500,
    total: 29_174,
}

for (const [agency, expected] of Object.entries(SALES_TAX_LIABILITY_TOTALS)) {
    const agencies = agency === 'total' ? undefined : [agency]
    const lines = chargedLines({
        from: SALES_TAX_LIABILITY_FROM,
        to: SALES_TAX_LIABILITY_TO,
        agencies,
    }).map(c => c.line)
    if (figuresOf(lines).tax !== expected) {
        throw new Error(`sales-tax-liability fixture: ${agency} tax is not ${expected}`)
    }
}
