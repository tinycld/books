// Synthetic Audit Log for the helix reference route and, later, the e2e seed. The
// rows are what the `books_audit_log` view (spec §5) lists over core's audit_logs:
// one per create, update or delete of a Books record, newest first, over three days
// and four people (System and an offboarded person included), every event, long
// record names and line rows. The run results are typed against core's report
// contract, so tsc checks every field. Money in `changes` is integer cents.
//
// The reader is in Central Time (America/Chicago, UTC-6 in November): every
// instant below is UTC, and its text is the reader's local day and time. A row at
// 6:02 PM on Nov 13 is stored on Nov 14 UTC, which is the case core T2 compares in
// the reader's zone.
import type { DisplayLayout, ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type {
    CellValue,
    ParamOptionsPage,
    ResolvedParam,
    ResultColumn,
    ResultRow,
    RunResult,
    SelectOption,
} from '@tinycld/core/reports/lib/types'

export const AUDIT_LOG_SHIPPED_KEY = 'books.audit_log'
export const AUDIT_LOG_TITLE = 'Audit Log'
export const AUDIT_LOG_DESCRIPTION =
    'Every change people made to Books records: when, who and what.'
// The Books source heading: the seeded business name (books-settings-fixture.ts).
export const AUDIT_LOG_HEADING = 'Hartwell Supply Co.'
// "Today" for the reference captures, so the default This month resolves to November.
export const AUDIT_LOG_TODAY = '2026-11-14'
export const AUDIT_LOG_FROM = '2026-11-01'
export const AUDIT_LOG_TO = '2026-11-30'
export const AUDIT_LOG_TIME_ZONE = 'America/Chicago'
// The document header's zone line (core T1).
export const AUDIT_LOG_ZONE_WORDS = 'Times in Central Time'

// --- The view row. ---

export type AuditEvent = 'added' | 'changed' | 'posted' | 'voided' | 'deleted'

/** One changed field, as core's audit ComputeDiff writes it. */
export type AuditFieldChange =
    | { before: CellValue; after: CellValue }
    | { before: '[redacted]'; after: '[redacted]'; redacted: true }

/**
 * A row of the `books_audit_log` view (spec §5). Local until the migration
 * checkpoint adds the view: that checkpoint replaces this interface with the
 * generated `BooksAuditLog` record type from `../types`.
 */
export interface AuditLogRow {
    id: string
    /** The instant of the change, as PocketBase stores a date-time (UTC). */
    created: string
    /** The person's user id, or 'system'. */
    actor: string
    actor_name: string
    event: AuditEvent
    record_type: string
    record_id: string
    record_label: string
    changes: Record<string, AuditFieldChange> | null
    snapshot: Record<string, CellValue> | null
    parent_type: string
    parent_id: string
    history_type: string
    history_id: string
}

// --- Options (the Go source's select options; server/audit.go builds the same). ---

export const AUDIT_EVENT_OPTIONS: SelectOption[] = [
    { value: 'added', label: 'Added' },
    { value: 'changed', label: 'Changed' },
    { value: 'posted', label: 'Posted' },
    { value: 'voided', label: 'Voided' },
    { value: 'deleted', label: 'Deleted' },
]

// In the order of the Record type param: Documents, Lines, Lists, Banking, Settings
// and access (auditRecordTypeOptions in server/audit.go).
export const AUDIT_RECORD_TYPE_OPTIONS: SelectOption[] = [
    { value: 'books_invoices', label: 'Invoice' },
    { value: 'books_sales_receipts', label: 'Sales receipt' },
    { value: 'books_estimates', label: 'Estimate' },
    { value: 'books_estimate_responses', label: 'Estimate response' },
    { value: 'books_bills', label: 'Bill' },
    { value: 'books_expenses', label: 'Expense' },
    { value: 'books_journal_entries', label: 'Journal entry' },
    { value: 'books_invoice_lines', label: 'Invoice line' },
    { value: 'books_sales_receipt_lines', label: 'Sales receipt line' },
    { value: 'books_estimate_lines', label: 'Estimate line' },
    { value: 'books_bill_lines', label: 'Bill line' },
    { value: 'books_expense_lines', label: 'Expense line' },
    { value: 'books_journal_lines', label: 'Journal line' },
    { value: 'books_accounts', label: 'Account' },
    { value: 'books_customers', label: 'Customer' },
    { value: 'books_vendors', label: 'Vendor' },
    { value: 'books_party_contacts', label: 'Contact' },
    { value: 'books_products', label: 'Product or service' },
    { value: 'books_bundle_items', label: 'Bundle item' },
    { value: 'books_tax_agencies', label: 'Tax agency' },
    { value: 'books_tax_rates', label: 'Tax rate' },
    { value: 'books_bank_connections', label: 'Bank connection' },
    { value: 'books_bank_files', label: 'Bank file' },
    { value: 'books_bank_imports', label: 'Bank import' },
    { value: 'books_bank_transactions', label: 'Bank transaction' },
    { value: 'books_settings', label: 'Books settings' },
    { value: 'books_doc_sequences', label: 'Document numbering' },
    { value: 'books_close_overrides', label: 'Close date override' },
    { value: 'books_admins', label: 'Books admin' },
]

export function recordTypeLabel(collection: string): string {
    return AUDIT_RECORD_TYPE_OPTIONS.find(o => o.value === collection)?.label ?? collection
}

// --- The people. ---

export const AUDIT_USERS = {
    dana: { id: 'usrdanawhitfld0', name: 'Dana Whitfield' },
    marco: { id: 'usrmarcoruiz000', name: 'Marco Ruiz' },
    priya: { id: 'usrpriyashah000', name: 'Priya Shah' },
    // An offboarded person reads as core anonymizes them.
    gone: { id: 'usrdeleted00001', name: 'Deleted user' },
    system: { id: 'system', name: 'System' },
} as const

type Who = keyof typeof AUDIT_USERS

// --- The records the rows name. ---

export const AUDIT_RECORDS = {
    invoice: 'bkinvoice001001',
    invoiceLine1: 'bkinvline1001a1',
    invoiceLine2: 'bkinvline1001a2',
    customerGone: 'bkcustriversd01',
    vendor: 'bkvendcascade01',
    product: 'bkprodwapceil01',
    bill: 'bkbill000004471',
    billLine: 'bkbillline44711',
    estimate: 'bkestimate01017',
    estimateResponse: 'bkestresp010171',
    expense: 'bkexpense000077',
    entry42: 'bkjentry0000042',
    entry43: 'bkjentry0000043',
    entryLine: 'bkjline00004201',
    account: 'bkacct000rent01',
    settings: 'bksettings00001',
    sequence: 'bkseqinvoice001',
    taxRate: 'bktaxrate00co01',
    bankTxn: 'bkbanktxn000088',
    contact: 'bkcontact000031',
    admin: 'bkadminmarco001',
} as const

// The current names of related records a Before/After value points at; a related id
// not here reads "Removed record".
export const AUDIT_RELATED_NAMES: Record<string, string> = {
    [AUDIT_USERS.dana.id]: AUDIT_USERS.dana.name,
    [AUDIT_USERS.marco.id]: AUDIT_USERS.marco.name,
    [AUDIT_USERS.priya.id]: AUDIT_USERS.priya.name,
    bkcust000northw: 'Northwind Traders',
    bkprodnetwork01:
        'On-site network troubleshooting, two-hour minimum with travel inside the Portland metro area',
    bkprodconsult01: 'Initial consultation',
    bkacct00checkng: '1000 Business Checking',
}

// --- Time. ---

const CENTRAL_OFFSET_HOURS = 6

/** The UTC instant of a Central Time day and time, as PocketBase stores a date-time. */
function central(day: string, hour: number, minute: number): string {
    const [y, m, d] = day.split('-').map(Number)
    const ms = Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, hour + CENTRAL_OFFSET_HOURS, minute)
    return new Date(ms).toISOString().replace('T', ' ')
}

