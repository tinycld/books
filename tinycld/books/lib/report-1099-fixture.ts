// Synthetic 1099 Summary and Detail for the helix reference route
// (docs/specs/report-1099-design.md). The vendors are the seeded ones with their 1099
// columns (vendor-1099-fixture.ts), so names, legal names, tracking and inactive marks
// are typed against the generated `BooksVendors`; the boxes are typed against
// `Box1099Key`, and the threshold is the seeded setting. The run results are typed
// against core's report contract, so tsc checks every field. Money is integer cents.
import type { DisplayLayout, ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type {
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
} from '@tinycld/core/reports/lib/types'
import type {
    BooksExpenseLines,
    BooksExpenses,
    BooksJournalEntries,
    BooksJournalLines,
} from '../types'
import { BOX_1099_KEYS, type Box1099Key, box1099Label } from './form-1099'
import { SETTINGS_1099, VENDORS_1099, type Vendor1099Row } from './vendor-1099-fixture'

export const REPORT_1099_HEADING = 'Harbor Lane Design LLC'
export const REPORT_1099_TITLE = '1099 Summary and Detail'
// The shipped report's description (spec §2).
export const REPORT_1099_DESCRIPTION =
    'Payments to each 1099 vendor by box for a calendar year, without card payments, against your 1099 threshold.'
// "Today" for the reference captures. The default Period is This calendar year: January 1
// to December 31, whatever the fiscal year start is.
export const REPORT_1099_TODAY = '2026-11-21'
export const REPORT_1099_FROM = '2026-01-01'
export const REPORT_1099_TO = '2026-12-31'
// Last calendar year holds one payment, below the threshold: under the default Show no
// vendor has a row, so the report is empty.
export const REPORT_1099_EMPTY_FROM = '2025-01-01'
export const REPORT_1099_EMPTY_TO = '2025-12-31'
// The labels of the calendar-year presets (core extension E1).
export const REPORT_1099_PERIOD_LABELS = {
    thisCalendarYear: 'This calendar year',
    lastCalendarYear: 'Last calendar year',
}
// The document header line that prints the threshold the run read (core extension E2):
// "1099 threshold: {value}", the value written as an export writes an amount.
export const REPORT_1099_THRESHOLD_LINE = `1099 threshold: $${(
    SETTINGS_1099.threshold_1099 / 100
).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

const CURRENCY = 'USD'
const INACTIVE_SUFFIX = ' (inactive)'
const CARD_SUFFIX = ' · paid by card'

export type ShowChoice = 'meets' | 'below' | 'tracked' | 'untracked'
export type FormChoice = 'all' | 'nec' | 'misc'
export type OrderChoice = 'name' | 'amount'

const SHOW_LABELS: Record<ShowChoice, string> = {
    meets: 'At or above the threshold',
    below: 'Below the threshold',
    tracked: 'All 1099 vendors',
    untracked: 'Not tracked for 1099',
}
const FORM_LABELS: Record<FormChoice, string> = {
    all: 'NEC and MISC',
    nec: '1099-NEC',
    misc: '1099-MISC',
}

const optionsOf = <T extends string>(labels: Record<T, string>) =>
    (Object.keys(labels) as T[]).map(value => ({ value, label: labels[value] }))

// The params as the shipped spec declares them (spec §4; server/report_form_1099.go builds
// the same list in Go). The Period default is a preset of core extension E1: until
// checkpoint 0 lands, core reads this default as no default.
export const REPORT_1099_PARAMS: ParamDef[] = [
    {
        id: 'period',
        type: 'dateRange',
        label: 'Period',
        default: { preset: 'thisCalendarYear' },
    },
    {
        id: 'show',
        type: 'choice',
        label: 'Show',
        options: optionsOf(SHOW_LABELS),
        default: 'meets',
        header: 'Vendors: {label}',
    },
    {
        id: 'form',
        type: 'choice',
        label: 'Form',
        options: optionsOf(FORM_LABELS),
        default: 'all',
        header: 'Form: {label}',
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
            { value: 'amount', label: 'Largest reportable' },
        ],
        default: 'name',
    },
]

// What the view reads of the spec's groups: the vendor level is open when the report
// opens, the box level is closed; neither ends in a subtotal row.
export const REPORT_1099_GROUPS: { subtotals?: boolean; open: boolean }[] = [
    { open: true },
    { open: false },
]

// A phone row: the label on line 1, Reportable, Excluded and All payments on line 2.
export const REPORT_1099_PHONE_LAYOUT: DisplayLayout = {
    width: 'mobile',
    tracks: 3,
    cells: [
        { col: 'name', line: 1, span: 3 },
        { col: 'reportable', line: 2 },
        { col: 'excluded', line: 2 },
        { col: 'all', line: 2 },
    ],
}

// The display block of the shipped spec (spec §4): a long vendor label and a payment's
// label wrap to three lines and a figure is never cut. `oneLine.minWidth` is the row
// width phase 3 pass 2 measured with this fixture's rows (the helix ledger, Phase notes,
// has the figures).
export const REPORT_1099_DISPLAY: NonNullable<ReportSpec['display']> = {
    oneLine: { minWidth: '760px' },
    columns: {
        name: { whiteSpace: 'normal', lineClamp: 3 },
        reportable: { minWidth: 'max-content' },
        excluded: { minWidth: 'max-content' },
        all: { minWidth: 'max-content' },
    },
    layouts: [REPORT_1099_PHONE_LAYOUT],
}

export const REPORT_1099_COLUMNS: ResultColumn[] = [
    {
        id: 'name',
        label: 'Vendor',
        type: 'relation',
        labelCell: 'name@label',
        labelType: 'text',
    },
    { id: 'reportable', label: 'Reportable', type: 'money', aggregate: 'sum', currency: CURRENCY },
    { id: 'excluded', label: 'Excluded', type: 'money', currency: CURRENCY },
    { id: 'all', label: 'All payments', type: 'money', aggregate: 'sum', currency: CURRENCY },
]

type BoxKey = Box1099Key | ''

// Expense accounts as Books `accountLabel()` writes them ("<number> <full name>", or the
// full name alone for an account with no number), each with its 1099 box as it is when
// the report runs.
const ACCOUNTS = {
    subcontractors: { label: '5100 Cost of goods sold:Subcontractors', box: 'nec_1' },
    design: { label: '6210 Software Subscriptions:Design Tools', box: 'nec_1' },
    legal: { label: '6300 Legal and professional fees', box: 'nec_1' },
    settlements: {
        label: '6310 Legal and professional fees:Settlements paid through counsel',
        box: 'misc_10',
    },
    rent: { label: '6100 Rent', box: 'misc_1' },
    software: { label: '6200 Software Subscriptions', box: '' },
    travel: {
        label: 'Travel, lodging and conference registration for the annual partner summit',
        box: '',
    },
} satisfies Record<string, { label: string; box: BoxKey }>

type AccountKey = keyof typeof ACCOUNTS

// One payment row (spec §3 What counts): a posted ledger line of an expense or a journal
// entry, or a cash-basis share row that names its payment's entry.
interface Payment {
    id: string
    date: string
    /** "<type> <number>", as `entryTypeNumber()` gives it. */
    doc: string
    account: AccountKey
    description: string
    /** Debit minus credit, in cents: a refund is below zero. */
    net: number
    /** The payment's entry carries `card_payment`. */
    card: boolean
    /** The app path the row opens (Books entryOpenPath()). */
    open: string
}

const pad = (n: number) => String(n).padStart(5, '0')

type Paid = 'check' | 'card'

// An expense counts on its date, which is its payment date.
const expense = (
    number: number,
    date: string,
    account: AccountKey,
    description: string,
    net: number,
    paid: Paid = 'check'
): Payment => ({
    id: `f9exp${pad(number)}`,
    date,
    doc: `Expense ${number}`,
    account,
    description,
    net,
    card: paid === 'card',
    open: `books/expenses/f9expense0${pad(number)}`,
})

// The share of a bill's line that a bill payment paid, on the payment's date
// (server/cash_basis.go: "Bill %s paid (cash basis)").
const billPaid = (
    number: number,
    date: string,
    bill: number,
    account: AccountKey,
    net: number,
    paid: Paid = 'check'
): Payment => ({
    id: `f9pay${pad(number)}b${bill}`,
    date,
    doc: `Bill payment ${number}`,
    account,
    description: `Bill ${bill} paid (cash basis)`,
    net,
    card: paid === 'card',
    open: `books/bill-payments/f9payment0${pad(number)}`,
})

// The share of a vendor credit's line that a vendor refund paid back, below zero, on the
// refund's date. The memo is this fixture's guess: phase 4 reads the refund payer's
// memo in server/document_balance.go and pins it with a Go run.
const refunded = (
    number: number,
    date: string,
    credit: number,
    account: AccountKey,
    net: number
): Payment => ({
    id: `f9ref${pad(number)}c${credit}`,
    date,
    doc: `Vendor refund ${number}`,
    account,
    description: `Vendor credit ${credit} refunded (cash basis)`,
    net: -net,
    card: false,
    open: `books/vendor-refunds/f9refund00${pad(number)}`,
})

// A journal entry line that names a vendor counts on the entry's date and is never a card
// payment.
const journal = (
    number: number,
    date: string,
    account: AccountKey,
    description: string,
    net: number
): Payment => ({
    id: `f9jnl${pad(number)}`,
    date,
    doc: `Journal entry JE-${number}`,
    account,
    description,
    net,
    card: false,
    open: `books/entries/f9entry000${pad(number)}`,
})

const WILLAMETTE = 'Willamette Valley Commercial Cleaning and Janitorial Services Cooperative'
const OKAFOR = 'Jamal Okafor'
const KEYSTONE = 'Keystone Legal Group'
const GREENLINE = 'Greenline Landscaping'
const OLD_TOWN = 'Old Town Print Shop'
const METRO = 'Metro Commercial Properties'
const OFFICE_SUPPLY = 'Office Supply World'
const SUMMIT = 'Summit IT Services'

// Payment rows per vendor, in posting order. Not here, because the report does not read
// them: a bill's and a vendor credit's own ledger lines and the cash-basis rows that take
// them out (they add up to zero), drafts, void documents, payments that name no vendor,
// and payments on accounts that are not expense accounts.
//
// The edges of the default period (calendar year 2026): a vendor with three figures of
// eight digits, a card payment of a bill, a card expense with a long description and a
// payment on an account with no box and a long name (Willamette, whose label also holds a
// long legal name); a vendor a card payment keeps near the threshold (Jamal Okafor, legal
// name with a middle initial); a vendor with two boxes and a journal entry line (Keystone
// Legal Group); a vendor below the threshold with a refund below zero and no legal name
// (Greenline Landscaping); an inactive vendor exactly at the threshold (Old Town Print
// Shop); three vendors that are not tracked: one paid on an account with a box (Metro
// Commercial Properties), two on accounts with none (Office Supply World, Summit IT
// Services, by card); a payment of last calendar year (Keystone Legal Group).
const PAYMENTS: Record<string, Payment[]> = {
    [WILLAMETTE]: [
        billPaid(305, '2026-09-04', 1029, 'subcontractors', 987525),
        billPaid(318, '2026-11-06', 1046, 'subcontractors', 11824000, 'card'),
        expense(
            83,
            '2026-11-10',
            'subcontractors',
            'Studio build-out cleaning and floor restoration, including the loading dock and both stairwells',
            245000,
            'card'
        ),
        expense(80, '2026-11-12', 'travel', 'Crew lodging', 61275),
        billPaid(322, '2026-11-18', 1061, 'subcontractors', 10430000),
    ],
    [OKAFOR]: [
        billPaid(308, '2026-08-10', 1038, 'design', 146000),
        expense(77, '2026-10-03', 'design', 'Photo retouching, rush', 85000),
        expense(79, '2026-10-21', 'design', 'Location shoot', 64000, 'card'),
    ],
    [KEYSTONE]: [
        billPaid(291, '2025-12-29', 1009, 'legal', 90000),
        billPaid(309, '2026-08-20', 1036, 'legal', 320000),
        expense(72, '2026-09-15', 'settlements', 'Settlement paid through counsel', 750000),
        journal(21, '2026-10-31', 'legal', 'Retainer moved from prepaid expenses', 40000),
    ],
    [GREENLINE]: [
        billPaid(311, '2026-09-12', 1050, 'subcontractors', 184000),
        refunded(4, '2026-10-20', 3, 'subcontractors', 63500),
    ],
    [OLD_TOWN]: [
        expense(58, '2026-02-18', 'subcontractors', 'Brochure print run', 125000),
        expense(60, '2026-03-11', 'subcontractors', 'Trade show banners', 75000),
    ],
    [METRO]: [
        billPaid(301, '2026-08-01', 1033, 'rent', 450000),
        billPaid(306, '2026-09-01', 1040, 'rent', 450000),
        billPaid(314, '2026-10-01', 1045, 'rent', 450000),
        billPaid(316, '2026-11-02', 1051, 'rent', 450000),
    ],
    [OFFICE_SUPPLY]: [expense(66, '2026-08-14', 'software', 'Label printer licence', 8950)],
    [SUMMIT]: [expense(71, '2026-09-09', 'software', 'Emergency on-site repair', 42000, 'card')],
}

type Vendor1099 = Pick<
    Vendor1099Row,
    'id' | 'display_name' | 'inactive' | 'track_1099' | 'legal_name'
>

function vendor(name: string): Vendor1099 {
    const found = VENDORS_1099.find(v => v.display_name === name)
    if (!found) throw new Error(`report-1099 fixture: no seeded vendor ${name}`)
    return {
        id: found.id,
        display_name: found.display_name,
        inactive: found.inactive,
        track_1099: found.track_1099,
        legal_name: found.legal_name,
    } satisfies Vendor1099
}

export interface Report1099Input {
    from?: string
    to?: string
    show?: ShowChoice
    form?: FormChoice
    order?: OrderChoice
    /** Vendor names the Vendor filter keeps. */
    vendors?: string[]
    /** Vendor names closed to one row (every other vendor is open to its boxes). */
    closed?: string[]
    /** Boxes opened into their payments, as "<vendor name>|<box key>" ('' = Not reported). */
    openBoxes?: string[]
}

interface BoxPayments {
    box: BoxKey
    /** The payments the run's filter keeps, in date order, then posting order. */
    payments: Payment[]
}

interface VendorPayments {
    vendor: Vendor1099
    boxes: BoxPayments[]
}

const sum = (values: number[]) => values.reduce((a, v) => a + v, 0)
const boxOf = (payment: Payment): BoxKey => ACCOUNTS[payment.account].box
const isReportable = (payment: Payment) => boxOf(payment) !== '' && !payment.card

interface Figures {
    reportable: number
    excluded: number
    all: number
}

function figuresOf(payments: Payment[]): Figures {
    const all = sum(payments.map(payment => payment.net))
    const reportable = sum(payments.filter(isReportable).map(payment => payment.net))
    return { reportable, excluded: all - reportable, all }
}

// Excluded is blank when zero.
const figureCells = ({ reportable, excluded, all }: Figures) => ({
    reportable,
    excluded: excluded === 0 ? null : excluded,
    all,
})

const FORM_BOXES: Record<FormChoice, readonly BoxKey[]> = {
    all: [...BOX_1099_KEYS, ''],
    nec: ['nec_1'],
    misc: BOX_1099_KEYS.filter(key => key !== 'nec_1'),
}

// The boxes in the order of the box list, Not reported last.
const BOX_ORDER: readonly BoxKey[] = [...BOX_1099_KEYS, '']

// The period and the Form choice: with a form picked, rows of the other form's boxes and
// of accounts with no box are left out. The sort is stable, so payments of one day keep
// posting order.
function kept(payments: Payment[], input: Report1099Input): Payment[] {
    const from = input.from ?? REPORT_1099_FROM
    const to = input.to ?? REPORT_1099_TO
    const boxes = FORM_BOXES[input.form ?? 'all']
    return payments
        .filter(payment => payment.date >= from && payment.date <= to)
        .filter(payment => boxes.includes(boxOf(payment)))
        .sort((a, b) => a.date.localeCompare(b.date))
}

function vendorPaymentsOf(name: string, input: Report1099Input): VendorPayments {
    const payments = kept(PAYMENTS[name] ?? [], input)
    const boxes = BOX_ORDER.map(box => ({
        box,
        payments: payments.filter(payment => boxOf(payment) === box),
    })).filter(entry => entry.payments.length > 0)
    return { vendor: vendor(name), boxes }
}

const paymentsOf = (row: VendorPayments) => row.boxes.flatMap(entry => entry.payments)
const reportableOf = (row: VendorPayments) => figuresOf(paymentsOf(row)).reportable

// The vendor level's `having`: one threshold against the vendor's Reportable across the
// boxes of the run; a vendor exactly at the threshold is at or above it.
function isShown(row: VendorPayments, show: ShowChoice): boolean {
    if (show === 'untracked') return !row.vendor.track_1099
    if (!row.vendor.track_1099) return false
    if (show === 'tracked') return true
    const meets = reportableOf(row) >= SETTINGS_1099.threshold_1099
    return show === 'meets' ? meets : !meets
}

// A vendor with no payment row in the period has no row.
function shownVendors(input: Report1099Input): VendorPayments[] {
    const picked = input.vendors
    return Object.keys(PAYMENTS)
        .map(name => vendorPaymentsOf(name, input))
        .filter(row => row.boxes.length > 0)
        .filter(row => isShown(row, input.show ?? 'meets'))
        .filter(row => !picked || picked.includes(row.vendor.display_name))
}

const byName = (a: VendorPayments, b: VendorPayments) =>
    a.vendor.display_name.toLowerCase().localeCompare(b.vendor.display_name.toLowerCase())

// Name: by name, ignoring case. Largest reportable: by Reportable, largest first, then by
// name.
function ordered(shown: VendorPayments[], order: OrderChoice): VendorPayments[] {
    const named = [...shown].sort(byName)
    if (order === 'name') return named
    return named.sort((a, b) => reportableOf(b) - reportableOf(a))
}

const groupId = (key: string[]) => `g:${JSON.stringify([...key, CURRENCY])}`

// The name, " (inactive)" when inactive, " (legal name: …)" when the vendor has a legal
// name that differs from its name, ignoring case.
function vendorLabel({ display_name, inactive, legal_name }: Vendor1099): string {
    const hasLegalName =
        legal_name !== '' && legal_name.toLowerCase() !== display_name.toLowerCase()
    const inactivePart = inactive ? INACTIVE_SUFFIX : ''
    const legalPart = hasLegalName ? ` (legal name: ${legal_name})` : ''
    return `${display_name}${inactivePart}${legalPart}`
}

// form1099DetailLabel(): "<date> · <type> <number> · <account> · <description>", then
// " · paid by card" on a card payment.
function paymentLabel(payment: Payment): string {
    const parts = [payment.date, payment.doc, ACCOUNTS[payment.account].label, payment.description]
    const label = parts.filter(part => part !== '').join(' · ')
    return payment.card ? `${label}${CARD_SUFFIX}` : label
}

function paymentRows(entry: BoxPayments, section: string): ResultRow[] {
    return entry.payments.map(payment => ({
        id: `d:${payment.id}`,
        kind: 'detail',
        depth: 2,
        label: paymentLabel(payment),
        section,
        open: payment.open,
        cells: figureCells(figuresOf([payment])),
    }))
}

export const boxOpenKey = (vendorName: string, box: BoxKey) => `${vendorName}|${box}`

function boxRows(entry: BoxPayments, row: VendorPayments, input: Report1099Input): ResultRow[] {
    const { id, display_name } = row.vendor
    const isOpen = input.openBoxes?.includes(boxOpenKey(display_name, entry.box)) === true
    const boxRow: ResultRow = {
        id: groupId([id, entry.box]),
        kind: 'group',
        depth: 1,
        level: 2,
        label: box1099Label(entry.box),
        section: groupId([id]),
        groupKey: [id, entry.box, CURRENCY],
        expanded: isOpen,
        canExpand: true,
        cells: figureCells(figuresOf(entry.payments)),
    }
    return isOpen ? [boxRow, ...paymentRows(entry, boxRow.id)] : [boxRow]
}

function vendorRows(row: VendorPayments, input: Report1099Input): ResultRow[] {
    const { id, display_name, inactive } = row.vendor
    const isOpen = input.closed?.includes(display_name) !== true
    const label = vendorLabel(row.vendor)
    const vendorRow: ResultRow = {
        id: groupId([id]),
        kind: 'group',
        depth: 0,
        level: 1,
        label,
        groupKey: [id, CURRENCY],
        expanded: isOpen,
        canExpand: true,
        cells: { name: id, 'name@label': label, ...figureCells(figuresOf(paymentsOf(row))) },
        ...(inactive ? { muted: true } : {}),
    }
    if (!isOpen) return [vendorRow]
    return [vendorRow, ...row.boxes.flatMap(entry => boxRows(entry, row, input))]
}

// The Total adds the vendors the report shows.
function totalRow(shown: VendorPayments[]): ResultRow {
    return {
        id: `total:${JSON.stringify([CURRENCY])}`,
        kind: 'total',
        depth: 0,
        label: 'Total',
        cells: figureCells(figuresOf(shown.flatMap(paymentsOf))),
    }
}

function resolvedParams(input: Report1099Input): ResolvedParam[] {
    const vendors: ResolvedParam = input.vendors
        ? { id: 'vendors', type: 'choice', list: input.vendors.map(name => vendor(name).id) }
        : { id: 'vendors', type: 'choice', unset: true }
    return [
        {
            id: 'period',
            type: 'dateRange',
            from: input.from ?? REPORT_1099_FROM,
            to: input.to ?? REPORT_1099_TO,
        },
        { id: 'show', type: 'choice', value: input.show ?? 'meets' },
        { id: 'form', type: 'choice', value: input.form ?? 'all' },
        vendors,
        { id: 'order', type: 'choice', value: input.order ?? 'name' },
    ]
}

// One line per choice param with a `header`, in param order ('' for an unset Vendor), then
// the threshold line of the spec's `header` (E2).
function headerLines(input: Report1099Input): string[] {
    const picks = input.vendors ?? []
    return [
        `Vendors: ${SHOW_LABELS[input.show ?? 'meets']}`,
        `Form: ${FORM_LABELS[input.form ?? 'all']}`,
        picks.length > 0 ? `Vendor: ${picks.join(', ')}` : '',
        REPORT_1099_THRESHOLD_LINE,
    ]
}

export function report1099Result(input: Report1099Input = {}): RunResult {
    const shown = ordered(shownVendors(input), input.order ?? 'name')
    return {
        columns: REPORT_1099_COLUMNS,
        rows: [...shown.flatMap(row => vendorRows(row, input)), totalRow(shown)],
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
        heading: REPORT_1099_HEADING,
        page: null,
        params: resolvedParams(input),
    }
}

// Last calendar year: the one payment is below the threshold, so no vendor has a row and
// only the Total row is left: the view is empty.
export function emptyReport1099Result(): RunResult {
    const input = { from: REPORT_1099_EMPTY_FROM, to: REPORT_1099_EMPTY_TO }
    return { ...report1099Result(input), rows: [totalRow([])] }
}

// The Vendor filter of the `filtered` state: two vendors, so the chip names both.
export const REPORT_1099_FILTER_PICK = [vendor(OKAFOR), vendor(KEYSTONE)]

// The boxes the `opened` state opens: the box with a bill payment by check, one by card
// and a card expense with a long description; the Not reported row; a second vendor's
// two boxes, with a journal entry line.
export const REPORT_1099_OPENED = [
    boxOpenKey(WILLAMETTE, 'nec_1'),
    boxOpenKey(WILLAMETTE, ''),
    boxOpenKey(KEYSTONE, 'nec_1'),
    boxOpenKey(KEYSTONE, 'misc_10'),
]

// The box the Below the threshold state opens: a refund below zero.
export const REPORT_1099_BELOW_OPENED = [boxOpenKey(GREENLINE, 'nec_1')]

// --- The figures, worked out by hand from the payments above (cents). An edit to a
// payment that changes a sum must change these too. ---

export const REPORT_1099_TOTALS = {
    // The default run: Jamal Okafor, Keystone Legal Group, Old Town Print Shop (exactly
    // 2,000.00) and Willamette.
    meets: { reportable: 12_958_525, excluded: 12_194_275, all: 25_152_800 },
    // Greenline Landscaping alone: 1,840.00 − 635.00.
    below: { reportable: 120_500, excluded: 0, all: 120_500 },
    tracked: { reportable: 13_079_025, excluded: 12_194_275, all: 25_273_300 },
    // Metro Commercial Properties on a box; Office Supply World and Summit IT Services on
    // accounts with none.
    untracked: { reportable: 1_800_000, excluded: 50_950, all: 1_850_950 },
    // 1099-NEC: Willamette loses its Not reported row, Keystone its MISC 10 box.
    nec: { reportable: 12_208_525, excluded: 12_133_000, all: 24_341_525 },
    // 1099-MISC: Keystone Legal Group's MISC 10 box alone.
    misc: { reportable: 750_000, excluded: 0, all: 750_000 },
    // Willamette: three figures of eight digits.
    willamette: { reportable: 11_417_525, excluded: 12_130_275, all: 23_547_800 },
}

function check(name: string, row: ResultRow | undefined, expected: Figures) {
    const actual = [row?.cells.reportable, row?.cells.excluded ?? 0, row?.cells.all]
    const wanted = [expected.reportable, expected.excluded, expected.all]
    if (actual.join() !== wanted.join()) {
        throw new Error(`report-1099 fixture: ${name} is ${actual.join()}, not ${wanted.join()}`)
    }
}

const totalOf = (result: RunResult) => result.rows.find(row => row.kind === 'total')

check('At or above total', totalOf(report1099Result()), REPORT_1099_TOTALS.meets)
check('Below total', totalOf(report1099Result({ show: 'below' })), REPORT_1099_TOTALS.below)
check(
    'All 1099 vendors total',
    totalOf(report1099Result({ show: 'tracked' })),
    REPORT_1099_TOTALS.tracked
)
check(
    'Not tracked total',
    totalOf(report1099Result({ show: 'untracked' })),
    REPORT_1099_TOTALS.untracked
)
check('1099-NEC total', totalOf(report1099Result({ form: 'nec' })), REPORT_1099_TOTALS.nec)
check('1099-MISC total', totalOf(report1099Result({ form: 'misc' })), REPORT_1099_TOTALS.misc)
check(
    'Willamette',
    report1099Result().rows.find(row => row.label.startsWith(WILLAMETTE)),
    REPORT_1099_TOTALS.willamette
)

// --- The seed rows of the 1099 report (plan D5); `seedForm1099` in seed.ts writes them. ---

// No test file and no other fixture names this day.
const SEED_1099_DAY = '2026-09-23'

// A line as the seed sends it: `account` holds a seed account number, which the seed maps
// to the created account; a blank `vendor` names no vendor.
type Seed1099Line = Pick<BooksJournalLines, 'account' | 'debit' | 'credit' | 'vendor'>
type Seed1099ExpenseLine = Pick<BooksExpenseLines, 'kind' | 'account' | 'amount' | 'description'>

// One posted journal entry that gives the 1099 vendors their payments by box: Jamal Okafor
// on NEC 1 (6210), MISC 1 (6100) and no box (6200); Greenline Landscaping below the
// threshold; the inactive Old Town Print Shop exactly at it; the untracked Metro Commercial
// Properties on a boxed account. The credits and the 2100 debit take the amounts back out,
// so with the card expense below every account's balance is as it was before the rows.
const SEED_1099_ENTRY = {
    date: SEED_1099_DAY,
    memo: 'Seed 1099: payments by box',
    lines: [
        { account: '6210', debit: 240_000, credit: 0, vendor: vendor(OKAFOR).id },
        { account: '6100', debit: 65_000, credit: 0, vendor: vendor(OKAFOR).id },
        { account: '6200', debit: 31_000, credit: 0, vendor: vendor(OKAFOR).id },
        { account: '6210', debit: 125_000, credit: 0, vendor: vendor(GREENLINE).id },
        { account: '6210', debit: 200_000, credit: 0, vendor: vendor(OLD_TOWN).id },
        { account: '6100', debit: 90_000, credit: 0, vendor: vendor(METRO).id },
        { account: '2100', debit: 48_000, credit: 0, vendor: '' },
        { account: '6210', debit: 0, credit: 613_000, vendor: '' },
        { account: '6100', debit: 0, credit: 155_000, vendor: '' },
        { account: '6200', debit: 0, credit: 31_000, vendor: '' },
    ] satisfies Seed1099Line[],
} satisfies Pick<BooksJournalEntries, 'date' | 'memo'> & { lines: Seed1099Line[] }

// One posted expense of Jamal Okafor by credit card from the seeded card account 2100, with
// one account line on 6210. `paid_from` and the line's `account` hold seed account numbers.
// `card_payment` is the mark the server sets on its entry when it posts it.
const SEED_1099_CARD_EXPENSE = {
    date: SEED_1099_DAY,
    vendor: vendor(OKAFOR).id,
    paid_from: '2100',
    payment_method: 'credit_card',
    card_payment: true,
    lines: [
        {
            kind: 'account',
            account: '6210',
            amount: 48_000,
            description: 'Seed 1099: design software by card',
        },
    ] satisfies Seed1099ExpenseLine[],
} satisfies Pick<BooksExpenses, 'date' | 'vendor' | 'paid_from' | 'payment_method'> & {
    card_payment: BooksJournalEntries['card_payment']
    lines: Seed1099ExpenseLine[]
}

export const REPORT_1099_SEED = {
    entry: SEED_1099_ENTRY,
    cardExpense: SEED_1099_CARD_EXPENSE,
}

const seedNet = (number: string) =>
    SEED_1099_ENTRY.lines
        .filter(line => line.account === number)
        .reduce((sum, line) => sum + line.debit - line.credit, 0) +
    SEED_1099_CARD_EXPENSE.lines
        .filter(line => line.account === number)
        .reduce((sum, line) => sum + line.amount, 0) -
    (SEED_1099_CARD_EXPENSE.paid_from === number
        ? SEED_1099_CARD_EXPENSE.lines.reduce((sum, line) => sum + line.amount, 0)
        : 0)
for (const number of ['6210', '6100', '6200', '2100']) {
    if (seedNet(number) !== 0) {
        throw new Error(`report-1099 fixture: the seed rows move the balance of ${number}`)
    }
}