/**
 * The reader's day and time to the minute ("Nov 14, 2026, 4:07 PM"). Stand-in for
 * core T1's `dateTimeText`, which checkpoint 0 adds; the route and the history
 * screen then read core's.
 */
export function auditDateTimeText(instant: string): string {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: AUDIT_LOG_TIME_ZONE,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(new Date(instant.replace(' ', 'T')))
}

// --- The rows, newest first. ---

interface RowInput {
    n: number
    day: string
    at: [number, number]
    who: Who
    event: AuditEvent
    type: string
    record: string
    label: string
    parent?: { type: string; id: string }
    changes?: Record<string, AuditFieldChange>
    snapshot?: Record<string, CellValue>
}

function auditRow(input: RowInput): AuditLogRow {
    const user = AUDIT_USERS[input.who]
    const parent = input.parent ?? { type: '', id: '' }
    return {
        id: `auditlog${String(input.n).padStart(7, '0')}`,
        created: central(input.day, input.at[0], input.at[1]),
        actor: user.id,
        actor_name: user.name,
        event: input.event,
        record_type: input.type,
        record_id: input.record,
        record_label: input.label,
        changes: input.changes ?? null,
        snapshot: input.snapshot ?? null,
        parent_type: parent.type,
        parent_id: parent.id,
        history_type: parent.type || input.type,
        history_id: parent.id || input.record,
    } satisfies AuditLogRow
}

const R = AUDIT_RECORDS
const INVOICE = { type: 'books_invoices', id: R.invoice }
const BILL = { type: 'books_bills', id: R.bill }
const ESTIMATE = { type: 'books_estimates', id: R.estimate }
const ENTRY_42 = { type: 'books_journal_entries', id: R.entry42 }
const D14 = '2026-11-14'
const D13 = '2026-11-13'
const D12 = '2026-11-12'
const HIDDEN: AuditFieldChange = { before: '[redacted]', after: '[redacted]', redacted: true }
const LONG_PRODUCT =
    'Wireless access point, ceiling mount, PoE powered (dual band) with a five-year on-site replacement warranty'

export const AUDIT_LOG_ROWS: AuditLogRow[] = [
    auditRow({
        n: 30,
        day: D14,
        at: [16, 7],
        who: 'marco',
        event: 'voided',
        type: 'books_invoices',
        record: R.invoice,
        label: 'Invoice 1001',
        changes: {
            status: { before: 'posted', after: 'void' },
            voided_by: { before: '', after: AUDIT_USERS.marco.id },
        },
    }),
    auditRow({
        n: 29,
        day: D14,
        at: [15, 52],
        who: 'marco',
        event: 'changed',
        type: 'books_invoice_lines',
        record: R.invoiceLine2,
        label: 'Invoice 1001: line 2',
        parent: INVOICE,
        changes: {
            quantity: { before: 2, after: 3 },
            amount: { before: 24000, after: 36000 },
        },
    }),
    auditRow({
        n: 28,
        day: D14,
        at: [15, 50],
        who: 'priya',
        event: 'posted',
        type: 'books_invoices',
        record: R.invoice,
        label: 'Invoice 1001',
        changes: {
            status: { before: 'draft', after: 'posted' },
            number: { before: '', after: '1001' },
            posted_by: { before: '', after: AUDIT_USERS.priya.id },
            sort_key: HIDDEN,
        },
    }),
    auditRow({
        n: 27,
        day: D14,
        at: [15, 46],
        who: 'priya',
        event: 'changed',
        type: 'books_invoices',
        record: R.invoice,
        label: 'Draft invoice',
        changes: {
            memo: {
                before: '',
                after: 'Network install for the new Lakeview office, second floor east wing',
            },
            due_date: { before: '2026-12-14', after: '2026-12-29' },
            terms: { before: 'net_30', after: 'net_60' },
        },
    }),
    auditRow({
        n: 26,
        day: D14,
        at: [15, 31],
        who: 'priya',
        event: 'added',
        type: 'books_invoice_lines',
        record: R.invoiceLine2,
        label: 'Draft invoice: line 2',
        parent: INVOICE,
    }),
    auditRow({
        n: 25,
        day: D14,
        at: [15, 31],
        who: 'priya',
        event: 'added',
        type: 'books_invoice_lines',
        record: R.invoiceLine1,
        label: 'Draft invoice: line 1',
        parent: INVOICE,
    }),
    auditRow({
        n: 24,
        day: D14,
        at: [15, 30],
        who: 'priya',
        event: 'added',
        type: 'books_invoices',
        record: R.invoice,
        label: 'Draft invoice',
    }),
    auditRow({
        n: 23,
        day: D14,
        at: [11, 18],
        who: 'dana',
        event: 'changed',
        type: 'books_settings',
        record: R.settings,
        label: 'Books settings',
        changes: {
            close_date: { before: '2026-06-30', after: '2026-09-30' },
            tax_id: HIDDEN,
        },
    }),
    auditRow({
        n: 22,
        day: D14,
        at: [10, 2],
        who: 'marco',
        event: 'changed',
        type: 'books_tax_rates',
        record: R.taxRate,
        label: 'Colorado state',
        changes: { rate_ppm: { before: 29000, after: 29500 } },
    }),
    auditRow({
        n: 21,
        day: D14,
        at: [9, 15],
        who: 'priya',
        event: 'posted',
        type: 'books_bills',
        record: R.bill,
        label: 'Bill 4471',
        changes: { status: { before: 'draft', after: 'posted' } },
    }),
    auditRow({
        n: 20,
        day: D14,
        at: [9, 12],
        who: 'priya',
        event: 'added',
        type: 'books_bill_lines',
        record: R.billLine,
        label: 'Draft bill: line 1',
        parent: BILL,
    }),
    auditRow({
        n: 19,
        day: D14,
        at: [9, 12],
        who: 'priya',
        event: 'added',
        type: 'books_bills',
        record: R.bill,
        label: 'Draft bill',
    }),
    auditRow({
        n: 18,
        day: D14,
        at: [0, 0],
        who: 'system',
        event: 'added',
        type: 'books_journal_entries',
        record: R.entry43,
        label: 'Journal entry JE-43',
    }),
    auditRow({
        n: 17,
        day: D13,
        at: [18, 2],
        who: 'priya',
        event: 'added',
        type: 'books_products',
        record: R.product,
        label: LONG_PRODUCT,
    }),
    auditRow({
        n: 16,
        day: D13,
        at: [16, 40],
        who: 'marco',
        event: 'changed',
        type: 'books_bank_transactions',
        record: R.bankTxn,
        label: 'COSTCO WHOLESALE #1182 GRAND JUNCTION CO 11/12 PURCHASE',
        changes: { status: { before: 'for_review', after: 'excluded' } },
    }),
    auditRow({
        n: 15,
        day: D13,
        at: [14, 15],
        who: 'priya',
        event: 'deleted',
        type: 'books_customers',
        record: R.customerGone,
        label: 'Riverside Yoga Studio',
        snapshot: {
            display_name: 'Riverside Yoga Studio',
            company: 'Riverside Yoga Studio LLC',
            email: 'frontdesk@riversideyoga.example',
            phone: '(503) 555-0144',
            parent: 'bkcust000gone01',
            inactive: false,
            terms: 'net_15',
            sort_key: '[redacted]',
        },
    }),
    auditRow({
        n: 14,
        day: D13,
        at: [14, 11],
        who: 'priya',
        event: 'changed',
        type: 'books_vendors',
        record: R.vendor,
        label: 'Cascade Fuel & Fleet',
        changes: {
            phone: { before: '', after: '(503) 555-0186' },
            tax_id: HIDDEN,
            track_1099: { before: false, after: true },
        },
    }),
    auditRow({
        n: 13,
        day: D13,
        at: [13, 5],
        who: 'system',
        event: 'added',
        type: 'books_estimate_responses',
        record: R.estimateResponse,
        label: 'Estimate 1017: accepted',
        parent: ESTIMATE,
    }),
    auditRow({
        n: 12,
        day: D13,
        at: [11, 30],
        who: 'priya',
        event: 'changed',
        type: 'books_estimates',
        record: R.estimate,
        label: 'Estimate 1017',
        changes: { public_token: HIDDEN },
    }),
    auditRow({
        n: 11,
        day: D13,
        at: [10, 44],
        who: 'dana',
        event: 'voided',
        type: 'books_expenses',
        record: R.expense,
        label: 'Expense 77',
        changes: { status: { before: 'posted', after: 'void' } },
    }),
    auditRow({
        n: 10,
        day: D13,
        at: [9, 20],
        who: 'marco',
        event: 'changed',
        type: 'books_journal_lines',
        record: R.entryLine,
        label: '1000 Business Checking credit 1500.00',
        parent: ENTRY_42,
        changes: { credit: { before: 150000, after: 125000 } },
    }),
    auditRow({
        n: 9,
        day: D13,
        at: [9, 19],
        who: 'marco',
        event: 'posted',
        type: 'books_journal_entries',
        record: R.entry42,
        label: 'Journal entry JE-42',
        changes: { status: { before: 'draft', after: 'posted' } },
    }),
    auditRow({
        n: 8,
        day: D12,
        at: [17, 55],
        who: 'dana',
        event: 'added',
        type: 'books_admins',
        record: R.admin,
        label: 'Marco Ruiz',
    }),
    auditRow({
        n: 7,
        day: D12,
        at: [16, 30],
        who: 'priya',
        event: 'changed',
        type: 'books_customers',
        record: R.customerGone,
        label: 'Riverside Yoga Studio',
        changes: {
            phone: { before: '', after: '(503) 555-0144' },
            email: {
                before: 'hello@riversideyoga.example',
                after: 'frontdesk@riversideyoga.example',
            },
            fields: { before: '{}', after: '{"studio_rooms":"3"}' },
        },
    }),
    auditRow({
        n: 6,
        day: D12,
        at: [15, 2],
        who: 'dana',
        event: 'changed',
        type: 'books_accounts',
        record: R.account,
        label: '6100 Rent',
        changes: { name: { before: 'Rent or lease', after: 'Rent' } },
    }),
    auditRow({
        n: 5,
        day: D12,
        at: [14, 47],
        who: 'priya',
        event: 'added',
        type: 'books_customers',
        record: R.customerGone,
        label: 'Riverside Yoga Studio',
    }),
    auditRow({
        n: 4,
        day: D12,
        at: [11, 10],
        who: 'dana',
        event: 'changed',
        type: 'books_doc_sequences',
        record: R.sequence,
        label: 'invoice',
        changes: { next_number: { before: 1000, after: 1001 } },
    }),
    auditRow({
        n: 3,
        day: D12,
        at: [10, 5],
        who: 'marco',
        event: 'deleted',
        type: 'books_party_contacts',
        record: R.contact,
        label: 'Alicia Fernández-Whitaker',
        snapshot: { name: 'Alicia Fernández-Whitaker', email: 'alicia@northwind.example' },
    }),
    auditRow({
        n: 2,
        day: D12,
        at: [9, 40],
        who: 'priya',
        event: 'added',
        type: 'books_vendors',
        record: R.vendor,
        label: 'Cascade Fuel & Fleet',
    }),
    auditRow({
        n: 1,
        day: D12,
        at: [8, 58],
        who: 'gone',
        event: 'changed',
        type: 'books_products',
        record: 'bkprodconsult01',
        label: 'Initial consultation',
        changes: { rate: { before: 12500, after: 15000 } },
    }),
]

// --- The report: params, columns, display. ---

// The params as the shipped spec declares them (server/report_audit_log.go builds
// the same list in Go; its test pins the Go side).
export const AUDIT_LOG_PARAMS: ParamDef[] = [
    { id: 'period', type: 'dateRange', label: 'Date changed', default: { preset: 'thisMonth' } },
    {
        id: 'users',
        type: 'choice',
        label: 'User',
        multiple: true,
        optionsFrom: {
            source: AUDIT_LOG_SHIPPED_KEY,
            value: [{ field: 'actor' }],
            label: [{ field: 'actor_name' }],
        },
    },
    { id: 'events', type: 'choice', label: 'Event', multiple: true, options: AUDIT_EVENT_OPTIONS },
    {
        id: 'types',
        type: 'choice',
        label: 'Record type',
        multiple: true,
        options: AUDIT_RECORD_TYPE_OPTIONS,
    },
]

export const AUDIT_LOG_COLUMNS: ResultColumn[] = [
    { id: 'created', label: 'Date changed', type: 'datetime', sortable: true },
    { id: 'user', label: 'User', type: 'text', sortable: true },
    { id: 'event', label: 'Event', type: 'select', options: AUDIT_EVENT_OPTIONS, sortable: true },
    {
        id: 'type',
        label: 'Record type',
        type: 'select',
        options: AUDIT_RECORD_TYPE_OPTIONS,
        sortable: true,
    },
    { id: 'record', label: 'Record', type: 'text', sortable: true },
]

// Spec §3 Phone and the panel: a row wraps to two lines, date changed · event; user ·
// record type · record. Line 2 fits core's 374 px phone row only because User and
// Record type keep core's automatic least width (phase 3 pass 2: with a 16ch or 12ch
// User min core fell back to automatic lines at 390 and 375).
export const AUDIT_LOG_PHONE_LAYOUT: DisplayLayout = {
    width: 'mobile',
    tracks: 7,
    cells: [
        { col: 'created', line: 1, span: 5 },
        { col: 'event', line: 1, span: 2, justify: 'end' },
        { col: 'user', line: 2, span: 2 },
        { col: 'type', line: 2, span: 2 },
        { col: 'record', line: 2, span: 3 },
    ],
}

// A tablet row keeps who and what on the date's line and the record's name below.
export const AUDIT_LOG_TABLET_LAYOUT: DisplayLayout = {
    width: 'tablet',
    minWidth: '600px',
    tracks: 12,
    cells: [
        { col: 'created', line: 1, span: 4 },
        { col: 'user', line: 1, span: 3 },
        { col: 'event', line: 1, span: 2 },
        { col: 'type', line: 1, span: 3 },
        { col: 'record', line: 2, span: 12 },
    ],
}

// The one line is tried only from this row width (phase 3 pass 2 measure, ledger).
export const AUDIT_LOG_ONE_LINE_MIN_WIDTH = '760px'

export const AUDIT_LOG_DISPLAY: NonNullable<ReportSpec['display']> = {
    oneLine: { minWidth: AUDIT_LOG_ONE_LINE_MIN_WIDTH },
    columns: {
        created: { minWidth: 'max-content' },
        event: { minWidth: 'max-content' },
        record: { flexGrow: 2, whiteSpace: 'normal', lineClamp: 2, textOverflow: 'ellipsis' },
    },
    layouts: [AUDIT_LOG_PHONE_LAYOUT, AUDIT_LOG_TABLET_LAYOUT],
}

/** What the view reads of the spec: a flat report. */
export const AUDIT_LOG_VIEW_SPEC = { columns: [], display: AUDIT_LOG_DISPLAY }

// --- Run results. ---

function detailRow(row: AuditLogRow): ResultRow {
    return {
        id: `d:${row.id}`,
        kind: 'detail',
        depth: 0,
        // Core T1 writes a date-time label in the reader's zone; until then the
        // fixture writes the text itself.
        label: auditDateTimeText(row.created),
        open: `books/history/${row.history_type}/${row.history_id}`,
        cells: {
            created: row.created,
            user: row.actor_name,
            event: row.event,
            type: row.record_type,
            record: row.record_label,
        },
    }
}

export interface AuditLogFilter {
    users?: string[]
    events?: AuditEvent[]
    types?: string[]
    from?: string
    to?: string
}

function choiceParam(id: string, list: readonly string[] | undefined): ResolvedParam {
    return list ? { id, type: 'choice', list: [...list] } : { id, type: 'choice', unset: true }
}

function resolvedParams(filter: AuditLogFilter): ResolvedParam[] {
    return [
        {
            id: 'period',
            type: 'dateRange',
            from: filter.from ?? AUDIT_LOG_FROM,
            to: filter.to ?? AUDIT_LOG_TO,
        },
        choiceParam('users', filter.users),
        choiceParam('events', filter.events),
        choiceParam('types', filter.types),
    ]
}

function isKept(row: AuditLogRow, filter: AuditLogFilter): boolean {
    if (filter.users && !filter.users.includes(row.actor)) return false
    if (filter.events && !filter.events.includes(row.event)) return false
    return !filter.types || filter.types.includes(row.record_type)
}

const AUDIT_LOG_TOPICS = ['collection/books_audit_log', 'collection/books_settings']

export function auditLogResult(filter: AuditLogFilter = {}): RunResult {
    return {
        columns: AUDIT_LOG_COLUMNS,
        rows: AUDIT_LOG_ROWS.filter(row => isKept(row, filter)).map(detailRow),
        notices: [],
        topics: AUDIT_LOG_TOPICS,
        heading: AUDIT_LOG_HEADING,
        page: null,
        params: resolvedParams(filter),
    }
}

/** A run over a month with no change: no rows, so the view is empty. */
export function emptyAuditLogResult(from: string, to: string): RunResult {
    return { ...auditLogResult({ from, to }), rows: [] }
}

// The User picker's first page, as POST /api/reports/param-options answers it: the
// people who appear in the log, by name A–Z.
export const AUDIT_USER_OPTIONS_PAGE: ParamOptionsPage = {
    options: [
        AUDIT_USERS.dana,
        AUDIT_USERS.gone,
        AUDIT_USERS.marco,
        AUDIT_USERS.priya,
        AUDIT_USERS.system,
    ].map(user => ({ value: user.id, label: user.name })),
    groups: [],
}

// --- Record history. ---

/** A record's history: its own rows and its lines' rows, newest first (spec §5 Client). */
export function recordHistoryRows(collection: string, id: string): AuditLogRow[] {
    return AUDIT_LOG_ROWS.filter(
        row =>
            (row.record_type === collection && row.record_id === id) ||
            (row.parent_type === collection && row.parent_id === id)
    )
}
